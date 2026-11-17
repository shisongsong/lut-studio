#!/usr/bin/env bash
# Sync the static site to any VPS (see deploy/Caddyfile).
#
#   HOST=root@1.2.3.4 ./scripts/deploy-vps.sh
#   HOST=root@1.2.3.4 ./scripts/deploy-vps.sh /srv/lut-studio
#
# Nothing server-side is required: the app is plain static files. The browser
# inflates luts.bin.gz itself and falls back to navigator.language when
# /api/geo is absent, so python3 -m http.server is even enough for a smoke test.
set -euo pipefail
HOST="${HOST:?usage: HOST=user@host ./scripts/deploy-vps.sh [remote_dir]}"
REMOTE_DIR="${1:-/srv/lut-studio}"

npm run build:luts
npm run build:gz
rsync -az --delete public/ "${HOST}:${REMOTE_DIR}/"
echo "synced public/ -> ${HOST}:${REMOTE_DIR}/"
echo "make sure Caddy serves ${REMOTE_DIR} (see deploy/Caddyfile)"
