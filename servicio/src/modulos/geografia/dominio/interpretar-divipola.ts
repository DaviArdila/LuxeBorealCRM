import { FuenteDivipolaInvalida } from './geografia.js';
import type { CatalogoGeografico } from './geografia.js';

/**
 * Nombres reales de los cuatro campos usados del dataset SODA `gdxc-w37w` (datos.gov.co),
 * verificados en ejecución real (T4, 2026-09-25, `prisma/datos/divipola.procedencia.json`):
 * coinciden exactamente con la presunción de `design.md` D9, sin necesidad de ajuste.
 */
const CAMPOS = {
  codigoDepartamento: 'cod_dpto',
  departamento: 'dpto',
  codigoMunicipio: 'cod_mpio',
  municipio: 'nom_mpio',
} as const;

interface DatosCiudad {
  readonly departamentoId: string;
  readonly nombre: string;
}

/**
 * Convierte el texto JSON crudo del archivo DIVIPOLA (design.md D9) en un
 * {@link CatalogoGeografico} validado. Sin más dependencia que `./geografia.js` (mismo `dominio/`,
 * regla de fronteras `dominio-aislado`, skill `luxeboreal-arquitectura` §2): no importa nada de
 * `@nestjs`, `@prisma/client` ni ningún paquete externo. Rellena con ceros a la izquierda, valida
 * la forma y la jerarquía de cada código, y detecta códigos repetidos con datos distintos. Lanza
 * {@link FuenteDivipolaInvalida} ante cualquier violación, nombrando la fila y la regla; nunca
 * vuelca el contenido completo del archivo (P15).
 */
export function interpretarDivipola(textoJson: string): CatalogoGeografico {
  const filas = parsearFilas(textoJson);

  const departamentos = new Map<string, string>();
  const ciudades = new Map<string, DatosCiudad>();

  filas.forEach((fila, indice) => {
    const numeroFila = indice + 1;

    const codigoDepartamento = normalizarCodigo(
      leerCampo(fila, CAMPOS.codigoDepartamento, numeroFila),
      2,
    );
    const nombreDepartamento = normalizarNombre(
      leerCampo(fila, CAMPOS.departamento, numeroFila),
    );
    const codigoMunicipio = normalizarCodigo(
      leerCampo(fila, CAMPOS.codigoMunicipio, numeroFila),
      5,
    );
    const nombreMunicipio = normalizarNombre(leerCampo(fila, CAMPOS.municipio, numeroFila));

    if (!/^\d{2}$/.test(codigoDepartamento)) {
      throw new FuenteDivipolaInvalida(
        numeroFila,
        `código de departamento inválido: "${codigoDepartamento}" (MUST cumplir ^\\d{2}$)`,
      );
    }
    if (!/^\d{5}$/.test(codigoMunicipio)) {
      throw new FuenteDivipolaInvalida(
        numeroFila,
        `código de municipio inválido: "${codigoMunicipio}" (MUST cumplir ^\\d{5}$)`,
      );
    }
    if (!codigoMunicipio.startsWith(codigoDepartamento)) {
      throw new FuenteDivipolaInvalida(
        numeroFila,
        `el código de municipio "${codigoMunicipio}" no empieza con el código de su ` +
          `departamento "${codigoDepartamento}"`,
      );
    }

    const departamentoPrevio = departamentos.get(codigoDepartamento);
    if (departamentoPrevio !== undefined && departamentoPrevio !== nombreDepartamento) {
      throw new FuenteDivipolaInvalida(
        numeroFila,
        `código de departamento "${codigoDepartamento}" repetido con nombre distinto`,
      );
    }
    departamentos.set(codigoDepartamento, nombreDepartamento);

    const ciudadPrevia = ciudades.get(codigoMunicipio);
    if (
      ciudadPrevia !== undefined &&
      (ciudadPrevia.departamentoId !== codigoDepartamento ||
        ciudadPrevia.nombre !== nombreMunicipio)
    ) {
      throw new FuenteDivipolaInvalida(
        numeroFila,
        `código de municipio "${codigoMunicipio}" repetido con datos distintos`,
      );
    }
    ciudades.set(codigoMunicipio, { departamentoId: codigoDepartamento, nombre: nombreMunicipio });
  });

  return {
    departamentos: [...departamentos.entries()].map(([id, nombre]) => ({ id, nombre })),
    ciudades: [...ciudades.entries()].map(([id, datos]) => ({
      id,
      departamentoId: datos.departamentoId,
      nombre: datos.nombre,
    })),
  };
}

function parsearFilas(textoJson: string): readonly Record<string, unknown>[] {
  let datos: unknown;
  try {
    datos = JSON.parse(textoJson);
  } catch {
    throw new FuenteDivipolaInvalida(0, 'el archivo no es JSON válido');
  }
  if (!Array.isArray(datos)) {
    throw new FuenteDivipolaInvalida(0, 'el archivo MUST ser un arreglo de filas');
  }
  return datos as Record<string, unknown>[];
}

function leerCampo(fila: Record<string, unknown>, campo: string, numeroFila: number): string {
  const valor = fila[campo];
  if (typeof valor !== 'string' || valor.trim() === '') {
    throw new FuenteDivipolaInvalida(numeroFila, `falta el campo "${campo}"`);
  }
  return valor;
}

function normalizarCodigo(valor: string, longitud: number): string {
  return valor.trim().padStart(longitud, '0');
}

function normalizarNombre(valor: string): string {
  return valor.trim().normalize('NFC');
}
