import { describe, expect, it, vi } from 'vitest';
import { ClockFalso } from '../../../../test/fakes/clock-falso.js';
import type { VersionEstilo } from '../puertos/version-estilo.js';
import type { RepositorioSeccionesEstilo, SeccionEstilo } from '../puertos/repositorio-secciones-estilo.js';
import { AdministrarSeccionesEstilo } from './administrar-secciones-estilo.js';

const AHORA = new Date('2026-10-07T10:00:00Z');
const SECCION: SeccionEstilo = { id: 'a', titulo: 'Saludo', texto: 'Hola.', orden: 0, activo: true, creado: AHORA, actualizado: AHORA };

function armar(version: number | null = 3) {
  const repositorio = {
    listar: vi.fn().mockResolvedValue([SECCION]),
    crear: vi.fn().mockResolvedValue({ ok: true, valor: SECCION, version }),
    editar: vi.fn().mockResolvedValue({ ok: true, valor: SECCION, version }),
    reordenar: vi.fn().mockResolvedValue({ ok: true, valor: [SECCION], version }),
  } satisfies RepositorioSeccionesEstilo;
  const compartida = { obtener: vi.fn().mockResolvedValue('0'), incrementar: vi.fn().mockResolvedValue(undefined) } satisfies VersionEstilo;
  return { repositorio, compartida, caso: new AdministrarSeccionesEstilo(repositorio, compartida, new ClockFalso(AHORA)) };
}

describe('AdministrarSeccionesEstilo (EST-S4)', () => {
  it('EST-S4 — Crear valida la sección, normaliza el título y sube la versión compartida', async () => {
    const { repositorio, compartida, caso } = armar();

    const resultado = await caso.crear({ titulo: '  Cómo Cierras ', texto: 'Cierra con una pregunta.', activo: true }, { id: 'u', nombre: 'Ana' });

    expect(resultado).toEqual({ ok: true, valor: SECCION, version: 3 });
    expect(repositorio.crear).toHaveBeenCalledWith(
      { titulo: 'Cómo Cierras', tituloNormalizado: 'como cierras', texto: 'Cierra con una pregunta.', activo: true },
      AHORA,
      { id: 'u', nombre: 'Ana' },
    );
    expect(compartida.incrementar).toHaveBeenCalledTimes(1);
  });

  it('EST-S4 — Una sección inválida se rechaza sin tocar la base ni la versión compartida', async () => {
    const { repositorio, compartida, caso } = armar();

    const resultado = await caso.crear({ titulo: 'Precios', texto: 'Cuesta $389.000', activo: true });

    expect(resultado).toMatchObject({ ok: false, razon: 'invalido' });
    expect(JSON.stringify(resultado)).not.toContain('389');
    expect(repositorio.crear).not.toHaveBeenCalled();
    expect(compartida.incrementar).not.toHaveBeenCalled();
  });

  it('EST-S4 — Si el estilo compuesto no cambió (versión null) no sube la versión compartida', async () => {
    const { compartida, caso } = armar(null);

    await expect(caso.editar('a', { titulo: 'Saludo', texto: 'Hola.', activo: true }, AHORA)).resolves.toMatchObject({ ok: true, version: null });
    expect(compartida.incrementar).not.toHaveBeenCalled();
  });

  it('EST-S4 — Un rechazo del repositorio (modificado, duplicada, inválido el compuesto) se devuelve y no sube la versión', async () => {
    const { repositorio, compartida, caso } = armar();
    repositorio.editar.mockResolvedValueOnce({ ok: false, razon: 'modificado' });
    repositorio.reordenar.mockResolvedValueOnce({ ok: false, razon: 'invalido', motivo: 'el estilo supera 4000 caracteres' });

    await expect(caso.editar('a', { titulo: 'Saludo', texto: 'Hola.', activo: true }, AHORA)).resolves.toEqual({ ok: false, razon: 'modificado' });
    await expect(caso.reordenar(['a'])).resolves.toMatchObject({ ok: false, razon: 'invalido' });
    expect(compartida.incrementar).not.toHaveBeenCalled();
  });

  it('EST-S4 — Si Redis falla tras confirmar la base, el cambio ya está hecho y el resultado es éxito', async () => {
    const { compartida, caso } = armar();
    compartida.incrementar.mockRejectedValueOnce(new Error('redis caído'));

    await expect(caso.reordenar(['a'])).resolves.toMatchObject({ ok: true, version: 3 });
  });

  it('EST-S4 — Listar entrega las secciones del repositorio', async () => {
    const { caso } = armar();

    await expect(caso.listar()).resolves.toEqual([SECCION]);
  });
});
