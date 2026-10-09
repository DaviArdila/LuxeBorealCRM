import { describe, expect, it } from 'vitest';
import { ClockFalso } from '../../../../test/fakes/clock-falso.js';
import type { PlanSemilla } from '../dominio/semilla.js';
import type { RepositorioSemilla } from '../puertos/repositorio-semilla.js';
import type { VersionAsistente } from '../puertos/version-asistente.js';
import { SembrarCasos } from './sembrar-casos.js';

// CAS6 (Fase 12, T4): el caso de uso solo orquesta; la transacción real se prueba contra Postgres.

class RepositorioSemillaFalso implements RepositorioSemilla {
  planes: PlanSemilla[] = [];
  constructor(
    private readonly filas: Record<string, unknown>,
    private readonly insertados: number,
    private readonly delSistema: Record<string, unknown> = {},
  ) {}
  leerTextosDeCasosDelSistema(): Promise<ReadonlyMap<string, unknown>> {
    return Promise.resolve(new Map(Object.entries(this.delSistema)));
  }
  leerParametrosDeTexto(): Promise<ReadonlyMap<string, unknown>> {
    return Promise.resolve(new Map(Object.entries(this.filas)));
  }
  aplicar(plan: PlanSemilla): Promise<number> {
    this.planes.push(plan);
    return Promise.resolve(this.insertados);
  }
}

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

function crear(filas: Record<string, unknown>, insertados: number, delSistema: Record<string, unknown> = {}) {
  const repositorio = new RepositorioSemillaFalso(filas, insertados, delSistema);
  const version = new VersionFalsa();
  return { sembrar: new SembrarCasos(repositorio, version, new ClockFalso(new Date('2026-10-06T12:00:00Z'))), repositorio, version };
}

describe('asistente/aplicacion — SembrarCasos (CAS6)', () => {
  it('informa cuántos casos insertó y cuántos ya existían, solo cantidades', async () => {
    const { sembrar } = crear({}, 12);

    expect(await sembrar.ejecutar()).toMatchObject({ insertados: 12, existentes: 0 });
  });

  it('CAS6 — Sembrar dos veces no pisa: lo que ya existía se cuenta como existente', async () => {
    const { sembrar } = crear({}, 0);

    expect(await sembrar.ejecutar()).toMatchObject({ insertados: 0, existentes: 12 });
  });

  it('planifica con lo que hay en parametro y lo pasa al repositorio', async () => {
    const { sembrar, repositorio } = crear({ politica_garantia: 'La garantía cubre defectos.' }, 13);

    expect(await sembrar.ejecutar()).toMatchObject({ insertados: 13, existentes: 0 });
    expect(repositorio.planes[0]?.casos).toHaveLength(13);
  });

  it('CAS13 — Informa con qué texto se planificó «Tratamiento de datos», solo en cantidades', async () => {
    const delCaso = crear({}, 1, { aviso_datos: 'TEXTO-DEL-DUEÑO ¿Aceptas?' });
    const deParametro = crear({ aviso_datos: 'TEXTO-DE-PARAMETRO ¿Aceptas?' }, 1);
    const deRespaldo = crear({}, 1);

    const a = await delCaso.sembrar.ejecutar();
    const b = await deParametro.sembrar.ejecutar();
    const c = await deRespaldo.sembrar.ejecutar();

    expect(a.origenesDeTexto).toEqual({ casoDelSistema: 1, parametro: 0, respaldo: 0 });
    expect(b.origenesDeTexto).toEqual({ casoDelSistema: 0, parametro: 1, respaldo: 0 });
    expect(c.origenesDeTexto).toEqual({ casoDelSistema: 0, parametro: 0, respaldo: 1 });
    expect(JSON.stringify(a)).not.toContain('TEXTO-DEL-DUEÑO');
  });

  it('sube la versión compartida solo si insertó algo', async () => {
    const insertando = crear({}, 3);
    const sinCambios = crear({}, 0);

    await insertando.sembrar.ejecutar();
    await sinCambios.sembrar.ejecutar();

    expect(insertando.version.incrementos).toBe(1);
    expect(sinCambios.version.incrementos).toBe(0);
  });

  it('si Redis falla tras confirmar la base, la semilla termina igual', async () => {
    const { sembrar, version } = crear({}, 2);
    version.falla = true;

    await expect(sembrar.ejecutar()).resolves.toMatchObject({ insertados: 2, existentes: 10 });
  });

  it('CAS6 — Con un archivo de casos los suma al plan y cuenta como existentes los que ya estaban', async () => {
    const { sembrar, repositorio } = crear({}, 13);

    const resultado = await sembrar.ejecutar({
      casos: [{ categoria: 'Políticas', titulo: 'Devoluciones', cuandoAplica: 'Cuando preguntan por devoluciones.', texto: 'Aceptamos devoluciones en 8 días.' }],
    });

    expect(resultado).toMatchObject({ insertados: 13, existentes: 0 });
    expect(repositorio.planes[0]?.casos.some((c) => c.titulo === 'Devoluciones')).toBe(true);
  });

  it('CAS6 — Un archivo inválido falla antes de tocar la base', async () => {
    const { sembrar, repositorio } = crear({}, 0);

    await expect(sembrar.ejecutar({ casos: [{ titulo: 'sin lo demás' }] })).rejects.toThrow(/caso 1/);
    expect(repositorio.planes).toHaveLength(0);
  });
});
