import { describe, expect, it } from 'vitest';
import { CATALOGO_REAL } from './catalogo-real.js';
import { validarMensajeFijo } from './dominio/validar-mensaje-fijo.js';

// CFN1: la lista cerrada de esta fase, compuesta desde el catálogo de cada módulo dueño (AGT3: un solo lugar por texto).

describe('catálogo real de mensajes fijos (CFN1)', () => {
  it('CFN1 — son diez mensajes, en el orden de la spec, sin claves repetidas', () => {
    expect(CATALOGO_REAL.map((m) => m.clave)).toEqual([
      'mensaje_pedir_texto_audio',
      'mensaje_imagen_no_procesada',
      'aviso_datos',
      'mensaje_handoff',
      'mensaje_handoff_fuera_horario',
      'mensaje_error_llm',
      'mensaje_captura_completa',
      'mensaje_espera_handoff',
      'mensaje_fuera_cobertura',
      'mensaje_techo_gasto',
    ]);
    expect(new Set(CATALOGO_REAL.map((m) => m.clave)).size).toBe(10);
  });

  it('cada mensaje trae una descripción en lenguaje del negocio y un texto de respaldo que pasa la validación de CFN2', () => {
    for (const mensaje of CATALOGO_REAL) {
      expect(mensaje.descripcion.trim().length, mensaje.clave).toBeGreaterThan(20);
      expect(validarMensajeFijo(mensaje.textoRespaldo), mensaje.clave).toEqual({ valido: true });
    }
  });

  it('Q3 — la descripción de aviso_datos advierte que es el aviso de asistente automatizado que exige R14', () => {
    const aviso = CATALOGO_REAL.find((m) => m.clave === 'aviso_datos');

    expect(aviso?.descripcion).toMatch(/asistente automatizado/i);
    expect(aviso?.descripcion).toMatch(/R14/);
  });
});
