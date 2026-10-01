import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClockFalso } from '../../../../test/fakes/clock-falso.js';
import { CargadorPrompts } from '../infraestructura/prompts/cargador-prompts.js';
import type { EstiloGuardado, RepositorioEstilo, VersionHistorial } from '../puertos/repositorio-estilo.js';
import type { VersionEstilo } from '../puertos/version-estilo.js';
import { ProveedorEstilo } from './proveedor-estilo.js';

// Escenarios AGT18 y AGT19 de `openspec/changes/fase-08c-prompts-en-base-de-datos/specs/agente/spec.md`.

class RepositorioEstiloFalso implements RepositorioEstilo {
  lecturas = 0;
  constructor(public vigente: EstiloGuardado | null = null) {}
  leerVigente(): Promise<EstiloGuardado | null> {
    this.lecturas += 1;
    return Promise.resolve(this.vigente);
  }
  leerHistorial(): Promise<readonly VersionHistorial[]> {
    throw new Error('no usado por ProveedorEstilo');
  }
  publicar(): Promise<number> {
    throw new Error('no usado por ProveedorEstilo');
  }
}

class VersionEstiloFalsa implements VersionEstilo {
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

function crear(vigente: EstiloGuardado | null = null) {
  const cargador = new CargadorPrompts();
  cargador.onModuleInit();
  const repositorio = new RepositorioEstiloFalso(vigente);
  const version = new VersionEstiloFalsa();
  const clock = new ClockFalso(new Date('2026-10-01T12:00:00Z'));
  return { proveedor: new ProveedorEstilo(repositorio, version, clock, cargador), repositorio, version, clock, cargador };
}

describe('agente/aplicacion — ProveedorEstilo (AGT18, AGT19)', () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('AGT18 — Un estilo publicado reemplaza al del archivo', async () => {
    const { proveedor, cargador } = crear({ texto: 'ESTILO-PUBLICADO', version: 3 });

    const estilo = await proveedor.obtener();

    expect(estilo).toEqual({ texto: 'ESTILO-PUBLICADO', version: 3, origen: 'base' });
    expect(estilo.texto).not.toBe(cargador.estilo);
  });

  it('AGT18 — Sin estilo publicado rige el archivo', async () => {
    const { proveedor, cargador } = crear(null);

    const estilo = await proveedor.obtener();

    expect(estilo).toEqual({ texto: cargador.estilo, version: 0, origen: 'archivo' });
  });

  it('AGT18 — Un valor en blanco cae al respaldo (defensa del proveedor)', async () => {
    const { proveedor, cargador } = crear({ texto: '   \n', version: 2 });

    expect((await proveedor.obtener()).texto).toBe(cargador.estilo);
  });

  it('si la base falla, rige el archivo y el turno no se cae', async () => {
    const { proveedor, repositorio, cargador } = crear();
    repositorio.leerVigente = () => Promise.reject(new Error('base caída'));

    await expect(proveedor.obtener()).resolves.toMatchObject({ texto: cargador.estilo, origen: 'archivo' });
  });

  it('AGT19 — Una lectura repetida no consulta la base mientras la versión no cambia', async () => {
    const { proveedor, repositorio } = crear({ texto: 'E1', version: 1 });

    await proveedor.obtener();
    await proveedor.obtener();
    await proveedor.obtener();

    expect(repositorio.lecturas).toBe(1);
  });

  it('AGT19 — Publicar un estilo hace que el siguiente turno lo use', async () => {
    const { proveedor, repositorio, version } = crear({ texto: 'E1', version: 1 });
    await proveedor.obtener();

    repositorio.vigente = { texto: 'E2', version: 2 };
    await version.incrementar();

    expect(await proveedor.obtener()).toEqual({ texto: 'E2', version: 2, origen: 'base' });
    expect(repositorio.lecturas).toBe(2);
  });

  it('AGT19 — Si Redis falla el turno sigue con el estilo de la base', async () => {
    const { proveedor, repositorio, version } = crear({ texto: 'E1', version: 1 });
    version.falla = true;

    expect(await proveedor.obtener()).toEqual({ texto: 'E1', version: 1, origen: 'base' });
    // Sin versión confiable no hay copia: la siguiente llamada vuelve a leer la base.
    await proveedor.obtener();
    expect(repositorio.lecturas).toBe(2);
  });

  it('la copia expira a los 5 minutos aunque la versión no haya cambiado', async () => {
    const { proveedor, repositorio, clock } = crear({ texto: 'E1', version: 1 });
    await proveedor.obtener();

    clock.avanzar(5 * 60_000 - 1);
    await proveedor.obtener();
    expect(repositorio.lecturas).toBe(1);

    clock.avanzar(2);
    await proveedor.obtener();
    expect(repositorio.lecturas).toBe(2);
  });

  it('el estilo del archivo también se guarda en la copia mientras no cambie la versión', async () => {
    const { proveedor, repositorio } = crear(null);

    await proveedor.obtener();
    await proveedor.obtener();

    expect(repositorio.lecturas).toBe(1);
  });
});
