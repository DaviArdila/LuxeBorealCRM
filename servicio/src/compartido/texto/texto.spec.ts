import {
  contieneMarcadorDePlantilla,
  contieneSku,
  contieneValorEnPesos,
  normalizarLugar,
  normalizarTexto,
  palabrasClave,
} from './texto.js';

// CMP3 — Normalización de texto y de nombres de lugar. Nombres de escenario tomados literalmente
// de `openspec/changes/fase-00a-esqueleto/specs/compartido/spec.md`.

describe('compartido/texto', () => {
  it('CMP3 — Normalizar texto quita tildes, mayúsculas y espacios repetidos', () => {
    expect(normalizarTexto('  Lámpara   DE  Mesa ')).toBe('lampara de mesa');
  });

  it('CMP3 — Normalizar un lugar además deja solo letras, números y espacios', () => {
    expect(normalizarLugar('Bogotá D.C.')).toBe('bogota dc');
    expect(normalizarLugar('BOGOTA, D.C')).toBe(normalizarLugar('Bogotá D.C.'));
  });

  it('CMP3 — Extraer palabras clave descarta las más cortas que el mínimo', () => {
    expect(palabrasClave('Lámpara de mesa')).toEqual(['lampara', 'mesa']);
    expect(palabrasClave('la de')).toEqual([]);
  });
});

describe('contieneValorEnPesos (R1, R2)', () => {
  it.each(['Cuesta $389.000', 'Vale $ 120.000', 'Por $5', 'Desde $1.5 millones'])('detecta «%s»', (texto) => {
    expect(contieneValorEnPesos(texto)).toBe(true);
  });

  it.each(['Hola, ¿en qué te ayudo?', 'Te cobramos el envío aparte', 'El signo $ solo', 'Cuesta COP 50'])('no marca «%s»', (texto) => {
    expect(contieneValorEnPesos(texto)).toBe(false);
  });
});

describe('contieneMarcadorDePlantilla', () => {
  it.each(['Hola {{nombre}}', 'cierra }} sin abrir', 'abre {{ sin cerrar'])('detecta «%s»', (texto) => {
    expect(contieneMarcadorDePlantilla(texto)).toBe(true);
  });

  it.each(['Hola {nombre}', 'Llaves { sueltas } separadas', 'Sin marcadores'])('no marca «%s»', (texto) => {
    expect(contieneMarcadorDePlantilla(texto)).toBe(false);
  });
});

describe('contieneSku (AGT16)', () => {
  it.each(['Pregunta por SKU-GL001', 'el sku-abc123 está agotado', 'códigos SKU-9'])('detecta «%s»', (texto) => {
    expect(contieneSku(texto)).toBe(true);
  });

  it.each(['Hola, ¿en qué te ayudo?', 'Sin código', 'SKU sin guion', 'SKU- vacío'])('no marca «%s»', (texto) => {
    expect(contieneSku(texto)).toBe(false);
  });
});
