import { normalizarTexto } from '../../../compartido/texto/index.js';

/** Título de la sección que recoge el texto previo al primer encabezado `# ` al dividir un estilo. */
export const TITULO_SECCION_INICIAL = 'General';

/** Lo que `dividirEstilo` entrega: una sección sin orden ni estado, lista para guardarse. */
export interface SeccionDividida {
  readonly titulo: string;
  readonly texto: string;
}

/** Lo mínimo de una sección para componer el estilo. */
export interface SeccionParaComponer {
  readonly titulo: string;
  readonly texto: string;
  readonly orden: number;
  readonly activo: boolean;
}

/**
 * Estilo compuesto (EST-S1): las secciones activas por `orden`, cada una como `# título`, una línea en blanco y su
 * texto, separadas por una línea en blanco. Es el texto que el bot recibe y el que guarda cada foto de `version_estilo`.
 */
export function componerEstilo(secciones: readonly SeccionParaComponer[]): string {
  return secciones
    .filter((seccion) => seccion.activo)
    .sort((a, b) => a.orden - b.orden)
    .map((seccion) => `# ${seccion.titulo}\n\n${seccion.texto}`)
    .join('\n\n');
}

const ENCABEZADO = /^# (.*)$/;

/**
 * Parte un estilo en markdown por sus encabezados de primer nivel (`# `); los de nivel inferior se quedan en el texto de su
 * sección. Lo anterior al primer encabezado es la sección «General». Las secciones sin texto se descartan y un título
 * repetido (sin acentos ni mayúsculas) se numera «(2)», «(3)»… porque los títulos son únicos. Inversa de `componerEstilo`.
 * La migración `estilo_secciones` repite esta lógica en SQL: cualquier cambio aquí se replica allí.
 */
export function dividirEstilo(markdown: string): SeccionDividida[] {
  const crudas: { titulo: string; lineas: string[] }[] = [{ titulo: TITULO_SECCION_INICIAL, lineas: [] }];
  for (const linea of markdown.split('\n')) {
    const encabezado = ENCABEZADO.exec(linea.replace(/\r$/, ''));
    if (encabezado === null) {
      crudas[crudas.length - 1]?.lineas.push(linea);
    } else {
      crudas.push({ titulo: (encabezado[1] ?? '').trim(), lineas: [] });
    }
  }

  const vistos = new Map<string, number>();
  const secciones: SeccionDividida[] = [];
  for (const cruda of crudas) {
    const texto = cruda.lineas.join('\n').trim();
    if (texto.length === 0 || cruda.titulo.length === 0) continue;
    const clave = normalizarTexto(cruda.titulo);
    const veces = (vistos.get(clave) ?? 0) + 1;
    vistos.set(clave, veces);
    secciones.push({ titulo: veces === 1 ? cruda.titulo : `${cruda.titulo} (${String(veces)})`, texto });
  }
  return secciones;
}
