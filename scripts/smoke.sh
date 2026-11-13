#!/usr/bin/env bash
set -euo pipefail

# Uso: ./scripts/smoke.sh [http://localhost:3000]
base="${1:-http://localhost:3000}"
base="${base%/}"

check() {
  local caminho="$1" esperado="$2" codigo
  codigo="$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' "$base$caminho")"
  if [[ "$codigo" != "$esperado" ]]; then
    printf 'FALHOU GET %s: HTTP %s (esperado %s)\n' "$caminho" "$codigo" "$esperado" >&2
    exit 1
  fi
  printf 'OK GET %s: HTTP %s\n' "$caminho" "$codigo"
}

check /api/health 200

headers="$(curl --silent --show-error --dump-header - --output /dev/null "$base/painel")"
if ! grep -Eq '^HTTP/[^ ]+ (302|303|307|308)' <<< "$headers" || ! grep -Eiq '^location: .*/login' <<< "$headers"; then
  printf 'FALHOU GET /painel: esperado redirecionamento para /login\n' >&2
  exit 1
fi
printf 'OK GET /painel: redireciona para /login\n'

check /api/chat 401
check /api/cron/pendencias 401
