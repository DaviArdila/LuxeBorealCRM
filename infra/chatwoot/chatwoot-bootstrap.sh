#!/usr/bin/env bash
# Crea (idempotente) en Chatwoot local: inbox tipo API "WhatsApp (pruebas)" y el Agent Bot apuntando a
# este servicio, y lo asigna al inbox. Imprime las variables para .env.
# Uso: bash infra/chatwoot/chatwoot-bootstrap.sh <token de acceso de un administrador> [url chatwoot] [url bot]
set -euo pipefail
TOKEN="${1:?Uso: bash infra/chatwoot/chatwoot-bootstrap.sh <admin_token> [http://localhost:3001] [http://host.docker.internal:3000/api/v1/webhooks/chatwoot]}"
CW="${2:-http://localhost:3001}"
BOT_URL="${3:-http://host.docker.internal:3000/api/v1/webhooks/chatwoot}"
NOMBRE_INBOX="WhatsApp (pruebas)"
NOMBRE_BOT="LuxeBorealCRM bot"

api() { # api METODO RUTA [JSON]
  local metodo="$1" ruta="$2" cuerpo="${3:-}"
  if [ -n "$cuerpo" ]; then
    curl -sf -X "$metodo" "$CW$ruta" -H "api_access_token: $TOKEN" -H "Content-Type: application/json" -d "$cuerpo"
  else
    curl -sf -X "$metodo" "$CW$ruta" -H "api_access_token: $TOKEN"
  fi
}
campo() { node -e "const j=JSON.parse(require('fs').readFileSync(0,'utf8'));const v=$1;process.stdout.write(v==null?'':String(v))"; }

ACC=$(api GET /api/v1/profile | campo "j.accounts?.[0]?.id ?? j.account_id")
[ -n "$ACC" ] || { echo "✗ No se pudo leer la cuenta con ese token"; exit 1; }
echo "→ Cuenta: $ACC"

INBOX_ID=$(api GET "/api/v1/accounts/$ACC/inboxes" | campo "(j.payload||[]).find(i=>i.name===$(printf '%s' "$NOMBRE_INBOX" | node -e "process.stdout.write(JSON.stringify(require('fs').readFileSync(0,'utf8')))"))?.id")
if [ -z "$INBOX_ID" ]; then
  INBOX_ID=$(api POST "/api/v1/accounts/$ACC/inboxes" "{\"name\":\"$NOMBRE_INBOX\",\"channel\":{\"type\":\"api\",\"webhook_url\":\"\"}}" | campo "j.id")
  echo "→ Inbox API creado: $INBOX_ID"
else
  echo "→ Inbox API ya existía: $INBOX_ID"
fi

BOT_JSON=$(api GET "/api/v1/accounts/$ACC/agent_bots" | node -e "const j=JSON.parse(require('fs').readFileSync(0,'utf8'));const b=(Array.isArray(j)?j:j.payload||[]).find(b=>b.name===process.argv[1]);process.stdout.write(b?JSON.stringify(b):'')" "$NOMBRE_BOT")
if [ -z "$BOT_JSON" ]; then
  BOT_JSON=$(api POST "/api/v1/accounts/$ACC/agent_bots" "{\"name\":\"$NOMBRE_BOT\",\"description\":\"Bot automatico LuxeBorealCRM\",\"outgoing_url\":\"$BOT_URL\"}")
  echo "→ Agent Bot creado"
else
  BOT_ID_TMP=$(printf '%s' "$BOT_JSON" | campo "j.id")
  BOT_JSON=$(api PATCH "/api/v1/accounts/$ACC/agent_bots/$BOT_ID_TMP" "{\"outgoing_url\":\"$BOT_URL\"}")
  echo "→ Agent Bot ya existía; outgoing_url actualizada"
fi
BOT_ID=$(printf '%s' "$BOT_JSON" | campo "j.id")
BOT_TOKEN=$(printf '%s' "$BOT_JSON" | campo "j.access_token")
BOT_SECRET=$(printf '%s' "$BOT_JSON" | campo "j.secret")
[ -n "$BOT_SECRET" ] || { echo "✗ El bot no devolvió 'secret' — ¿el token es de un administrador y Chatwoot es ≥ 4.13?"; exit 1; }

api POST "/api/v1/accounts/$ACC/inboxes/$INBOX_ID/set_agent_bot" "{\"agent_bot\":$BOT_ID}" > /dev/null
echo "→ Bot $BOT_ID asignado al inbox $INBOX_ID"

cat <<MSG

Copia esto en servicio/.env:

CHATWOOT_URL=$CW
CHATWOOT_ACCOUNT_ID=$ACC
CHATWOOT_BOT_TOKEN=$BOT_TOKEN
CHATWOOT_WEBHOOK_SECRETO=$BOT_SECRET
MSG
