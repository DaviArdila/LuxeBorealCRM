const NUM = String.raw`\d+(?:[.,]\d+)*`;
const ESCALA = String.raw`(?:\s?(mil|mill[oó]n(?:es)?)\b)?`;
/**
 * Una cifra cuenta como dinero solo si lleva moneda: `$15.000`, `$15 mil`, `COP 15000`, `15.000 pesos`,
 * `15 mil pesos`, `1,5 millones de pesos`, `15.000 COP`. Un número suelto (un año, un teléfono, «2 días»,
 * «15 mil seguidores») no es dinero y no se audita.
 */
const MONTO = new RegExp(
  String.raw`(?:(?:\$|\bCOP)\s?(${NUM})${ESCALA}(?:\s?(?:pesos?|COP)\b)?` +
    String.raw`|\b(${NUM})${ESCALA}(?:\s+de)?\s?(?:pesos?|COP)\b)`,
  'gi',
);
const NUMERO = new RegExp(NUM, 'g');

/** Valor numérico de una cifra escrita con puntos o comas: `389.000` → 389000, `1,5` → 1.5. */
function valorDeCifra(cifra: string): number {
  if (/^\d{1,3}(?:[.,]\d{3})+$/.test(cifra)) {
    return Number(cifra.replace(/[.,]/g, ''));
  }
  return Number(cifra.replace(',', '.').replace(/[.,](?=.*[.,])/g, ''));
}

function multiplicador(escala: string | undefined): number {
  if (escala === undefined) {
    return 1;
  }
  return escala.toLowerCase() === 'mil' ? 1_000 : 1_000_000;
}

/** Valores en pesos de cada monto del texto, ya normalizados (`15 mil` y `$15.000` valen lo mismo). */
function montosDelTexto(texto: string): number[] {
  return [...texto.matchAll(MONTO)].map((coincidencia) => {
    const cifra = coincidencia[1] ?? coincidencia[3] ?? '0';
    const escala = coincidencia[1] !== undefined ? coincidencia[2] : coincidencia[4];
    return Math.round(valorDeCifra(cifra) * multiplicador(escala));
  });
}

/**
 * D9 de la Fase 07b: cuenta los montos en pesos del texto final que no aparecen en ningún resultado de
 * herramienta del mismo turno (R1: todo dato citado se rastrea). Reconoce `$`, `COP`, «pesos» y «mil» /
 * «millones», y compara el valor completo (no los dígitos sueltos), así `$389.000`, `389000` y
 * `$ 389.000` coinciden sin depender del formato, y `15 mil pesos` coincide con `$15.000`. Devuelve una
 * cantidad, nunca el texto (R14); no bloquea la respuesta.
 */
export function contarMontosSinRastro(textoFinal: string, resultadosParaElModelo: readonly unknown[]): number {
  const respaldados = new Set<number>();
  for (const resultado of resultadosParaElModelo) {
    const serializado = JSON.stringify(resultado ?? null);
    for (const numero of serializado.match(NUMERO) ?? []) {
      respaldados.add(valorDeCifra(numero));
    }
    for (const monto of montosDelTexto(serializado)) {
      respaldados.add(monto);
    }
  }
  return montosDelTexto(textoFinal).filter((monto) => !respaldados.has(monto)).length;
}
