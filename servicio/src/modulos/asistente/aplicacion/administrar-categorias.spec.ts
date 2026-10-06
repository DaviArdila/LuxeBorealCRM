import { describe, expect, it } from 'vitest';
import { ClockFalso } from '../../../../test/fakes/clock-falso.js';
import { RepositorioAdministracionEnMemoria } from '../../../../test/fakes/repositorio-administracion-en-memoria.js';
import type { VersionAsistente } from '../puertos/version-asistente.js';
import { AdministrarCategorias } from './administrar-categorias.js';

// CAS2 (Fase 12, T7): crear, renombrar, ordenar y borrar categorías; cada escritura sube la versión compartida (CAS7).

class VersionFalsa implements VersionAsistente {
  incrementos = 0;
  falla = false;
  obtener(): Promise<string> {
    return Promise.resolve(String(this.incrementos));
  }
  incrementar(): Promise<void> {
    if (this.falla) return Promise.reject(new Error('redis caído'));
    this.incrementos += 1;
    return Promise.resolve();
  }
}

function crear() {
  const repositorio = new RepositorioAdministracionEnMemoria();
  const version = new VersionFalsa();
  const clock = new ClockFalso(new Date('2026-10-06T12:00:00Z'));
  return { admin: new AdministrarCategorias(repositorio, version, clock), repositorio, version };
}

describe('asistente/aplicacion — AdministrarCategorias (CAS2)', () => {
  it('CAS2 — Crear una categoría la deja al final del orden y aparece en el listado', async () => {
    const { admin, repositorio, version } = crear();
    repositorio.sembrarCategoria('Sistema');

    const resultado = await admin.crear('  Pagos  ');

    expect(resultado).toMatchObject({ ok: true, categoria: { nombre: 'Pagos', orden: 1, totalCasos: 0 } });
    expect((await admin.listar()).map((c) => c.nombre)).toEqual(['Sistema', 'Pagos']);
    expect(version.incrementos).toBe(1);
  });

  it('CAS1 — Dos categorías no pueden llamarse igual, sin distinguir mayúsculas ni acentos', async () => {
    const { admin, repositorio, version } = crear();
    // El doble normaliza solo mayúsculas: el caso de uso es quien quita los acentos antes de llamar al repositorio.
    await admin.crear('Políticas');

    const resultado = await admin.crear('politicas');

    expect(resultado).toEqual({ ok: false, razon: 'duplicada' });
    expect(repositorio.categorias).toHaveLength(1);
    expect(version.incrementos).toBe(1);
  });

  it('un nombre vacío o de más de 80 caracteres se rechaza con su motivo', async () => {
    const { admin, version } = crear();

    expect(await admin.crear('   ')).toEqual({ ok: false, razon: 'invalida', motivo: 'el nombre de la categoría está vacío' });
    expect(await admin.crear('a'.repeat(81))).toEqual({ ok: false, razon: 'invalida', motivo: 'el nombre de la categoría supera 80 caracteres' });
    expect(version.incrementos).toBe(0);
  });

  it('CAS2 — Renombrar una categoría conserva sus casos', async () => {
    const { admin, repositorio } = crear();
    const pagos = repositorio.sembrarCategoria('Pagos');
    repositorio.sembrarCaso({ categoriaId: pagos.id, titulo: 'Transferencia' });

    const resultado = await admin.renombrar(pagos.id, 'Medios de pago');

    expect(resultado).toMatchObject({ ok: true, categoria: { nombre: 'Medios de pago', totalCasos: 1 } });
    expect(repositorio.casos[0]?.categoriaId).toBe(pagos.id);
  });

  it('renombrar a un nombre que ya existe o una categoría inexistente se rechaza', async () => {
    const { admin, repositorio } = crear();
    repositorio.sembrarCategoria('Pagos');
    const envios = repositorio.sembrarCategoria('Envíos');

    expect(await admin.renombrar(envios.id, 'pagos')).toEqual({ ok: false, razon: 'duplicada' });
    expect(await admin.renombrar('no-existe', 'Otra')).toEqual({ ok: false, razon: 'inexistente' });
  });

  it('CAS2 — Reordenar las categorías deja el listado en el orden pedido', async () => {
    const { admin, repositorio, version } = crear();
    const a = repositorio.sembrarCategoria('A');
    const b = repositorio.sembrarCategoria('B');
    const c = repositorio.sembrarCategoria('C');

    const resultado = await admin.ordenar([c.id, a.id, b.id]);

    expect(resultado).toMatchObject({ ok: true });
    expect((await admin.listar()).map((x) => x.nombre)).toEqual(['C', 'A', 'B']);
    expect(version.incrementos).toBe(1);
  });

  it('CAS2 — Un orden que no coincide con las categorías existentes se rechaza y no cambia nada', async () => {
    const { admin, repositorio, version } = crear();
    const a = repositorio.sembrarCategoria('A');
    const b = repositorio.sembrarCategoria('B');
    repositorio.sembrarCategoria('C');

    expect(await admin.ordenar([b.id, a.id])).toEqual({ ok: false, razon: 'no-coincide' });
    expect(await admin.ordenar([b.id, a.id, a.id])).toEqual({ ok: false, razon: 'no-coincide' });
    expect((await admin.listar()).map((x) => x.nombre)).toEqual(['A', 'B', 'C']);
    expect(version.incrementos).toBe(0);
  });

  it('CAS2 — Borrar una categoría vacía la quita del listado', async () => {
    const { admin, repositorio, version } = crear();
    const vacia = repositorio.sembrarCategoria('Vacía');

    expect(await admin.borrar(vacia.id)).toEqual({ ok: true });
    expect(await admin.listar()).toEqual([]);
    expect(version.incrementos).toBe(1);
  });

  it('CAS2 — Una categoría con casos no se borra', async () => {
    const { admin, repositorio, version } = crear();
    const politicas = repositorio.sembrarCategoria('Políticas');
    repositorio.sembrarCaso({ categoriaId: politicas.id, titulo: 'Garantía' });

    expect(await admin.borrar(politicas.id)).toEqual({ ok: false, razon: 'con-casos' });
    expect(await admin.borrar('no-existe')).toEqual({ ok: false, razon: 'inexistente' });
    expect(repositorio.categorias).toHaveLength(1);
    expect(version.incrementos).toBe(0);
  });

  it('si Redis falla tras confirmar la base, la operación termina igual', async () => {
    const { admin, version, repositorio } = crear();
    version.falla = true;

    await expect(admin.crear('Pagos')).resolves.toMatchObject({ ok: true });
    expect(repositorio.categorias).toHaveLength(1);
  });
});
