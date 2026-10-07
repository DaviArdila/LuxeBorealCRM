-- CreateTable
CREATE TABLE "seccion_estilo" (
    "id" UUID NOT NULL,
    "titulo" TEXT NOT NULL,
    "titulo_normalizado" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seccion_estilo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "seccion_estilo_titulo_normalizado_key" ON "seccion_estilo"("titulo_normalizado");

-- Parte el estilo vigente en secciones por sus encabezados de primer nivel `# `. Es la misma lógica que `dividirEstilo`
-- (`src/modulos/agente/dominio/secciones-estilo.ts`): lo anterior al primer encabezado es la sección «General», las
-- secciones sin texto se descartan y un título repetido (sin acentos ni mayúsculas) se numera «(2)», «(3)»…
-- Sin versión vigente no se inserta nada: rige el archivo de respaldo y las secciones se crean desde cero.
-- Los UUID v7 se arman en SQL (Postgres 16 no trae uuidv7()), como en la migración de `version_estilo`.
CREATE FUNCTION pg_temp.uuid7(instante TIMESTAMPTZ) RETURNS UUID AS $$
  SELECT encode(
    set_bit(
      set_bit(
        overlay(uuid_send(gen_random_uuid()) PLACING substring(int8send(floor(extract(epoch FROM instante) * 1000)::bigint) FROM 3) FROM 1 FOR 6),
        52, 1),
      53, 1),
    'hex')::uuid
$$ LANGUAGE sql VOLATILE;

CREATE FUNCTION pg_temp.normalizar(texto TEXT) RETURNS TEXT AS $$
  SELECT btrim(regexp_replace(lower(translate(texto, 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunaeiouun')), '\s+', ' ', 'g'))
$$ LANGUAGE sql IMMUTABLE;

WITH lineas AS (
  SELECT t.n, regexp_replace(t.linea, E'\r$', '') AS linea
  FROM "version_estilo" v,
       LATERAL unnest(string_to_array(v."texto", E'\n')) WITH ORDINALITY AS t(linea, n)
  WHERE v."vigente"
),
marcadas AS (
  SELECT n, linea, (linea ~ '^# ') AS es_encabezado, sum((linea ~ '^# ')::int) OVER (ORDER BY n) AS grupo
  FROM lineas
),
crudas AS (
  SELECT
    grupo,
    CASE
      WHEN grupo = 0 THEN 'General'
      ELSE btrim(substr((array_agg(linea ORDER BY n) FILTER (WHERE es_encabezado))[1], 3))
    END AS titulo,
    btrim(coalesce(string_agg(linea, E'\n' ORDER BY n) FILTER (WHERE NOT es_encabezado), ''), E' \t\r\n') AS texto
  FROM marcadas
  GROUP BY grupo
),
validas AS (
  SELECT
    row_number() OVER (ORDER BY grupo) - 1 AS orden,
    row_number() OVER (PARTITION BY pg_temp.normalizar(titulo) ORDER BY grupo) AS veces,
    titulo,
    texto
  FROM crudas
  WHERE titulo <> '' AND texto <> ''
),
finales AS (
  SELECT orden, texto, CASE WHEN veces = 1 THEN titulo ELSE titulo || ' (' || veces || ')' END AS titulo
  FROM validas
)
INSERT INTO "seccion_estilo" ("id", "titulo", "titulo_normalizado", "texto", "orden")
SELECT pg_temp.uuid7(CURRENT_TIMESTAMP), titulo, pg_temp.normalizar(titulo), texto, orden::int
FROM finales;

DROP FUNCTION pg_temp.normalizar(TEXT);
DROP FUNCTION pg_temp.uuid7(TIMESTAMPTZ);
