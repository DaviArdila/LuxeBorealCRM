#!/usr/bin/env bash
# Levanta Chatwoot en local (infra/chatwoot/docker-compose.yml). Idempotente.
# Uso: bash scripts/chatwoot-up.sh          (primera vez genera infra/chatwoot/.env y prepara la BD)
#      bash scripts/chatwoot-up.sh down     (apaga; los datos quedan en los volúmenes)
set -euo pipefail
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIR="$RAIZ/infra/chatwoot"
COMPOSE=(docker compose -f "$DIR/docker-compose.yml" --project-name luxeborealcrm-chatwoot)

if [ "${1:-}" = "down" ]; then "${COMPOSE[@]}" down; exit 0; fi

if [ ! -f "$DIR/.env" ]; then
  echo "→ Generando $DIR/.env con secretos aleatorios"
  sed -e "s/^SECRET_KEY_BASE=.*/SECRET_KEY_BASE=$(openssl rand -hex 64)/" \
      -e "s/^REDIS_PASSWORD=.*/REDIS_PASSWORD=$(openssl rand -hex 16)/" \
      -e "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$(openssl rand -hex 16)/" \
      -e "s/^LUXEBOREAL_DB_PASSWORD=.*/LUXEBOREAL_DB_PASSWORD=$(openssl rand -hex 16)/" \
      "$DIR/.env.example" > "$DIR/.env"
  PRIMERA_VEZ=1
else
  PRIMERA_VEZ=0
fi

echo "→ Levantando postgres y redis"
"${COMPOSE[@]}" up -d postgres redis
if [ "$PRIMERA_VEZ" = "1" ]; then
  echo "→ Preparando la base de datos de Chatwoot (solo la primera vez, tarda 1-2 min)"
  "${COMPOSE[@]}" run --rm rails bundle exec rails db:chatwoot_prepare
fi
echo "→ Rol y bases de LuxeBorealCRM en el mismo Postgres (idempotente)"
bash "$RAIZ/scripts/postgres-crear-bases.sh"
echo "→ Levantando rails y sidekiq"
"${COMPOSE[@]}" up -d
printf "→ Esperando a que Chatwoot responda"
for _ in $(seq 1 60); do
  if curl -sf -o /dev/null http://localhost:3001/api; then echo " listo"; break; fi
  printf "."; sleep 3
done
"${COMPOSE[@]}" ps --format "table {{.Service}}\t{{.Status}}"

echo
echo "Chatwoot: http://localhost:3001"
if [ "$PRIMERA_VEZ" = "1" ]; then
cat <<P
Primera vez — pasos manuales (2 min):
  1. Abre http://localhost:3001 y crea la cuenta (registro habilitado en infra/chatwoot/.env).
  2. Perfil (abajo a la izquierda) → Configuración del perfil → "Token de acceso" → copiar.
  3. bash scripts/chatwoot-bootstrap.sh <ese token>   → crea inbox de pruebas + Agent Bot y te da las variables para .env
  4. (Opcional) Pon ENABLE_ACCOUNT_SIGNUP=false en infra/chatwoot/.env y vuelve a correr este script.
P
fi
