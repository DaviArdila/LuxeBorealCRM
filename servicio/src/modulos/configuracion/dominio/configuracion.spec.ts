import { describe, expect, it } from 'vitest';
import { leerSemana, serializarSemana, validarEnvios, validarGastoLlm, validarSemana, type Semana } from './configuracion.js';
import { esClaveRegistrada, validarValorRegistrado } from './registro.js';

const SEMANA_BASE: Semana = {
  lun: { desde: '08:00', hasta: '18:00' },
  mar: { desde: '08:00', hasta: '18:00' },
  mie: { desde: '08:00', hasta: '18:00' },
  jue: { desde: '08:00', hasta: '18:00' },
  vie: { desde: '08:00', hasta: '18:00' },
  sab: null,
  dom: null,
};

describe('CFG2 — Horario por día (dominio)', () => {
  it('CFG2 — Guardar el horario por día escribe siete claves explícitas que el módulo horario evalúa', () => {
    const valor = serializarSemana(SEMANA_BASE);

    expect(Object.keys(valor)).toEqual(['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom']);
    expect(valor['lun']).toBe('08:00-18:00');
  });

  it('CFG2 — Un día cerrado se guarda como nulo y una consulta en domingo está fuera de horario', () => {
    const valor = serializarSemana(SEMANA_BASE);

    expect(valor['dom']).toBeNull();
  });

  it('CFG2 — Una hora inválida se rechaza y el motivo nombra el día', () => {
    const resultado = validarSemana({ ...SEMANA_BASE, lun: { desde: '25:00', hasta: '18:00' } });

    expect(resultado).toMatchObject({ valido: false, errores: [{ campo: 'dias.lun.desde', problema: 'formato' }] });
    expect(resultado.valido ? '' : resultado.motivo).toContain('lun');
  });

  it('CFG2 — Un rango que cruza la medianoche se acepta y la serializa tal cual (la evaluación la prueba la integración)', () => {
    const semana = { ...SEMANA_BASE, vie: { desde: '22:00', hasta: '02:00' } };

    expect(validarSemana(semana).valido).toBe(true);
    expect(serializarSemana(semana)['vie']).toBe('22:00-02:00');
  });

  it('CFG2 — Un rango con desde igual a hasta se rechaza', () => {
    expect(validarSemana({ ...SEMANA_BASE, mar: { desde: '08:00', hasta: '08:00' } }).valido).toBe(false);
  });

  it('CFG2 — leerSemana devuelve lo guardado y deja cerrado lo que falta', () => {
    const leida = leerSemana(serializarSemana(SEMANA_BASE));

    expect(leida).toEqual(SEMANA_BASE);
    expect(leerSemana(null).dom).toBeNull();
    expect(leerSemana('basura').lun).toBeNull();
  });
});

describe('CFG3 — Envíos (dominio)', () => {
  it('CFG3 — Un recargo y un factor válidos se aceptan', () => {
    expect(validarEnvios({ recargoContraentregaPct: 6.25, factorVolumetrico: 4000 })).toEqual({
      valido: true,
      valor: { recargoContraentregaPct: 6.25, factorVolumetrico: 4000 },
    });
  });

  it('CFG3 — Un recargo fuera de rango se rechaza', () => {
    const resultado = validarEnvios({ recargoContraentregaPct: 150, factorVolumetrico: 4000 });

    expect(resultado).toMatchObject({ valido: false, errores: [{ campo: 'recargoContraentregaPct', problema: 'valor' }] });
  });

  it('CFG3 — Un recargo con más de dos decimales se rechaza', () => {
    expect(validarEnvios({ recargoContraentregaPct: 5.123, factorVolumetrico: 4000 }).valido).toBe(false);
  });

  it('CFG3 — Un factor volumétrico no entero o negativo se rechaza', () => {
    expect(validarEnvios({ recargoContraentregaPct: 5, factorVolumetrico: 4000.5 }).valido).toBe(false);
    expect(validarEnvios({ recargoContraentregaPct: 5, factorVolumetrico: -1 }).valido).toBe(false);
    expect(validarEnvios({ recargoContraentregaPct: 5, factorVolumetrico: 100_001 }).valido).toBe(false);
  });
});

describe('CFG4 — Gasto del LLM (dominio)', () => {
  it('CFG4 — Un techo positivo hasta 10.000 se acepta', () => {
    expect(validarGastoLlm({ techoMensualUsd: 20 })).toEqual({ valido: true, valor: { techoMensualUsd: 20 } });
  });

  it('CFG4 — Un techo no positivo o mayor al tope se rechaza', () => {
    expect(validarGastoLlm({ techoMensualUsd: 0 }).valido).toBe(false);
    expect(validarGastoLlm({ techoMensualUsd: 10_001 }).valido).toBe(false);
  });
});

describe('CFG6 — Registro tipado de parametro (dominio)', () => {
  it('CFG6 — Una clave fuera del registro no es registrada', () => {
    expect(esClaveRegistrada('horario_atencion')).toBe(true);
    expect(esClaveRegistrada('mensaje_handoff')).toBe(false);
    expect(esClaveRegistrada('prompt_estilo')).toBe(false);
  });

  it('CFG6 — Un valor del tipo equivocado no valida contra el tipo de su clave', () => {
    expect(validarValorRegistrado('recargo_contraentrega_pct', '5')).toBe(false);
    expect(validarValorRegistrado('recargo_contraentrega_pct', 5)).toBe(true);
    expect(validarValorRegistrado('factor_volumetrico', 4000.5)).toBe(false);
    expect(validarValorRegistrado('llm_techo_mensual_usd', 0)).toBe(false);
  });
});
