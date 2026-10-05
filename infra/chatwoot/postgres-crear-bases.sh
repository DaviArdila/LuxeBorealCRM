#!/usr/bin/env bash
# Crea (si no existen) el rol `luxeboreal` y las bases `luxeboreal` + `luxeboreal_test` en el
# Postgres de Chatwoot local (infra/chatwoot). Idempotente: se puede correr todas las veces.
# En el VPS (Dokploy) se corre el mismo SQL contra el servicio Postgres del template de Chatwoot,
# si se adopta esa topología (ver comentario en infra/chatwoot/docker-compose.yml).
set -euo pipefail
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DIR="$RAIZ/infra/chatwoot"
COMPOSE=(docker compose -f "$DIR/docker-compose.yml" --project-name luxeborealcrm-chatwoot)

PASS="$(grep -E '^LUXEBOREAL_DB_PASSWORD=' "$DIR/.env" | cut -d= -f2-)"
if [ -z "$PASS" ]; then
  echo "LUXEBOREAL_DB_PASSWORD no está en $DIR/.env (agrégalo o vuelve a correr infra/chatwoot/chatwoot-up.sh)" >&2
  exit 1
fi

"${COMPOSE[@]}" up -d postgres >/dev/null
"${COMPOSE[@]}" exec -T -e LUXEBOREAL_DB_PASSWORD="$PASS" postgres bash -s <<'EOS'
set -euo pipefail
psql -v ON_ERROR_STOP=1 -U postgres -d postgres <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'luxeboreal') THEN
    CREATE ROLE luxeboreal LOGIN CREATEDB PASSWORD '${LUXEBOREAL_DB_PASSWORD}';
  ELSE
    ALTER ROLE luxeboreal WITH CREATEDB PASSWORD '${LUXEBOREAL_DB_PASSWORD}';
  END IF;
END
\$\$;
SQL
for db in luxeboreal luxeboreal_test; do
  if ! psql -U postgres -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$db'" | grep -q 1; then
    psql -v ON_ERROR_STOP=1 -U postgres -d postgres -c "CREATE DATABASE $db OWNER luxeboreal"
  fi
done
psql -v ON_ERROR_STOP=1 -U postgres -d postgres -c "REVOKE CONNECT ON DATABASE chatwoot FROM luxeboreal" >/dev/null || true
EOS
echo "Bases listas en localhost:5433 → postgresql://luxeboreal:<password>@localhost:5433/luxeboreal"
