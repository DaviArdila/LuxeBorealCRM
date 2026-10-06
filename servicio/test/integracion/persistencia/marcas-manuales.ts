import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import type { Client } from 'pg';

/**
 * Helper del guardián de PER9 (`specs/persistencia/spec.md`, D4 de `design.md`): lee todas las
 * marcas `-- [manual] <nombre> — <motivo>` de `prisma/migrations/**` y comprueba, contra el
 * catálogo real de Postgres, que cada objeto marcado sigue existiendo con su forma esperada. No es
 * código de producción (nada bajo `src/` lo importa): es la guardia de `npm run verify` para esta
 * fase, documentada en `prisma/README.md`.
 */

const PATRON_MARCADOR = /^--\s*\[manual\]\s*(\S+)\s*—/u;
const NOMBRE_INDICE_ZONA = 'zona_sin_cobertura_departamento_id_ciudad_id_key';
const NOMBRE_CHECK_CANTIDAD = 'movimiento_inventario_cantidad_positiva_check';
const NOMBRE_CHECK_USUARIO = 'movimiento_inventario_usuario_si_origen_usuario_check';
const NOMBRE_INDICE_ESTILO_VIGENTE = 'version_estilo_vigente_key';

export type TipoObjetoManual = 'indice_nulls_not_distinct' | 'indice_unico_parcial' | 'check' | 'desconocido';

type FormaEsperada =
  | {
      readonly tipo: 'indice_nulls_not_distinct';
      readonly tabla: string;
      readonly columnas: readonly string[];
    }
  | {
      readonly tipo: 'indice_unico_parcial';
      readonly tabla: string;
      readonly columnas: readonly string[];
      /** El predicado `WHERE` tal como lo imprime Postgres, sin espacios ni paréntesis. */
      readonly predicado: string;
    }
  | {
      readonly tipo: 'check';
      readonly tabla: string;
      readonly expresion: string;
    };

const FORMAS_ESPERADAS = new Map<string, FormaEsperada>([
  [
    NOMBRE_INDICE_ZONA,
    {
      tipo: 'indice_nulls_not_distinct',
      tabla: 'zona_sin_cobertura',
      columnas: ['departamento_id', 'ciudad_id'],
    },
  ],
  [
    NOMBRE_INDICE_ESTILO_VIGENTE,
    {
      tipo: 'indice_unico_parcial',
      tabla: 'version_estilo',
      columnas: ['vigente'],
      predicado: 'vigente',
    },
  ],
  [
    NOMBRE_CHECK_CANTIDAD,
    {
      tipo: 'check',
      tabla: 'movimiento_inventario',
      expresion: 'cantidad>0',
    },
  ],
  [
    NOMBRE_CHECK_USUARIO,
    {
      tipo: 'check',
      tabla: 'movimiento_inventario',
      expresion: "origen<>'usuario'orusuario_idisnotnull",
    },
  ],
]);

export interface ObjetoManual {
  readonly nombre: string;
  readonly tipo: TipoObjetoManual;
}

/**
 * Recorre cada `migration.sql` bajo `carpetaMigraciones` y extrae las marcas `[manual]`. Solo se
 * aceptan objetos con una forma esperada registrada; una marca nueva sin guardia conocida falla de
 * forma segura hasta que se añada su verificación al catálogo.
 */
export function leerMarcasManuales(carpetaMigraciones: string): readonly ObjetoManual[] {
  const objetos: ObjetoManual[] = [];
  const entradas = readdirSync(carpetaMigraciones, { withFileTypes: true });
  for (const entrada of entradas) {
    if (!entrada.isDirectory()) continue;
    const rutaSql = path.join(carpetaMigraciones, entrada.name, 'migration.sql');
    const contenido = readFileSync(rutaSql, 'utf8');
    for (const linea of contenido.split('\n')) {
      const coincidencia = PATRON_MARCADOR.exec(linea.trim());
      if (!coincidencia) continue;
      const nombre = coincidencia[1];
      const forma = FORMAS_ESPERADAS.get(nombre);
      objetos.push({
        nombre,
        tipo: forma?.tipo ?? 'desconocido',
      });
    }
  }
  return objetos;
}

export interface ResultadoVerificacionManual {
  readonly ok: boolean;
  readonly faltantes: readonly string[];
}

/**
 * Confirma, contra el catálogo real de Postgres (`pg_constraint` para `CHECK`, `pg_index` para el
 * índice único con `NULLS NOT DISTINCT` y para el índice único parcial), que cada objeto marcado sigue existiendo con su forma
 * esperada. Si una migración futura lo borra o lo recrea sin la cláusula/condición correcta, el
 * objeto no aparece con la forma esperada y queda en `faltantes`.
 */
export async function verificarMarcasManuales(
  cliente: Client,
  objetos: readonly ObjetoManual[],
): Promise<ResultadoVerificacionManual> {
  const faltantes: string[] = [];
  for (const objeto of objetos) {
    const forma = FORMAS_ESPERADAS.get(objeto.nombre);
    if (!forma || forma.tipo !== objeto.tipo) {
      faltantes.push(objeto.nombre);
      continue;
    }

    let existe: boolean;
    if (forma.tipo === 'check') {
      existe = await existeCheck(cliente, objeto.nombre, forma.tabla, forma.expresion);
    } else if (forma.tipo === 'indice_unico_parcial') {
      existe = await existeIndiceUnicoParcial(cliente, objeto.nombre, forma.tabla, forma.columnas, forma.predicado);
    } else {
      existe = await existeIndiceNullsNotDistinct(cliente, objeto.nombre, forma.tabla, forma.columnas);
    }
    if (!existe) {
      faltantes.push(objeto.nombre);
    }
  }
  return { ok: faltantes.length === 0, faltantes };
}

async function existeCheck(
  cliente: Client,
  nombre: string,
  tabla: string,
  expresionEsperada: string,
): Promise<boolean> {
  const resultado = await cliente.query<{ expresion: string }>(
    `SELECT regexp_replace(
       regexp_replace(lower(pg_get_expr(conbin, conrelid)), '::origen_movimiento', '', 'g'),
       '[[:space:]()"]', '', 'g'
     ) AS expresion
     FROM pg_constraint
     WHERE conname = $1
       AND contype = 'c'
       AND conrelid = to_regclass($2)
       AND convalidated`,
    [nombre, `public.${tabla}`],
  );
  return resultado.rows.some((fila) => fila.expresion === expresionEsperada);
}

async function existeIndiceNullsNotDistinct(
  cliente: Client,
  nombre: string,
  tabla: string,
  columnasEsperadas: readonly string[],
): Promise<boolean> {
  const resultado = await cliente.query<{ existe: boolean }>(
    `SELECT EXISTS (
       SELECT 1
       FROM pg_index i
       JOIN pg_class AS indice ON indice.oid = i.indexrelid
       JOIN pg_class AS tabla ON tabla.oid = i.indrelid
       JOIN pg_namespace AS esquema ON esquema.oid = tabla.relnamespace
       WHERE indice.relname = $1
         AND tabla.relname = $2
         AND esquema.nspname = 'public'
         AND i.indisunique
         AND i.indisvalid
         AND i.indnullsnotdistinct
         AND i.indnkeyatts = $4
         AND i.indnatts = $4
         AND (
           SELECT array_agg(columna.attname::text ORDER BY clave.ordinalidad)
           FROM unnest(i.indkey) WITH ORDINALITY AS clave(attnum, ordinalidad)
           JOIN pg_attribute AS columna
             ON columna.attrelid = i.indrelid
             AND columna.attnum = clave.attnum
         ) = $3::text[]
     ) AS existe`,
    [nombre, tabla, columnasEsperadas, columnasEsperadas.length],
  );
  return resultado.rows[0]?.existe === true;
}

async function existeIndiceUnicoParcial(
  cliente: Client,
  nombre: string,
  tabla: string,
  columnasEsperadas: readonly string[],
  predicadoEsperado: string,
): Promise<boolean> {
  const resultado = await cliente.query<{ predicado: string }>(
    `SELECT regexp_replace(lower(pg_get_expr(i.indpred, i.indrelid)), '[[:space:]()"]', '', 'g') AS predicado
     FROM pg_index i
     JOIN pg_class AS indice ON indice.oid = i.indexrelid
     JOIN pg_class AS tabla ON tabla.oid = i.indrelid
     JOIN pg_namespace AS esquema ON esquema.oid = tabla.relnamespace
     WHERE indice.relname = $1
       AND tabla.relname = $2
       AND esquema.nspname = 'public'
       AND i.indisunique
       AND i.indisvalid
       AND i.indpred IS NOT NULL
       AND i.indnkeyatts = $4
       AND (
         SELECT array_agg(columna.attname::text ORDER BY clave.ordinalidad)
         FROM unnest(i.indkey) WITH ORDINALITY AS clave(attnum, ordinalidad)
         JOIN pg_attribute AS columna
           ON columna.attrelid = i.indrelid
           AND columna.attnum = clave.attnum
       ) = $3::text[]`,
    [nombre, tabla, columnasEsperadas, columnasEsperadas.length],
  );
  return resultado.rows.some((fila) => fila.predicado === predicadoEsperado);
}
