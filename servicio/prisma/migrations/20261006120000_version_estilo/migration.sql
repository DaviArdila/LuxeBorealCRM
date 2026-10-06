-- CreateTable
CREATE TABLE "version_estilo" (
    "id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "texto" TEXT NOT NULL,
    "vigente" BOOLEAN NOT NULL DEFAULT false,
    "publicado_en" TIMESTAMPTZ(3) NOT NULL,
    "publicado_por_id" UUID,
    "publicado_por_nombre" TEXT,

    CONSTRAINT "version_estilo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "version_estilo_version_key" ON "version_estilo"("version");

-- AddForeignKey
ALTER TABLE "version_estilo" ADD CONSTRAINT "version_estilo_publicado_por_id_fkey" FOREIGN KEY ("publicado_por_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- [manual] version_estilo_vigente_key — índice único parcial (Fase 12, EST-D1):
-- exactamente una fila puede ser la vigente. Prisma no expresa índices parciales, así que se
-- escribe a mano; la comprobación de marcas [manual] (PER9) verifica que sigue existiendo.
CREATE UNIQUE INDEX "version_estilo_vigente_key" ON "version_estilo"("vigente") WHERE "vigente";

-- Copia del estilo de `parametro` (EST-D4, ADR-0024). Las tres claves viejas NO se borran aquí: se
-- conservan como respaldo hasta la limpieza de la fase (T11). Sin estilo guardado no se crea ninguna fila.
-- Los UUID v7 se arman en SQL (Postgres 16 no trae uuidv7()): un v4 aleatorio con la marca de tiempo
-- de la fila en los primeros 48 bits y los bits de versión en 7.
CREATE FUNCTION pg_temp.uuid7(instante TIMESTAMPTZ) RETURNS UUID AS $$
  SELECT encode(
    set_bit(
      set_bit(
        overlay(uuid_send(gen_random_uuid()) PLACING substring(int8send(floor(extract(epoch FROM instante) * 1000)::bigint) FROM 3) FROM 1 FOR 6),
        52, 1),
      53, 1),
    'hex')::uuid
$$ LANGUAGE sql VOLATILE;

-- Historial de `parametro`: versiones retiradas, cada una con la fecha en que dejó de regir (`fecha`).
-- La fecha de publicación de una versión es la de retiro de la anterior; la de la más antigua es la suya
-- propia (no se conoce otra). Una entrada dañada (sin versión entera positiva, texto o fecha) se ignora.
CREATE TEMP TABLE estilo_historial_migrado AS
SELECT DISTINCT ON (version) version, texto, fecha
FROM (
  SELECT
    CASE WHEN (elemento ->> 'version') ~ '^[0-9]{1,9}$' THEN (elemento ->> 'version')::int END AS version,
    CASE WHEN jsonb_typeof(elemento -> 'texto') = 'string' THEN elemento ->> 'texto' END AS texto,
    CASE WHEN (elemento ->> 'fecha') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T' THEN (elemento ->> 'fecha')::timestamptz END AS fecha
  FROM parametro,
       LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(valor) = 'array' THEN valor ELSE '[]'::jsonb END) AS elemento
  WHERE clave = 'prompt_estilo_historial'
    AND jsonb_typeof(elemento) = 'object'
) AS entradas
WHERE version > 0 AND texto IS NOT NULL AND fecha IS NOT NULL
ORDER BY version, fecha DESC;

-- Vigente: `prompt_estilo` con la versión de `prompt_estilo_version` (1 si falta o no es válida, como lee el
-- repositorio). Rige desde que se retiró la versión inmediatamente anterior; sin historial, desde su guardado.
WITH vigente AS (
  SELECT
    p.valor #>> '{}' AS texto,
    CASE
      WHEN jsonb_typeof(v.valor) = 'number' AND (v.valor #>> '{}') ~ '^[0-9]{1,9}$' THEN GREATEST((v.valor #>> '{}')::int, 1)
      ELSE 1
    END AS version,
    p.actualizado AS guardado
  FROM parametro p
  LEFT JOIN parametro v ON v.clave = 'prompt_estilo_version'
  WHERE p.clave = 'prompt_estilo'
    AND jsonb_typeof(p.valor) = 'string'
    AND btrim(p.valor #>> '{}') <> ''
)
INSERT INTO "version_estilo" ("id", "version", "texto", "vigente", "publicado_en")
SELECT
  pg_temp.uuid7(publicado_en), version, texto, true, publicado_en
FROM (
  SELECT
    vigente.version,
    vigente.texto,
    COALESCE(
      (SELECT h.fecha FROM estilo_historial_migrado h WHERE h.version < vigente.version ORDER BY h.version DESC LIMIT 1),
      vigente.guardado
    ) AS publicado_en
  FROM vigente
) AS fila;

-- Versiones retiradas (la vigente gana si el número coincide). Su fecha de publicación es la de retiro de la
-- versión anterior presente; la más antigua usa la suya.
INSERT INTO "version_estilo" ("id", "version", "texto", "vigente", "publicado_en")
SELECT
  pg_temp.uuid7(publicado_en), version, texto, false, publicado_en
FROM (
  SELECT
    h.version,
    h.texto,
    COALESCE(
      (SELECT a.fecha FROM estilo_historial_migrado a WHERE a.version < h.version ORDER BY a.version DESC LIMIT 1),
      h.fecha
    ) AS publicado_en
  FROM estilo_historial_migrado h
  WHERE EXISTS (SELECT 1 FROM "version_estilo" WHERE "vigente")
    AND h.version < (SELECT "version" FROM "version_estilo" WHERE "vigente")
) AS fila;

DROP TABLE estilo_historial_migrado;
DROP FUNCTION pg_temp.uuid7(TIMESTAMPTZ);
