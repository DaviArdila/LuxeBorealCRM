import { CASOS_DEL_SISTEMA, claveParametroLegada } from './sistema.js';

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
  readonly modo: 'literal';
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

const CATEGORIAS: readonly CategoriaPlan[] = [
  { nombre: 'Sistema', orden: 0 },
  { nombre: 'Políticas', orden: 1 },
];

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
export function planificarSemilla(filas: ReadonlyMap<string, unknown>): PlanSemilla {
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

  return { categorias: CATEGORIAS, casos: [...delSistema, ...politicas] };
}
