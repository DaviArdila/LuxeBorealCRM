#!/usr/bin/env bash
# SOLO PARA DESARROLLO: nunca se usa en producción. Borra TODOS los contactos de prueba del entorno LOCAL: Chatwoot (contactos, conversaciones,
# mensajes, adjuntos) y LuxeBoreal (contacto, conversacion, lead, uso_llm, evento_entrante, outbox).
# Uso: bash infra/chatwoot/limpiar-contactos.sh [--si]   (sin --si pide confirmación)
set -euo pipefail

CW_PG=chatwoot-local-postgres-1
CW_RAILS=chatwoot-local-rails-1
LUXE_PG=luxeborealcrm-postgres-1

if [[ "${1:-}" != "--si" ]]; then
  read -r -p "Esto borra TODOS los contactos locales (Chatwoot y LuxeBoreal). ¿Seguro? [s/N] " r
  [[ "$r" =~ ^[sS]$ ]] || { echo "Cancelado."; exit 1; }
fi

echo "› LuxeBoreal"
docker exec "$LUXE_PG" psql -U luxe -d luxeboreal -v ON_ERROR_STOP=1 -c "
begin;
delete from uso_llm;
delete from lead;
delete from contacto;
delete from evento_entrante;
delete from outbox;
commit;"

echo "› Chatwoot"
docker exec "$CW_RAILS" bundle exec rails runner "Contact.destroy_all" >/dev/null 2>&1

echo "› Esperando a Sidekiq (borrado asíncrono)"
for _ in $(seq 1 30); do
  n=$(docker exec "$CW_PG" psql -U postgres -d chatwoot -Atc \
    "select (select count(*) from contacts)+(select count(*) from conversations)+(select count(*) from messages)")
  [[ "$n" == "0" ]] && { echo "✔ Listo: todo en 0."; exit 0; }
  sleep 2
done
echo "✖ Quedan filas en Chatwoot; revisá Sidekiq." >&2
exit 1
