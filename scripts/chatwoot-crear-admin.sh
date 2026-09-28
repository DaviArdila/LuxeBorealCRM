#!/usr/bin/env bash
# Crea (idempotente) la cuenta "LuxeBorealCRM" y un usuario administrador en el Chatwoot local, y
# devuelve su token de acceso (el que pide chatwoot-bootstrap.sh). Evita el registro manual en la UI.
# Uso: bash scripts/chatwoot-crear-admin.sh <email> <password>
set -euo pipefail
EMAIL="${1:?Uso: bash scripts/chatwoot-crear-admin.sh <email> <password>}"
PASS="${2:?falta password}"
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
docker compose -f "$RAIZ/infra/chatwoot/docker-compose.yml" --project-name luxeborealcrm-chatwoot exec -T rails \
  bundle exec rails runner "
    account = Account.find_or_create_by!(name: 'LuxeBorealCRM')
    user = User.find_by(email: '$EMAIL')
    unless user
      user = User.new(name: 'Admin', email: '$EMAIL', password: '$PASS', password_confirmation: '$PASS')
      user.skip_confirmation!
      user.save!
    end
    AccountUser.find_or_create_by!(account: account, user: user) { |au| au.role = :administrator }
    puts \"TOKEN=#{user.access_token.token}\"
  " 2>/dev/null | grep '^TOKEN='
