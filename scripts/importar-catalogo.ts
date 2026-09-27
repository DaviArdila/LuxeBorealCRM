import { Module, type DynamicModule, type Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  CatalogoModule,
  FUENTE_CATALOGO,
  FuenteCatalogoDirectorio,
  FuenteCatalogoSheets,
  ImportarCatalogo,
  type FuenteCatalogo,
  type ReporteImportacion,
} from '../src/modulos/catalogo/index.js';
import { ConfiguracionModule } from '../src/plataforma/config/index.js';
import { RelojModule } from '../src/plataforma/reloj/index.js';

/** Falla al parsear los argumentos de `catalogo:importar` (IMP13). */
export class ArgumentosImportacionInvalidos extends Error {}

type OrigenImportacion =
  | { readonly tipo: 'sheet'; readonly sheetId: string }
  | { readonly tipo: 'directorio'; readonly directorio: string };

interface ArgumentosImportacion {
  readonly origen: OrigenImportacion;
  readonly soloValidar: boolean;
}

export interface ResultadoImportarCatalogoCli {
  readonly limpio: boolean;
  readonly mensaje: string;
}

/**
 * Parsea `argumentos` (design.md D11, IMP13): exige exactamente uno de `--sheet-id <id>` o
 * `--dir <fixtures>`; `--solo-validar` es independiente de cuál de los dos se use. Función pura,
 * sin `NestFactory`, para que `importar-catalogo.spec.ts` la ejercite sin infraestructura real.
 */
export function parsearArgumentosImportacion(argumentos: readonly string[]): ArgumentosImportacion {
  const sheetId = valorDeFlag(argumentos, '--sheet-id');
  const directorio = valorDeFlag(argumentos, '--dir');
  const soloValidar = argumentos.includes('--solo-validar');

  if ((sheetId === null) === (directorio === null)) {
    throw new ArgumentosImportacionInvalidos(
      'catalogo:importar exige exactamente uno de --sheet-id <id> o --dir <fixtures>.',
    );
  }

  const origen: OrigenImportacion =
    sheetId !== null ? { tipo: 'sheet', sheetId } : { tipo: 'directorio', directorio: directorio as string };
  return { origen, soloValidar };
}

function valorDeFlag(argumentos: readonly string[], nombre: string): string | null {
  const indice = argumentos.indexOf(nombre);
  if (indice === -1) return null;
  return argumentos[indice + 1] ?? null;
}

function construirFuenteCatalogo(origen: OrigenImportacion): FuenteCatalogo {
  return origen.tipo === 'sheet' ? new FuenteCatalogoSheets(origen.sheetId) : new FuenteCatalogoDirectorio(origen.directorio);
}

/**
 * Módulo dinámico que provee `FUENTE_CATALOGO` con el adaptador correcto según el flag de CLI
 * usado en esta corrida (nota de deviación de `catalogo.module.ts`, T9; hallazgo de T10): se marca
 * `global: true` para que `ImportarCatalogo` (declarado dentro de `CatalogoModule`, que no importa
 * este módulo) pueda inyectarlo sin que `catalogo.module.ts` tenga que conocerlo — mismo mecanismo
 * que usan `ConfigModule.forRoot({ isGlobal: true })` u otros módulos dinámicos de Nest.
 */
@Module({})
class ProveedorFuenteCatalogo {
  static conAdaptador(fuenteCatalogo: FuenteCatalogo): DynamicModule {
    return {
      module: ProveedorFuenteCatalogo,
      global: true,
      providers: [{ provide: FUENTE_CATALOGO, useValue: fuenteCatalogo }],
      exports: [FUENTE_CATALOGO],
    };
  }
}

/**
 * Contexto de aplicación del comando (design.md D11, `ContextoImportacionCatalogo`): mismo patrón
 * que `scripts/sembrar-geografia.ts` (`NestFactory.createApplicationContext`, sin HTTP). `RelojModule`
 * se incluye explícito (D11: `CatalogoModule` no lo importa por sí mismo). La clase se declara
 * dentro de esta función —evaluada de nuevo en cada llamada— porque su import de
 * `ProveedorFuenteCatalogo.conAdaptador(...)` depende del origen (`--sheet-id`/`--dir`) de esta
 * corrida concreta.
 */
function crearContextoImportacionCatalogo(origen: OrigenImportacion): Type<unknown> {
  @Module({
    imports: [ConfiguracionModule, RelojModule, ProveedorFuenteCatalogo.conAdaptador(construirFuenteCatalogo(origen)), CatalogoModule],
  })
  class ContextoImportacionCatalogo {}
  return ContextoImportacionCatalogo;
}

/**
 * Comando explícito `npm run catalogo:importar` (D11, IMP13, criterio de salida de la fase): construye
 * su propio contexto de aplicación al ejecutarse (nunca una conexión abierta al importar este módulo,
 * A1) y lo cierra siempre, incluso si `ImportarCatalogo.ejecutar` falla.
 */
export async function importarCatalogo(argumentos: readonly string[]): Promise<ResultadoImportarCatalogoCli> {
  let parseo: ArgumentosImportacion;
  try {
    parseo = parsearArgumentosImportacion(argumentos);
  } catch (error) {
    return { limpio: false, mensaje: (error as Error).message };
  }

  const contexto = await NestFactory.createApplicationContext(crearContextoImportacionCatalogo(parseo.origen), {
    logger: false,
  });
  try {
    const casoDeUso = contexto.get(ImportarCatalogo);
    const reporte = await casoDeUso.ejecutar({ soloValidar: parseo.soloValidar });
    return construirResultado(reporte, parseo.soloValidar);
  } catch (error) {
    return { limpio: false, mensaje: `catalogo:importar: fallo inesperado: ${(error as Error).message}` };
  } finally {
    await contexto.close();
  }
}

function construirResultado(reporte: ReporteImportacion, soloValidar: boolean): ResultadoImportarCatalogoCli {
  if (!reporte.valido) {
    const problemas = [
      ...reporte.errores.map(
        (error) => `[${error.pestana}] fila ${error.fila}, columna ${error.columna}: ${error.mensaje}`,
      ),
      ...reporte.erroresFotos,
    ];
    return {
      limpio: false,
      mensaje: `catalogo:importar: catálogo inválido (${problemas.length} problema(s)):\n${problemas.join('\n')}`,
    };
  }

  if (soloValidar) {
    return {
      limpio: true,
      mensaje: 'catalogo:importar --solo-validar: el catálogo es válido y todas sus fotos son accesibles; no se escribió nada.',
    };
  }

  const resultado = reporte.resultado;
  if (resultado === null) {
    // No debería ocurrir: `valido === true` sin `--solo-validar` siempre trae `resultado` (ver
    // ImportarCatalogo.ejecutar). Se falla ruidosamente en vez de reportar un éxito sin datos.
    return { limpio: false, mensaje: 'catalogo:importar: la importación reportó éxito sin resultado.' };
  }

  return {
    limpio: true,
    mensaje:
      `catalogo:importar: importación completa (${resultado.productosActivados} producto(s) activo(s), ` +
      `${resultado.productosDesactivados} desactivado(s), ${resultado.fotosEscritas} foto(s) escrita(s)).`,
  };
}
