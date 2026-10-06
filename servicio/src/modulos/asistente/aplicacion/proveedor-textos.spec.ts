import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClockFalso } from '../../../../test/fakes/clock-falso.js';
import { textoDeRespaldo } from '../dominio/sistema.js';
import type { RepositorioCasos } from '../puertos/repositorio-casos.js';
import type { VersionAsistente } from '../puertos/version-asistente.js';
import { ProveedorTextos } from './proveedor-textos.js';

// CAS7 (Fase 12, T4): el texto de un caso del sistema, con copia por versión compartida y respaldo del código.

class RepositorioCasosFalso implements RepositorioCasos {
  lecturas = 0;
  falla = false;
  constructor(public textos: Record<string, string> = {}) {}
  leerTextosDelSistema(): Promise<ReadonlyMap<string, string>> {
    this.lecturas += 1;
    return this.falla ? Promise.reject(new Error('base caída')) : Promise.resolve(new Map(Object.entries(this.textos)));
  }
}

class VersionAsistenteFalsa implements VersionAsistente {
  valor = '0';
  falla = false;
  obtener(): Promise<string> {
    return this.falla ? Promise.reject(new Error('redis caído')) : Promise.resolve(this.valor);
  }
  incrementar(): Promise<void> {
    this.valor = String(Number(this.valor) + 1);
    return Promise.resolve();
  }
}

function espiarAvisos() {
  return vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
}

function crear(textos: Record<string, string> = {}) {
  const repositorio = new RepositorioCasosFalso(textos);
  const version = new VersionAsistenteFalsa();
  const clock = new ClockFalso(new Date('2026-10-06T12:00:00Z'));
  return { proveedor: new ProveedorTextos(repositorio, version, clock), repositorio, version, clock };
}

describe('asistente/aplicacion — ProveedorTextos (CAS7)', () => {
  let avisos: ReturnType<typeof espiarAvisos>;

  beforeEach(() => {
    avisos = espiarAvisos();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('el texto del caso guardado es el que se entrega', async () => {
    const { proveedor } = crear({ mensaje_handoff: 'TEXTO-PROPIO-DEL-NEGOCIO' });

    expect(await proveedor.textoDelSistema('mensaje_handoff')).toBe('TEXTO-PROPIO-DEL-NEGOCIO');
  });

  it('CAS7 — Un caso sin fila usa el respaldo', async () => {
    const { proveedor } = crear({});

    expect(await proveedor.textoDelSistema('mensaje_handoff')).toBe(textoDeRespaldo('mensaje_handoff'));
  });

  it('CAS7 — Un texto en blanco cae al respaldo', async () => {
    const { proveedor } = crear({ aviso_datos: '  \n ' });

    expect(await proveedor.textoDelSistema('aviso_datos')).toBe(textoDeRespaldo('aviso_datos'));
  });

  it('CAS7 — Una base caída usa el respaldo, no rompe el turno y avisa sin contenido', async () => {
    const { proveedor, repositorio } = crear({ mensaje_handoff: 'TEXTO-CONFIDENCIAL' });
    repositorio.falla = true;

    await expect(proveedor.textoDelSistema('mensaje_handoff')).resolves.toBe(textoDeRespaldo('mensaje_handoff'));

    expect(avisos).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(avisos.mock.calls)).not.toContain('TEXTO-CONFIDENCIAL');
  });

  it('CAS7 — Sin Redis se lee la base y no se guarda una copia en memoria', async () => {
    const { proveedor, repositorio, version } = crear({ mensaje_handoff: 'T1' });
    version.falla = true;

    expect(await proveedor.textoDelSistema('mensaje_handoff')).toBe('T1');
    await proveedor.textoDelSistema('mensaje_handoff');

    expect(repositorio.lecturas).toBe(2);
  });

  it('CAS7 — Una lectura repetida no consulta la base mientras la versión no cambia', async () => {
    const { proveedor, repositorio } = crear({ mensaje_handoff: 'T1' });

    await proveedor.textoDelSistema('mensaje_handoff');
    await proveedor.textoDelSistema('aviso_datos');
    await proveedor.textoDelSistema('mensaje_handoff');

    expect(repositorio.lecturas).toBe(1);
  });

  it('CAS7 — Editar un caso y subir la versión hace que el siguiente mensaje use el texto nuevo', async () => {
    const { proveedor, repositorio, version } = crear({ mensaje_pedir_texto_audio: 'Antes' });
    expect(await proveedor.textoDelSistema('mensaje_pedir_texto_audio')).toBe('Antes');

    repositorio.textos = { mensaje_pedir_texto_audio: 'Después' };
    await version.incrementar();

    expect(await proveedor.textoDelSistema('mensaje_pedir_texto_audio')).toBe('Después');
    expect(repositorio.lecturas).toBe(2);
  });

  it('la copia expira a los 5 minutos aunque la versión no haya cambiado', async () => {
    const { proveedor, repositorio, clock } = crear({ mensaje_handoff: 'T1' });
    await proveedor.textoDelSistema('mensaje_handoff');

    clock.avanzar(5 * 60_000 - 1);
    await proveedor.textoDelSistema('mensaje_handoff');
    expect(repositorio.lecturas).toBe(1);

    clock.avanzar(2);
    await proveedor.textoDelSistema('mensaje_handoff');
    expect(repositorio.lecturas).toBe(2);
  });

  it('una lectura fallida no queda en la copia: la siguiente vuelve a intentar la base', async () => {
    const { proveedor, repositorio } = crear({ mensaje_handoff: 'T1' });
    repositorio.falla = true;
    await proveedor.textoDelSistema('mensaje_handoff');

    repositorio.falla = false;

    expect(await proveedor.textoDelSistema('mensaje_handoff')).toBe('T1');
  });
});
