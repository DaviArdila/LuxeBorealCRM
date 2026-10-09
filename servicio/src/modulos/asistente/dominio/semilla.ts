import { CASOS_DEL_SISTEMA, CATEGORIAS_INICIALES } from './sistema.js';
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
  /** De dónde salió el texto de un caso inicial (CAS13); solo lo informa el resumen de la semilla, como cantidades. */
  readonly origenTexto?: 'caso-del-sistema' | 'parametro' | 'respaldo';
}

export interface PlanSemilla {
  readonly categorias: readonly CategoriaPlan[];
  readonly casos: readonly CasoPlan[];
}

/** Un caso de intención con el que nace el asistente; `claveParametro` es la fila de `parametro` que lo alimenta si existe. */
export type CasoInicial = Omit<CasoPlan, 'claveSistema' | 'disparador' | 'claveParametro'> & { readonly claveParametro: string };

/**
 * Los casos de intención que la semilla crea (CAS13): uno solo, «Tratamiento de datos». Es la parte de R14 que el dueño
 * puede reescribir: presenta al bot como asistente automatizado (P71) y pide la aceptación; la puerta de AGT26 vive en
 * código y no depende de que este caso exista. Si el dueño ya editó `aviso_datos` (caso del sistema o, antes, `parametro`), la semilla conserva ese texto sin tocar el caso del sistema.
 */
export const CASOS_INICIALES_DE_INTENCION: readonly CasoInicial[] = [
  {
    titulo: 'Tratamiento de datos',
    cuandoAplica:
      'Cuando el bot va a tomar datos de despacho o a registrar el interés de compra y el cliente aún no aceptó el tratamiento de datos (consentimiento pendiente).',
    modo: 'guia',
    categoria: 'Políticas',
    texto:
      'Soy un asistente automatizado. Uso tus datos de contacto y de entrega solo para gestionar tu pedido. ¿Aceptas el tratamiento de tus datos para continuar?',
    claveParametro: 'aviso_datos',
  },
];

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
 * Decide qué casos crea la semilla (CAS6) a partir de las filas de texto que ya hay en `parametro`: los casos del
 * sistema (con el texto guardado si es válido y, si no, el de respaldo), «Tratamiento de datos» (CAS13) y un caso de
 * intención por cada fila `politica_<tema>`. Ningún otro caso de negocio: contra entrega, cobertura y captura los crea el
 * dueño (CAS6, 12d). Función pura: no toca la base.
 */
export function planificarSemilla(
  filas: ReadonlyMap<string, unknown>,
  archivo?: CasosDeArchivo,
  textosDeCasosDelSistema: ReadonlyMap<string, unknown> = new Map(),
): PlanSemilla {
  const delSistema: CasoPlan[] = CASOS_DEL_SISTEMA.map((definicion) => {
    const claveParametro = definicion.clave;
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

  const iniciales: CasoPlan[] = CASOS_INICIALES_DE_INTENCION.map((inicial) => {
    const esValido = (texto: string | null): texto is string =>
      texto !== null &&
      validarCaso({ titulo: inicial.titulo, cuandoAplica: inicial.cuandoAplica, texto, modo: inicial.modo, disparador: 'intencion', claveSistema: null }).valido;
    // CAS13: el texto que el dueño ya editó manda: primero el caso del sistema, luego `parametro`, al final el respaldo.
    const delCasoDelSistema = textoValido(textosDeCasosDelSistema.get(inicial.claveParametro));
    const deParametro = textoValido(filas.get(inicial.claveParametro));
    const origenTexto = esValido(delCasoDelSistema) ? 'caso-del-sistema' : esValido(deParametro) ? 'parametro' : 'respaldo';
    return {
      claveSistema: null,
      titulo: inicial.titulo,
      cuandoAplica: inicial.cuandoAplica,
      disparador: 'intencion',
      modo: inicial.modo,
      categoria: inicial.categoria,
      texto: origenTexto === 'caso-del-sistema' ? (delCasoDelSistema ?? inicial.texto) : origenTexto === 'parametro' ? (deParametro ?? inicial.texto) : inicial.texto,
      claveParametro: origenTexto === 'parametro' ? inicial.claveParametro : null,
      origenTexto,
    };
  });

  const clavesDelSistema = new Set<string>(CASOS_DEL_SISTEMA.map((definicion) => definicion.clave));
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
  return { categorias: [...CATEGORIAS_INICIALES, ...categoriasNuevas], casos: [...delSistema, ...iniciales, ...politicas, ...(archivo?.casos ?? [])] };
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
