import { describe, expect, it } from 'vitest';
import { normalizarTexto } from '../../../compartido/texto/index.js';
import { CASOS_DEL_SISTEMA, definicionDe, maximoDeCaracteres, textoDeRespaldo, type ClaveSistema } from './sistema.js';

// CAS4 (Fase 12, T4): la lista cerrada de casos del sistema es la única fuente de los textos de respaldo.

const MENSAJES = [
  'mensaje_pedir_texto_audio',
  'mensaje_imagen_no_procesada',
  'mensaje_error_llm',
  'mensaje_espera_handoff',
  'mensaje_techo_gasto',
  // ADR-0028: la barrera de consentimiento.
  'consentimiento_aviso',
  'consentimiento_recordatorio',
  'consentimiento_aceptado',
  'consentimiento_rechazado',
  // Botones de respuesta del aviso (títulos de hasta 20 caracteres).
  'consentimiento_boton_si',
  'consentimiento_boton_no',
];

describe('CASOS_DEL_SISTEMA (CAS4)', () => {
  it('CAS4 — Contiene exactamente los cinco mensajes fijos, los cuatro de la barrera de consentimiento y los dos títulos de sus botones (ADR-0028)', () => {
    expect(CASOS_DEL_SISTEMA).toHaveLength(11);
    expect(CASOS_DEL_SISTEMA.map((c) => c.clave).sort()).toEqual([...MENSAJES].sort());
  });

  it('CAS4 — Las claves retiradas ya no son claves del sistema', () => {
    const claves: readonly string[] = CASOS_DEL_SISTEMA.map((c) => c.clave);

    expect(claves).not.toContain('aviso_datos');
    expect(claves).not.toContain('mensaje_handoff');
    expect(claves).not.toContain('mensaje_handoff_fuera_horario');
  });

  it('CAS4 — «Espera del asesor» es el título de respaldo de mensaje_espera_handoff', () => {
    expect(CASOS_DEL_SISTEMA.find((c) => c.clave === 'mensaje_espera_handoff')?.titulo).toBe('Espera del asesor');
  });

  it('CAS14 — contra_entrega, mensaje_fuera_cobertura y mensaje_captura_completa ya no son claves del sistema', () => {
    const claves: readonly string[] = CASOS_DEL_SISTEMA.map((c) => c.clave);

    expect(claves).not.toContain('contra_entrega');
    expect(claves).not.toContain('mensaje_fuera_cobertura');
    expect(claves).not.toContain('mensaje_captura_completa');
  });

  it('CAS4 — Cada caso trae título, descripción de cuándo se envía y texto de respaldo no vacíos', () => {
    for (const caso of CASOS_DEL_SISTEMA) {
      expect(caso.titulo.trim(), caso.clave).not.toBe('');
      expect(caso.descripcion.trim(), caso.clave).not.toBe('');
      expect(caso.textoRespaldo.trim(), caso.clave).not.toBe('');
    }
  });

  it('CAS1 — Los títulos son únicos sin distinguir mayúsculas ni acentos', () => {
    const titulos = CASOS_DEL_SISTEMA.map((c) => normalizarTexto(c.titulo));

    expect(new Set(titulos).size).toBe(titulos.length);
  });

  it('CAS4 — Todos los casos del sistema son de evento: los dispara el código', () => {
    const disparadores = new Set<string>(CASOS_DEL_SISTEMA.map((c) => c.disparador));

    expect([...disparadores]).toEqual(['evento']);
  });

  it('ADR-0028 — Los textos de la barrera piden SÍ o NO y el aviso presenta al bot como asistente', () => {
    for (const clave of ['consentimiento_aviso', 'consentimiento_recordatorio'] as const) {
      expect(textoDeRespaldo(clave), clave).toMatch(/Responde SÍ o NO/);
    }
    expect(textoDeRespaldo('consentimiento_aviso')).toMatch(/asistente virtual/);
  });

  it('Botones — Los títulos de los botones del aviso caben en 20 caracteres y no se repiten', () => {
    const si = definicionDe('consentimiento_boton_si');
    const no = definicionDe('consentimiento_boton_no');

    expect(si.maximoCaracteres).toBe(20);
    expect(no.maximoCaracteres).toBe(20);
    expect(textoDeRespaldo('consentimiento_boton_si')).toBe('Sí, autorizo');
    expect(textoDeRespaldo('consentimiento_boton_no')).toBe('No autorizo');
    for (const caso of CASOS_DEL_SISTEMA) {
      const maximo = maximoDeCaracteres(caso.clave);
      if (maximo !== undefined) expect(caso.textoRespaldo.length, caso.clave).toBeLessThanOrEqual(maximo);
    }
  });

  it('CAS7 — El respaldo de cada clave sale de la lista', () => {
    const clave: ClaveSistema = 'mensaje_espera_handoff';

    expect(textoDeRespaldo(clave)).toBe(CASOS_DEL_SISTEMA.find((c) => c.clave === clave)?.textoRespaldo);
  });

  it('R1 — ningún respaldo trae un valor en pesos ni un SKU', () => {
    for (const caso of CASOS_DEL_SISTEMA) {
      expect(caso.textoRespaldo, caso.clave).not.toMatch(/\$\s?\d|SKU-/i);
    }
  });
});
