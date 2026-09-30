const MONTO = /\$\s?\d[\d.,]*/g;
const NUMERO = /\d[\d.,]*/g;

function soloDigitos(texto: string): string {
  return texto.replace(/\D/g, '');
}

/**
 * D9 de la Fase 07b: cuenta los montos en pesos (`$` + dígitos) del texto final que no aparecen en
 * ningún resultado de herramienta del mismo turno (R1: todo dato citado se rastrea). Compara solo los
 * dígitos, así `$389.000` coincide con `$ 389.000` sin depender del formato. Devuelve una cantidad,
 * nunca el texto (R14); no bloquea la respuesta.
 */
export function contarMontosSinRastro(textoFinal: string, resultadosParaElModelo: readonly unknown[]): number {
  const respaldados = new Set<string>();
  for (const resultado of resultadosParaElModelo) {
    for (const numero of JSON.stringify(resultado ?? null).match(NUMERO) ?? []) {
      respaldados.add(soloDigitos(numero));
    }
  }
  let sinRastro = 0;
  for (const monto of textoFinal.match(MONTO) ?? []) {
    if (!respaldados.has(soloDigitos(monto))) {
      sinRastro += 1;
    }
  }
  return sinRastro;
}
