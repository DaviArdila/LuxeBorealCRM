import { describe, expect, it } from 'vitest';
import { MAX_CARACTERES_ESTILO, validarEstilo } from './validar-estilo.js';

// Escenarios AGT20 de `openspec/changes/fase-08c-prompts-en-base-de-datos/specs/agente/spec.md`.

function motivoDe(texto: string): string {
  const resultado = validarEstilo(texto);
  expect(resultado.valido).toBe(false);
  return resultado.valido ? '' : resultado.motivo;
}

describe('agente/dominio/validar-estilo', () => {
  it('AGT20 — Un estilo vacío o demasiado largo se rechaza', () => {
    expect(motivoDe('')).toMatch(/vac/i);
    expect(motivoDe('   \n\t ')).toMatch(/vac/i);
    expect(motivoDe('a'.repeat(MAX_CARACTERES_ESTILO + 1))).toContain(String(MAX_CARACTERES_ESTILO));
  });

  it('AGT20 — Un estilo con precios, SKU o marcadores de plantilla se rechaza', () => {
    expect(motivoDe('Cuesta $389.000 siempre.')).toMatch(/pesos/i);
    expect(motivoDe('Recomienda el SKU-GL001.')).toMatch(/SKU/);
    expect(motivoDe('Hoy: {{horario}}')).toMatch(/plantilla/i);
    expect(motivoDe('Cierra con }} raro')).toMatch(/plantilla/i);
  });

  it('AGT20 — Un estilo válido se acepta', () => {
    const estilo = '# Quién eres\n\nEres cálido.\n\n- Sin emojis.\n- Viñetas cuando ayuden.\n';

    expect(validarEstilo(estilo)).toEqual({ valido: true });
  });

  it('el límite es inclusivo: exactamente el máximo se acepta', () => {
    expect(validarEstilo('a'.repeat(MAX_CARACTERES_ESTILO))).toEqual({ valido: true });
  });

  it('un signo de pesos sin cifras o la palabra sku sola no cuentan', () => {
    expect(validarEstilo('Habla de precios en pesos sin cifras; el sku es interno.')).toEqual({ valido: true });
    expect(validarEstilo('El símbolo $ solo.')).toEqual({ valido: true });
  });

  it('el motivo nunca copia el texto del estilo (R14)', () => {
    expect(motivoDe('Texto secreto $12.345 aquí')).not.toContain('secreto');
  });
});
