import { describe, expect, it } from 'vitest';
import { normalizarTexto } from '../../../compartido/texto/index.js';
import { MAX_CARACTERES_TEXTO_CASO } from './validar-caso.js';
import { CASOS_DEL_SISTEMA, claveParametroLegada, textoDeRespaldo, type ClaveSistema } from './sistema.js';

// CAS4 (Fase 12, T4): la lista cerrada de casos del sistema es la única fuente de los textos de respaldo.

const DIEZ_MENSAJES = [
  'mensaje_pedir_texto_audio',
  'mensaje_imagen_no_procesada',
  'aviso_datos',
  'mensaje_handoff',
  'mensaje_handoff_fuera_horario',
  'mensaje_error_llm',
  'mensaje_captura_completa',
  'mensaje_fuera_cobertura',
  'mensaje_espera_handoff',
  'mensaje_techo_gasto',
];

describe('CASOS_DEL_SISTEMA (CAS4)', () => {
  it('CAS4 — Contiene los diez mensajes fijos de hoy más contra_entrega', () => {
    expect(CASOS_DEL_SISTEMA.map((c) => c.clave).sort()).toEqual([...DIEZ_MENSAJES, 'contra_entrega'].sort());
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

  it('CAS4 — Solo contra_entrega es de intención; el resto lo dispara el código', () => {
    const intencion = CASOS_DEL_SISTEMA.filter((c) => c.disparador === 'intencion').map((c) => c.clave);

    expect(intencion).toEqual(['contra_entrega']);
  });

  it('CAS7 — El respaldo de cada clave sale de la lista', () => {
    const clave: ClaveSistema = 'mensaje_handoff';

    expect(textoDeRespaldo(clave)).toBe(CASOS_DEL_SISTEMA.find((c) => c.clave === clave)?.textoRespaldo);
  });

  it('CAS6 — contra_entrega viene de politica_contra_entrega; los demás de su propia clave', () => {
    expect(claveParametroLegada('contra_entrega')).toBe('politica_contra_entrega');
    expect(claveParametroLegada('aviso_datos')).toBe('aviso_datos');
  });

  it('CAT11 — el respaldo de fuera de cobertura no promete ningún contacto (eso depende de la Fase 08)', () => {
    expect(textoDeRespaldo('mensaje_fuera_cobertura')).not.toMatch(/asesor|contactar/i);
  });

  it('CAS11 — el respaldo de contra_entrega cabe en el tope de un caso y no cita porcentajes', () => {
    expect(textoDeRespaldo('contra_entrega').length).toBeLessThanOrEqual(MAX_CARACTERES_TEXTO_CASO);
    expect(textoDeRespaldo('contra_entrega')).not.toContain('%');
    expect(textoDeRespaldo('contra_entrega')).toContain('se suma al total de tu compra');
  });

  it('R1 — ningún respaldo trae un valor en pesos ni un SKU', () => {
    for (const caso of CASOS_DEL_SISTEMA) {
      expect(caso.textoRespaldo, caso.clave).not.toMatch(/\$\s?\d|SKU-/i);
    }
  });
});
