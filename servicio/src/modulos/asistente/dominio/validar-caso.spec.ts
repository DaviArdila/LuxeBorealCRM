import { describe, expect, it } from 'vitest';
import { MAX_CARACTERES_TEXTO_CASO, validarCaso, type DatosCaso } from './validar-caso.js';

// CAS5 (Fase 12, T4): validación pura del texto y los campos de un caso, sin copiar nunca el texto en el motivo (R14).

const BASE: DatosCaso = {
  titulo: 'Garantía',
  cuandoAplica: 'Cuando el cliente pregunta por la garantía.',
  texto: 'La garantía cubre defectos de fábrica por ocho días.',
  modo: 'literal',
  disparador: 'intencion',
  claveSistema: null,
};

function motivoDe(cambios: Partial<DatosCaso>): string | null {
  const resultado = validarCaso({ ...BASE, ...cambios });
  return resultado.valido ? null : resultado.motivo;
}

describe('validarCaso (CAS5)', () => {
  it('un caso correcto es válido', () => {
    expect(validarCaso(BASE)).toEqual({ valido: true });
  });

  it('CAS5 — Un texto con un valor en pesos se rechaza con el motivo de la regla', () => {
    expect(motivoDe({ texto: 'Cuesta $ 45.000 con envío' })).toBe('el texto contiene un valor en pesos (R1, R2)');
  });

  it('CAS5 — Un texto con un SKU se rechaza y menciona AGT16', () => {
    expect(motivoDe({ texto: 'Consulta el SKU-GRF-001 en la tienda' })).toBe('el texto contiene un SKU (AGT16)');
  });

  it('CAS5 — Un texto con un marcador de plantilla se rechaza', () => {
    expect(motivoDe({ texto: 'Hola {{nombre}}' })).toBe('el texto contiene un marcador de plantilla {{...}}');
  });

  it('CAS5 — Un texto vacío o demasiado largo se rechaza', () => {
    expect(motivoDe({ texto: '   ' })).toBe('el texto está vacío');
    expect(motivoDe({ texto: 'a'.repeat(MAX_CARACTERES_TEXTO_CASO + 1) })).toBe(
      `el texto supera ${String(MAX_CARACTERES_TEXTO_CASO)} caracteres`,
    );
    expect(validarCaso({ ...BASE, texto: 'a'.repeat(MAX_CARACTERES_TEXTO_CASO) })).toEqual({ valido: true });
  });

  it('CAS5 — El «cuándo aplica» es obligatorio en un caso de intención y tiene un tope de 200', () => {
    expect(motivoDe({ cuandoAplica: '  ' })).toBe('el «cuándo aplica» está vacío');
    expect(motivoDe({ cuandoAplica: 'a'.repeat(201) })).toBe('el «cuándo aplica» supera 200 caracteres');
    expect(validarCaso({ ...BASE, cuandoAplica: 'a'.repeat(200) })).toEqual({ valido: true });
  });

  it('CAS5 — Un caso del sistema por evento admite una descripción más larga de cuándo se envía', () => {
    const evento = { ...BASE, disparador: 'evento' as const, claveSistema: 'mensaje_techo_gasto', cuandoAplica: 'a'.repeat(300) };

    expect(validarCaso(evento)).toEqual({ valido: true });
    expect(validarCaso({ ...evento, cuandoAplica: 'a'.repeat(1001) })).toEqual({
      valido: false,
      motivo: 'el «cuándo aplica» supera 1000 caracteres',
    });
  });

  it('CAS5 — El título tiene entre 1 y 80 caracteres', () => {
    expect(motivoDe({ titulo: ' ' })).toBe('el título está vacío');
    expect(motivoDe({ titulo: 'a'.repeat(81) })).toBe('el título supera 80 caracteres');
    expect(validarCaso({ ...BASE, titulo: 'a'.repeat(80) })).toEqual({ valido: true });
  });

  it('CAS5 — Un caso del sistema no admite el modo guía', () => {
    expect(motivoDe({ claveSistema: 'mensaje_error_llm', disparador: 'evento', modo: 'guia' })).toBe(
      'un caso del sistema solo admite el modo literal',
    );
  });

  it('CAS5 — Un caso de evento no admite el modo guía aunque falte la clave', () => {
    expect(motivoDe({ disparador: 'evento', modo: 'guia' })).toBe('un caso del sistema solo admite el modo literal');
  });

  it('CAS5 — El motivo no copia el texto (R14)', () => {
    const resultado = validarCaso({ ...BASE, texto: 'TEXTO-SECRETO cuesta $ 99.000' });

    expect(JSON.stringify(resultado)).not.toContain('TEXTO-SECRETO');
    expect(JSON.stringify(resultado)).not.toContain('99.000');
  });
});
