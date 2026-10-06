import { CASOS_DEL_SISTEMA, CATEGORIAS_INICIALES, claveParametroLegada } from './sistema.js';
import { validarCaso } from './validar-caso.js';

/** Una categoría que la semilla garantiza (CAS6). */
export interface CategoriaPlan {
  readonly nombre: string;
  readonly orden: number;
}

/** Un caso que la semilla crea si no existe. `claveParametro` es la fila de `parametro` de la que copió el texto. */
export interface CasoPlan {
  readonly claveSistema: string | null;
  readonly titulo: string;
  readonly cuandoAplica: string;
  readonly disparador: 'evento' | 'intencion';
  readonly modo: 'literal' | 'guia';
  readonly categoria: string;
  readonly texto: string;
  readonly claveParametro: string | null;
}

export interface PlanSemilla {
  readonly categorias: readonly CategoriaPlan[];
  readonly casos: readonly CasoPlan[];
}

const PREFIJO_POLITICA = 'politica_';
const PATRON_TEMA = /^[a-z0-9_]+$/;

/** Los temas de política de desarrollo y de producción conocidos llevan acentos que la clave no puede traer. */
const TITULOS_DE_TEMA: Readonly<Record<string, string>> = {
  garantia: 'Garantía',
  instalacion: 'Instalación',
};

function textoValido(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim().length > 0 ? valor.trim() : null;
}

function tituloDeTema(tema: string): string {
  const conocido = TITULOS_DE_TEMA[tema];
  if (conocido !== undefined) return conocido;
  const palabras = tema.replaceAll('_', ' ');
  return `${palabras.charAt(0).toUpperCase()}${palabras.slice(1)}`;
}

/**
 * Decide qué casos crea la semilla (CAS6) a partir de las filas de texto que ya hay en `parametro`: los once casos del
 * sistema (con el texto guardado si es válido y, si no, el de respaldo) y un caso de intención por cada fila
 * `politica_<tema>` (salvo `contra_entrega`, que ya es un caso del sistema). Función pura: no toca la base.
 */
export function planificarSemilla(filas: ReadonlyMap<string, unknown>, archivo?: CasosDeArchivo): PlanSemilla {
  const delSistema: CasoPlan[] = CASOS_DEL_SISTEMA.map((definicion) => {
    const claveParametro = claveParametroLegada(definicion.clave);
    const guardado = textoValido(filas.get(claveParametro));
    return {
      claveSistema: definicion.clave,
      titulo: definicion.titulo,
      cuandoAplica: definicion.descripcion,
      disparador: definicion.disparador,
      modo: 'literal',
      categoria: definicion.categoriaInicial,
      texto: guardado ?? definicion.textoRespaldo,
      claveParametro: guardado === null ? null : claveParametro,
    };
  });

  const clavesDelSistema = new Set(CASOS_DEL_SISTEMA.map((definicion) => claveParametroLegada(definicion.clave)));
  const politicas: CasoPlan[] = [...filas.keys()]
    .filter((clave) => clave.startsWith(PREFIJO_POLITICA) && !clavesDelSistema.has(clave))
    .sort()
    .flatMap((clave) => {
      const tema = clave.slice(PREFIJO_POLITICA.length);
      const texto = textoValido(filas.get(clave));
      if (texto === null || !PATRON_TEMA.test(tema)) return [];
      const titulo = tituloDeTema(tema);
      return [
        {
          claveSistema: null,
          titulo,
          cuandoAplica: `Cuando el cliente pregunta por ${titulo.toLowerCase()}.`,
          disparador: 'intencion' as const,
          modo: 'literal' as const,
          categoria: 'Políticas',
          texto,
          claveParametro: clave,
        },
      ];
    });

  const categoriasNuevas = (archivo?.categorias ?? []).map((categoria, indice) => ({ nombre: categoria.nombre, orden: CATEGORIAS_INICIALES.length + indice }));
  return { categorias: [...CATEGORIAS_INICIALES, ...categoriasNuevas], casos: [...delSistema, ...politicas, ...(archivo?.casos ?? [])] };
}

/** Los casos de intención de un archivo de datos de desarrollo, ya validados, y las categorías que traen y aún no existen. */
export interface CasosDeArchivo {
  readonly casos: readonly CasoPlan[];
  readonly categorias: readonly { readonly nombre: string }[];
}

export type ResultadoArchivoDeCasos = ({ readonly ok: true } & CasosDeArchivo) | { readonly ok: false; readonly motivo: string };

const CATEGORIAS_CONOCIDAS = new Set<string>(CATEGORIAS_INICIALES.map((categoria) => categoria.nombre));

function texto(valor: unknown): string | null {
  return typeof valor === 'string' ? valor : null;
}

/**
 * Valida un archivo `{ "casos": [{ categoria, titulo, cuandoAplica, texto, modo? }] }` de datos de desarrollo con las mismas
 * reglas que un caso creado por la API (CAS5). Todo o nada: el primer caso inválido rechaza el archivo y el motivo nombra su
 * posición, nunca su texto (R14). Función pura.
 */
export function leerArchivoDeCasos(contenido: unknown): ResultadoArchivoDeCasos {
  const casosCrudos = typeof contenido === 'object' && contenido !== null ? (contenido as { casos?: unknown }).casos : undefined;
  if (!Array.isArray(casosCrudos)) return { ok: false, motivo: 'el archivo debe ser un objeto con una lista «casos»' };
  const casos: CasoPlan[] = [];
  const categorias: string[] = [];
  for (const [indice, crudo] of casosCrudos.entries()) {
    const numero = indice + 1;
    const c = typeof crudo === 'object' && crudo !== null ? (crudo as Record<string, unknown>) : {};
    const categoria = texto(c['categoria'])?.trim();
    const titulo = texto(c['titulo']);
    const cuandoAplica = texto(c['cuandoAplica']);
    const textoDelCaso = texto(c['texto']);
    const modo = c['modo'] === undefined ? 'literal' : c['modo'];
    if (categoria === undefined || categoria === '' || titulo === null || cuandoAplica === null || textoDelCaso === null || (modo !== 'literal' && modo !== 'guia')) {
      return { ok: false, motivo: `caso ${String(numero)}: faltan campos o tienen el tipo equivocado (categoria, titulo, cuandoAplica, texto, modo)` };
    }
    const validacion = validarCaso({ titulo, cuandoAplica, texto: textoDelCaso, modo, disparador: 'intencion', claveSistema: null });
    if (!validacion.valido) return { ok: false, motivo: `caso ${String(numero)}: ${validacion.motivo}` };
    casos.push({ claveSistema: null, titulo: titulo.trim(), cuandoAplica: cuandoAplica.trim(), disparador: 'intencion', modo, categoria, texto: textoDelCaso.trim(), claveParametro: null });
    if (!CATEGORIAS_CONOCIDAS.has(categoria) && !categorias.includes(categoria)) categorias.push(categoria);
  }
  return { ok: true, casos, categorias: categorias.map((nombre) => ({ nombre })) };
}
