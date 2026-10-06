import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClockFalso } from '../../../../test/fakes/clock-falso.js';
import type { AutorEstilo, EstiloGuardado, RepositorioEstilo, VersionHistorial } from '../puertos/repositorio-estilo.js';
import type { VersionEstilo } from '../puertos/version-estilo.js';
import { ListarHistorialEstilo } from './listar-historial-estilo.js';
import { PublicarEstilo } from './publicar-estilo.js';
import { RestaurarEstilo } from './restaurar-estilo.js';

// Casos de uso de AGT20, AGT21 y AGT22 con dobles: el guardado transaccional real se prueba contra Postgres.

class RepositorioEstiloFalso implements RepositorioEstilo {
  publicaciones: { texto: string; fecha: Date; autor: AutorEstilo | null | undefined }[] = [];
  vigente: EstiloGuardado | null = null;
  historial: VersionHistorial[] = [];
  leerVigente(): Promise<EstiloGuardado | null> {
    return Promise.resolve(this.vigente);
  }
  leerHistorial(): Promise<readonly VersionHistorial[]> {
    return Promise.resolve(this.historial);
  }
  publicar(texto: string, fecha: Date, autor?: AutorEstilo | null): Promise<number> {
    this.publicaciones.push({ texto, fecha, autor });
    const version = (this.vigente?.version ?? 0) + 1;
    this.vigente = { texto, version };
    return Promise.resolve(version);
  }
}

class VersionEstiloFalsa implements VersionEstilo {
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
  const repositorio = new RepositorioEstiloFalso();
  const version = new VersionEstiloFalsa();
  const clock = new ClockFalso(new Date('2026-10-01T15:00:00Z'));
  const publicar = new PublicarEstilo(repositorio, version, clock);
  return { repositorio, version, clock, publicar, restaurar: new RestaurarEstilo(repositorio, publicar), listar: new ListarHistorialEstilo(repositorio) };
}

describe('agente/aplicacion — publicar, restaurar y listar el estilo', () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('publica un estilo válido: lo guarda con la fecha del reloj y sube la versión compartida', async () => {
    const { publicar, repositorio, version } = crear();

    const resultado = await publicar.ejecutar('Habla con calidez.');

    expect(resultado).toEqual({ publicado: true, version: 1 });
    expect(repositorio.publicaciones).toEqual([{ texto: 'Habla con calidez.', fecha: new Date('2026-10-01T15:00:00Z') }]);
    expect(version.incrementos).toBe(1);
  });

  it('AGT20 — un estilo inválido no se guarda ni sube la versión, y el motivo no copia el texto', async () => {
    const { publicar, repositorio, version } = crear();

    const resultado = await publicar.ejecutar('Texto privado con $389.000');

    expect(resultado).toMatchObject({ publicado: false, motivo: expect.stringMatching(/pesos/i) as unknown });
    expect(JSON.stringify(resultado)).not.toContain('privado');
    expect(repositorio.publicaciones).toEqual([]);
    expect(version.incrementos).toBe(0);
  });

  it('si Redis falla al subir la versión, el estilo ya está publicado y el resultado es éxito', async () => {
    const { publicar, version, repositorio } = crear();
    version.falla = true;

    await expect(publicar.ejecutar('Estilo bueno')).resolves.toEqual({ publicado: true, version: 1 });
    expect(repositorio.publicaciones).toHaveLength(1);
  });

  it('restaurar publica el texto de esa versión como una versión nueva', async () => {
    const { restaurar, repositorio } = crear();
    repositorio.vigente = { texto: 'Actual', version: 3 };
    repositorio.historial = [
      { version: 2, texto: 'Versión dos', fecha: '2026-09-30T10:00:00.000Z' },
      { version: 1, texto: 'Versión uno', fecha: '2026-09-29T10:00:00.000Z' },
    ];

    const resultado = await restaurar.ejecutar(1);

    expect(resultado).toEqual({ publicado: true, version: 4 });
    expect(repositorio.publicaciones.map((p) => p.texto)).toEqual(['Versión uno']);
  });

  it('restaurar una versión que no está en el historial no publica nada y lo dice', async () => {
    const { restaurar, repositorio, version } = crear();

    const resultado = await restaurar.ejecutar(9);

    expect(resultado).toMatchObject({ publicado: false, motivo: expect.stringContaining('9') as unknown });
    expect(repositorio.publicaciones).toEqual([]);
    expect(version.incrementos).toBe(0);
  });

  it('AGT23 — la razón distingue una versión inexistente (404) de un estilo inválido (422) sin comparar textos', async () => {
    const { publicar, restaurar, repositorio } = crear();
    repositorio.historial = [{ version: 1, texto: 'Recomienda el SKU-GL001', fecha: '2026-09-29T10:00:00.000Z' }];

    await expect(publicar.ejecutar('Cuesta $ 50')).resolves.toMatchObject({ publicado: false, razon: 'invalido' });
    await expect(restaurar.ejecutar(9)).resolves.toMatchObject({ publicado: false, razon: 'version-inexistente' });
    await expect(restaurar.ejecutar(1)).resolves.toMatchObject({ publicado: false, razon: 'invalido' });
  });

  it('restaurar valida el texto como cualquier estilo (un estilo viejo que hoy sería inválido se rechaza)', async () => {
    const { restaurar, repositorio } = crear();
    repositorio.historial = [{ version: 1, texto: 'Recomienda el SKU-GL001', fecha: '2026-09-29T10:00:00.000Z' }];

    await expect(restaurar.ejecutar(1)).resolves.toMatchObject({ publicado: false });
    expect(repositorio.publicaciones).toEqual([]);
  });

  it('listar entrega el vigente y el historial, más reciente primero', async () => {
    const { listar, repositorio } = crear();
    repositorio.vigente = { texto: 'Actual', version: 3 };
    repositorio.historial = [{ version: 2, texto: 'Dos', fecha: '2026-09-30T10:00:00.000Z' }];

    await expect(listar.ejecutar()).resolves.toEqual({
      vigente: { texto: 'Actual', version: 3 },
      historial: [{ version: 2, texto: 'Dos', fecha: '2026-09-30T10:00:00.000Z' }],
    });
  });
  it('EST-D3 — Publicar pasa al repositorio al usuario que publica', async () => {
    const { publicar, repositorio } = crear();
    const ana = { id: '0199a000-0000-7000-8000-00000000000a', nombre: 'Ana' };

    await publicar.ejecutar('Estilo cálido y claro.', ana);

    expect(repositorio.publicaciones[0]?.autor).toEqual(ana);
  });

  it('EST-D3 — Publicar sin usuario (el comando) no guarda autor', async () => {
    const { publicar, repositorio } = crear();

    await publicar.ejecutar('Estilo cálido y claro.');

    expect(repositorio.publicaciones[0]?.autor).toBeUndefined();
  });

  it('EST-D3 — Restaurar registra a quien restauró como autor de la versión nueva', async () => {
    const { restaurar, repositorio } = crear();
    repositorio.historial = [{ version: 1, texto: 'Estilo viejo y claro.', fecha: '2026-10-01T10:00:00.000Z' }];
    const luis = { id: '0199a000-0000-7000-8000-00000000000b', nombre: 'Luis' };

    await restaurar.ejecutar(1, luis);

    expect(repositorio.publicaciones[0]).toMatchObject({ texto: 'Estilo viejo y claro.', autor: luis });
  });
});
