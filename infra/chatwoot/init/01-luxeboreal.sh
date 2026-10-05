#!/usr/bin/env bash
# Crea el rol y las bases de LuxeBorealCRM en el MISMO servidor Postgres de Chatwoot (ver comentario
# en ../docker-compose.yml sobre la topología de producción de CLAUDE.md §Stack).
# Corre solo al inicializar el volumen por primera vez (docker-entrypoint-initdb.d). Para un
# volumen que ya existe: bash infra/chatwoot/postgres-crear-bases.sh (misma lógica, idempotente).
set -euo pipefail
: "${LUXEBOREAL_DB_PASSWORD:?LUXEBOREAL_DB_PASSWORD no está definido}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'luxeboreal') THEN
    CREATE ROLE luxeboreal LOGIN CREATEDB PASSWORD '${LUXEBOREAL_DB_PASSWORD}';
  END IF;
END
\$\$;
SQL
for db in luxeboreal luxeboreal_test; do
  if ! psql --username "$POSTGRES_USER" --dbname postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$db'" | grep -q 1; then
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres -c "CREATE DATABASE $db OWNER luxeboreal"
  fi
done
# CREATEDB: solo para la shadow database de `prisma migrate dev` en desarrollo.
# El rol de la app no puede ni ver la base de Chatwoot.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres -c "REVOKE CONNECT ON DATABASE chatwoot FROM luxeboreal" || true
