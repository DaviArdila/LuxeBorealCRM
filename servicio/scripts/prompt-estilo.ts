import { readFile } from 'node:fs/promises';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  AdministrarSeccionesEstilo,
  EstiloModule,
  ListarHistorialEstilo,
  ProveedorEstilo,
  PublicarEstilo,
  RestaurarEstilo,
} from '../src/modulos/agente/index.js';
import { ConfiguracionModule } from '../src/plataforma/config/index.js';
import { RelojModule } from '../src/plataforma/reloj/index.js';

/** Falla al parsear los argumentos de `prompt:estilo` (AGT22). */
export class ArgumentosEstiloInvalidos extends Error {}

export type ArgumentosEstilo =
  | { readonly accion: 'ver' }
  | { readonly accion: 'historial' }
  | { readonly accion: 'secciones' }
  | { readonly accion: 'publicar'; readonly archivo: string }
  | { readonly accion: 'restaurar'; readonly version: number };

export interface ResultadoPromptEstiloCli {
  readonly limpio: boolean;
  readonly mensaje: string;
}

/** Lo que el comando necesita de `agente`, como dobles en las pruebas y como casos de uso reales en producción. */
export interface DependenciasEstilo {
  readonly proveedor: Pick<ProveedorEstilo, 'obtener'>;
  readonly listar: Pick<ListarHistorialEstilo, 'ejecutar'>;
  readonly secciones: Pick<AdministrarSeccionesEstilo, 'listar'>;
  readonly publicar: Pick<PublicarEstilo, 'ejecutar'>;
  readonly restaurar: Pick<RestaurarEstilo, 'ejecutar'>;
  readonly leerArchivo: (ruta: string) => Promise<string>;
}

const AYUDA =
  'prompt:estilo exige una acción: ver, historial, secciones, publicar --archivo <ruta> o restaurar --version <n>.';

function valorDeFlag(argumentos: readonly string[], nombre: string): string | null {
  const indice = argumentos.indexOf(nombre);
  return indice === -1 ? null : (argumentos[indice + 1] ?? null);
}

/** Parsea los argumentos (AGT22). Función pura, sin Nest, para probarla sin infraestructura. */
export function parsearArgumentosEstilo(argumentos: readonly string[]): ArgumentosEstilo {
  const [accion, ...resto] = argumentos;
  switch (accion) {
    case 'ver':
    case 'historial':
    case 'secciones':
      return { accion };
    case 'publicar': {
      const archivo = valorDeFlag(resto, '--archivo');
      if (archivo === null) {
        throw new ArgumentosEstiloInvalidos('prompt:estilo publicar exige --archivo <ruta>.');
      }
      return { accion, archivo };
    }
    case 'restaurar': {
      const crudo = valorDeFlag(resto, '--version');
      if (crudo === null || !/^\d+$/.test(crudo) || Number(crudo) < 1) {
        throw new ArgumentosEstiloInvalidos('prompt:estilo restaurar exige --version <n> (un entero mayor que 0).');
      }
      return { accion, version: Number(crudo) };
    }
    default:
      throw new ArgumentosEstiloInvalidos(AYUDA);
  }
}

const RECORDATORIO_EVALS =
  'Antes de exponerlo a clientes corre los evals reales: EVALS_MODO=real npm run evals (EVL3).';

/**
 * Ejecuta la acción pedida y arma el reporte (AGT22, D6 de la Fase 08c). `ver` muestra el texto en la terminal
 * de quien lo pide; ni `publicar`, ni `restaurar`, ni `historial` lo copian en el mensaje ni en logs (R14).
 */
export async function ejecutarEstilo(argumentos: readonly string[], dependencias: DependenciasEstilo): Promise<ResultadoPromptEstiloCli> {
  let pedido: ArgumentosEstilo;
  try {
    pedido = parsearArgumentosEstilo(argumentos);
  } catch (error) {
    return { limpio: false, mensaje: (error as Error).message };
  }

  switch (pedido.accion) {
    case 'ver': {
      const estilo = await dependencias.proveedor.obtener();
      const origen = estilo.origen === 'base' ? 'base de datos' : 'archivo de respaldo';
      return { limpio: true, mensaje: `prompt:estilo: estilo vigente, versión ${String(estilo.version)}, origen ${origen}.\n\n${estilo.texto}` };
    }
    case 'historial': {
      const { vigente, historial } = await dependencias.listar.ejecutar();
      const lineas = [
        vigente === null ? 'prompt:estilo: sin estilo publicado (rige el archivo de respaldo).' : `prompt:estilo: vigente, versión ${String(vigente.version)}.`,
        ...historial.map((v) => `  versión ${String(v.version)} · retirada ${v.fecha} · ${String(v.texto.length)} caracteres`),
      ];
      if (historial.length === 0) lineas.push('  (historial vacío)');
      return { limpio: true, mensaje: lineas.join('\n') };
    }
    case 'secciones': {
      const secciones = await dependencias.secciones.listar();
      if (secciones.length === 0) return { limpio: true, mensaje: 'prompt:estilo: sin secciones (rige el archivo de respaldo).' };
      const lineas = secciones.map(
        (s) => `  ${String(s.orden)} · ${s.activo ? 'activa' : 'apagada'} · ${s.titulo} · ${String(s.texto.length)} caracteres`,
      );
      return { limpio: true, mensaje: ['prompt:estilo: secciones del estilo (orden · estado · título · largo).', ...lineas].join('\n') };
    }
    case 'publicar': {
      let texto: string;
      try {
        texto = await dependencias.leerArchivo(pedido.archivo);
      } catch {
        return { limpio: false, mensaje: `prompt:estilo: no se pudo leer el archivo "${pedido.archivo}".` };
      }
      return reportar(await dependencias.publicar.ejecutar(texto), 'publicado');
    }
    case 'restaurar':
      return reportar(await dependencias.restaurar.ejecutar(pedido.version), 'restaurado');
  }
}

function reportar(
  resultado: { readonly publicado: true; readonly version: number } | { readonly publicado: false; readonly motivo: string },
  verbo: string,
): ResultadoPromptEstiloCli {
  if (!resultado.publicado) {
    return { limpio: false, mensaje: `prompt:estilo: no se publicó: ${resultado.motivo}.` };
  }
  return { limpio: true, mensaje: `prompt:estilo: estilo ${verbo}, versión ${String(resultado.version)}.\n${RECORDATORIO_EVALS}` };
}

/**
 * Contexto mínimo del comando: configuración, reloj y el estilo editable, sin levantar HTTP, el LLM ni las
 * colas. Mismo patrón que `catalogo:importar`: se crea al ejecutarse y se cierra siempre.
 */
@Module({ imports: [ConfiguracionModule, RelojModule, EstiloModule] })
class ContextoPromptEstilo {}

/** Comando `npm run prompt:estilo` (AGT22): `ver`, `historial`, `secciones`, `publicar --archivo` y `restaurar --version`. */
export async function promptEstilo(argumentos: readonly string[]): Promise<ResultadoPromptEstiloCli> {
  try {
    parsearArgumentosEstilo(argumentos);
  } catch (error) {
    return { limpio: false, mensaje: (error as Error).message };
  }
  const contexto = await NestFactory.createApplicationContext(ContextoPromptEstilo, { logger: false });
  try {
    return await ejecutarEstilo(argumentos, {
      proveedor: contexto.get(ProveedorEstilo),
      listar: contexto.get(ListarHistorialEstilo),
      secciones: contexto.get(AdministrarSeccionesEstilo),
      publicar: contexto.get(PublicarEstilo),
      restaurar: contexto.get(RestaurarEstilo),
      leerArchivo: (ruta) => readFile(ruta, 'utf8'),
    });
  } catch (error) {
    return { limpio: false, mensaje: `prompt:estilo: fallo inesperado: ${(error as Error).message}` };
  } finally {
    await contexto.close();
  }
}
