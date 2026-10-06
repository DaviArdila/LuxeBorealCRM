import { describe, expect, it, vi } from 'vitest';
import type { Clock } from '../../../plataforma/reloj/index.js';
import type { InvalidadorDeCaches } from '../puertos/invalidador-caches.js';
import { ClaveFueraDelRegistro, type ExcepcionDeHorario, type ParametroGuardado, type RepositorioConfiguracion } from '../puertos/repositorio-configuracion.js';
import { AdministrarConfiguracion } from './administrar-configuracion.js';
import { esClaveRegistrada } from '../dominio/registro.js';

const AHORA = new Date('2026-10-06T12:00:00.000Z');
const RELOJ: Clock = { ahora: () => AHORA };

class RepositorioEnMemoria implements RepositorioConfiguracion {
  readonly parametros = new Map<string, ParametroGuardado>();
  readonly excepciones: ExcepcionDeHorario[] = [];
  leerParametro(clave: string): Promise<ParametroGuardado | null> {
    return Promise.resolve(this.parametros.get(clave) ?? null);
  }
  guardarParametros(entradas: readonly { clave: string; valor: unknown }[], ahora: Date): Promise<void> {
    if (entradas.some((e) => !esClaveRegistrada(e.clave))) return Promise.reject(new ClaveFueraDelRegistro('x'));
    for (const e of entradas) this.parametros.set(e.clave, { valor: e.valor, actualizado: ahora });
    return Promise.resolve();
  }
  listarExcepciones(): Promise<readonly ExcepcionDeHorario[]> {
    return Promise.resolve(this.excepciones);
  }
  crearExcepcion(fecha: string, motivo: string | null): Promise<boolean> {
    if (this.excepciones.some((e) => e.fecha === fecha)) return Promise.resolve(false);
    this.excepciones.push({ fecha, motivo });
    return Promise.resolve(true);
  }
  borrarExcepcion(fecha: string): Promise<boolean> {
    const i = this.excepciones.findIndex((e) => e.fecha === fecha);
    if (i >= 0) this.excepciones.splice(i, 1);
    return Promise.resolve(i >= 0);
  }
}

function crear(invalidador?: InvalidadorDeCaches) {
  const repositorio = new RepositorioEnMemoria();
  const invalidar = vi.fn(() => Promise.resolve());
  const caches = invalidador ?? { invalidarCatalogo: invalidar };
  return { repositorio, invalidar, casos: new AdministrarConfiguracion(repositorio, caches, RELOJ) };
}

describe('CFG1/CFG3 — Envíos (aplicación)', () => {
  it('CFG1 — Un admin lee el grupo con lo vigente y su fecha de actualización', async () => {
    const { casos, repositorio } = crear();
    repositorio.parametros.set('recargo_contraentrega_pct', { valor: 7, actualizado: AHORA });
    repositorio.parametros.set('factor_volumetrico', { valor: 5000, actualizado: AHORA });

    expect(await casos.obtenerEnvios()).toEqual({ recargoContraentregaPct: 7, factorVolumetrico: 5000, actualizado: AHORA });
  });

  it('CFG1 — Sin nada guardado lee los valores por defecto sin fecha', async () => {
    const { casos } = crear();

    expect(await casos.obtenerEnvios()).toEqual({ recargoContraentregaPct: 5, factorVolumetrico: 4000, actualizado: null });
  });

  it('CFG1 — Un grupo con un campo inválido no guarda nada y devuelve el motivo del campo', async () => {
    const { casos, repositorio, invalidar } = crear();
    repositorio.parametros.set('recargo_contraentrega_pct', { valor: 5, actualizado: AHORA });

    const resultado = await casos.guardarEnvios({ recargoContraentregaPct: 6, factorVolumetrico: -1 });

    expect(resultado).toMatchObject({ ok: false, errores: [{ campo: 'factorVolumetrico' }] });
    expect(repositorio.parametros.get('recargo_contraentrega_pct')?.valor).toBe(5);
    expect(invalidar).not.toHaveBeenCalled();
  });

  it('CFG3 — Guardar el recargo cambia lo que se lee y devuelve los campos que cambiaron', async () => {
    const { casos, repositorio } = crear();
    repositorio.parametros.set('recargo_contraentrega_pct', { valor: 5, actualizado: AHORA });

    const resultado = await casos.guardarEnvios({ recargoContraentregaPct: 6, factorVolumetrico: 4000 });

    expect(resultado).toMatchObject({ ok: true, cambios: ['recargoContraentregaPct'] });
    expect((await casos.obtenerEnvios()).recargoContraentregaPct).toBe(6);
  });

  it('CFG5 — Guardar los envíos invalida la caché del catálogo después de escribir', async () => {
    const { casos, invalidar, repositorio } = crear();

    await casos.guardarEnvios({ recargoContraentregaPct: 6, factorVolumetrico: 4000 });

    expect(invalidar).toHaveBeenCalledTimes(1);
    expect(repositorio.parametros.size).toBe(2);
  });

  it('CFG5 — Una invalidación fallida no deshace el guardado y la respuesta sigue siendo correcta', async () => {
    const { casos, repositorio } = crear({ invalidarCatalogo: () => Promise.reject(new Error('redis caído')) });

    const resultado = await casos.guardarEnvios({ recargoContraentregaPct: 6, factorVolumetrico: 4000 });

    expect(resultado.ok).toBe(true);
    expect(repositorio.parametros.get('recargo_contraentrega_pct')?.valor).toBe(6);
  });
});

describe('CFG2 — Horario y excepciones (aplicación)', () => {
  const DIAS_BASE = {
    lun: { desde: '08:00', hasta: '18:00' },
    mar: null,
    mie: null,
    jue: null,
    vie: null,
    sab: null,
    dom: null,
  } as const;

  it('CFG2 — Guardar el horario escribe horario_atencion con los siete días', async () => {
    const { casos, repositorio } = crear();

    const resultado = await casos.guardarHorario(DIAS_BASE);

    expect(resultado.ok).toBe(true);
    expect(repositorio.parametros.get('horario_atencion')?.valor).toMatchObject({ lun: '08:00-18:00', dom: null });
    expect((await casos.obtenerHorario()).dias.lun).toEqual({ desde: '08:00', hasta: '18:00' });
  });

  it('CFG2 — Una hora inválida no guarda nada', async () => {
    const { casos, repositorio } = crear();

    const resultado = await casos.guardarHorario({ ...DIAS_BASE, lun: { desde: '25:00', hasta: '18:00' } });

    expect(resultado).toMatchObject({ ok: false, errores: [{ campo: 'dias.lun.desde' }] });
    expect(repositorio.parametros.has('horario_atencion')).toBe(false);
  });

  it('CFG2 — Crear y borrar una excepción la muestra mientras exista', async () => {
    const { casos } = crear();

    expect(await casos.crearExcepcion('2026-12-25', 'Navidad')).toEqual({ ok: true });
    expect((await casos.obtenerHorario()).excepciones).toEqual([{ fecha: '2026-12-25', motivo: 'Navidad' }]);
    expect(await casos.borrarExcepcion('2026-12-25')).toBe(true);
    expect((await casos.obtenerHorario()).excepciones).toEqual([]);
  });

  it('CFG2 — Una excepción repetida se rechaza como duplicada', async () => {
    const { casos } = crear();
    await casos.crearExcepcion('2026-12-25', null);

    expect(await casos.crearExcepcion('2026-12-25', 'otra')).toEqual({ ok: false, razon: 'duplicada' });
  });

  it('CFG2 — Una fecha que no existe en el calendario se rechaza', async () => {
    const { casos } = crear();

    expect(await casos.crearExcepcion('2026-02-31', null)).toMatchObject({ ok: false, razon: 'invalida' });
  });
});

describe('CFG4 — Gasto del LLM (aplicación)', () => {
  it('CFG4 — La lectura trae el techo, el estado del gateway y el gasto del mes', async () => {
    const { casos, repositorio } = crear();
    repositorio.parametros.set('llm_techo_mensual_usd', { valor: 20, actualizado: AHORA });
    repositorio.parametros.set('llm_estado_techo', {
      valor: { mes: '2026-10', gastoUsd: 16.5, techoUsd: 20, avisoEmitido: true, bloqueado: false },
      actualizado: AHORA,
    });

    expect(await casos.obtenerGastoLlm()).toEqual({
      techoMensualUsd: 20,
      estado: { mes: '2026-10', avisoEmitido: true, bloqueado: false },
      gastoMesUsd: 16.5,
      actualizado: AHORA,
    });
  });

  it('CFG4 — Guardar un techo nuevo escribe solo llm_techo_mensual_usd', async () => {
    const { casos, repositorio } = crear();

    const resultado = await casos.guardarGastoLlm({ techoMensualUsd: 20 });

    expect(resultado.ok).toBe(true);
    expect(repositorio.parametros.get('llm_techo_mensual_usd')?.valor).toBe(20);
    expect(repositorio.parametros.has('llm_estado_techo')).toBe(false);
  });

  it('CFG4 — Un techo no positivo se rechaza', async () => {
    const { casos } = crear();

    expect(await casos.guardarGastoLlm({ techoMensualUsd: 0 })).toMatchObject({ ok: false, errores: [{ campo: 'techoMensualUsd' }] });
  });
});
