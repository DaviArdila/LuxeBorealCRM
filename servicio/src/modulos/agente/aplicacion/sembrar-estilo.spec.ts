import { describe, expect, it } from 'vitest';
import { ClockFalso } from '../../../../test/fakes/clock-falso.js';
import type { EstiloGuardado, RepositorioEstilo, VersionHistorial } from '../puertos/repositorio-estilo.js';
import type { VersionEstilo } from '../puertos/version-estilo.js';
import { PublicarEstilo } from './publicar-estilo.js';
import { SembrarEstilo } from './sembrar-estilo.js';

// EST-D6: la semilla del estilo inicial solo actúa sobre una base sin ninguna versión; los dobles evitan Postgres y Redis.

class RepositorioEstiloFalso implements RepositorioEstilo {
  publicaciones: { texto: string; autor: unknown }[] = [];
  constructor(
    public vigente: EstiloGuardado | null = null,
    public historial: VersionHistorial[] = [],
  ) {}
  leerVigente(): Promise<EstiloGuardado | null> {
    return Promise.resolve(this.vigente);
  }
  leerHistorial(): Promise<readonly VersionHistorial[]> {
    return Promise.resolve(this.historial);
  }
  publicar(texto: string, _fecha: Date, autor?: unknown): Promise<number> {
    this.publicaciones.push({ texto, autor });
    const version = (this.vigente?.version ?? this.historial[0]?.version ?? 0) + 1;
    this.vigente = { texto, version };
    return Promise.resolve(version);
  }
}

class VersionEstiloFalsa implements VersionEstilo {
  incrementos = 0;
  obtener(): Promise<string> {
    return Promise.resolve(String(this.incrementos));
  }
  incrementar(): Promise<void> {
    this.incrementos += 1;
    return Promise.resolve();
  }
}

const TEXTO = '# Cómo escribes\n\n- Sin emojis.\n- Respuestas cortas.\n';

function crear(repositorio = new RepositorioEstiloFalso()) {
  const version = new VersionEstiloFalsa();
  const publicar = new PublicarEstilo(repositorio, version, new ClockFalso(new Date('2026-10-06T12:00:00Z')));
  return { repositorio, version, sembrar: new SembrarEstilo(repositorio, publicar) };
}

describe('modulos/agente/aplicacion — SembrarEstilo (EST-D6)', () => {
  it('EST-D6 — Sin ninguna versión publica el texto como versión 1, sin autor, y sube la versión compartida', async () => {
    const { repositorio, version, sembrar } = crear();

    await expect(sembrar.ejecutar(TEXTO)).resolves.toEqual({ sembrado: true, version: 1 });

    expect(repositorio.publicaciones).toEqual([{ texto: TEXTO, autor: undefined }]);
    expect(version.incrementos).toBe(1);
  });

  it('EST-D6 — Con un estilo vigente no publica nada', async () => {
    const { repositorio, version, sembrar } = crear(new RepositorioEstiloFalso({ texto: 'Del usuario', version: 2 }));

    await expect(sembrar.ejecutar(TEXTO)).resolves.toEqual({ sembrado: false });

    expect(repositorio.publicaciones).toEqual([]);
    expect(version.incrementos).toBe(0);
  });

  it('EST-D6 — Con solo versiones retiradas tampoco publica nada', async () => {
    const retirada: VersionHistorial = { version: 1, texto: 'Vieja', fecha: '2026-10-01T00:00:00.000Z' };
    const { repositorio, sembrar } = crear(new RepositorioEstiloFalso(null, [retirada]));

    await expect(sembrar.ejecutar(TEXTO)).resolves.toEqual({ sembrado: false });

    expect(repositorio.publicaciones).toEqual([]);
  });

  it('EST-D6 — Un texto que no pasa la validación falla y no publica nada', async () => {
    const { repositorio, sembrar } = crear();

    await expect(sembrar.ejecutar('Cuesta $50.000')).rejects.toThrow(/estilo/i);

    expect(repositorio.publicaciones).toEqual([]);
  });

  it('EST-D6 — Sembrar dos veces seguidas publica una sola versión', async () => {
    const { repositorio, sembrar } = crear();

    await sembrar.ejecutar(TEXTO);
    await expect(sembrar.ejecutar(TEXTO)).resolves.toEqual({ sembrado: false });

    expect(repositorio.publicaciones).toHaveLength(1);
  });
});
