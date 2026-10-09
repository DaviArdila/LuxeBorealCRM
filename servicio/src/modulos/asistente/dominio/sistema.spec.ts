import { describe, expect, it } from 'vitest';
import { normalizarTexto } from '../../../compartido/texto/index.js';
import { CASOS_DEL_SISTEMA, textoDeRespaldo, type ClaveSistema } from './sistema.js';

// CAS4 (Fase 12, T4): la lista cerrada de casos del sistema es la única fuente de los textos de respaldo.

const OCHO_MENSAJES = [
  'mensaje_pedir_texto_audio',
  'mensaje_imagen_no_procesada',
  'aviso_datos',
  'mensaje_handoff',
  'mensaje_handoff_fuera_horario',
  'mensaje_error_llm',
  'mensaje_espera_handoff',
  'mensaje_techo_gasto',
];

describe('CASOS_DEL_SISTEMA (CAS4)', () => {
  it('CAS4 — Contiene los ocho mensajes fijos que quedan hasta T7 (12d)', () => {
    expect(CASOS_DEL_SISTEMA.map((c) => c.clave).sort()).toEqual([...OCHO_MENSAJES].sort());
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

  it('CAS7 — El respaldo de cada clave sale de la lista', () => {
    const clave: ClaveSistema = 'mensaje_handoff';

    expect(textoDeRespaldo(clave)).toBe(CASOS_DEL_SISTEMA.find((c) => c.clave === clave)?.textoRespaldo);
  });

  it('R1 — ningún respaldo trae un valor en pesos ni un SKU', () => {
    for (const caso of CASOS_DEL_SISTEMA) {
      expect(caso.textoRespaldo, caso.clave).not.toMatch(/\$\s?\d|SKU-/i);
    }
  });
});
