#!/bin/sh
set -eu

SNAPSHOT="${REFUGES_DATA_DIR:-/usr/share/nginx/html/data}/refuges.json"

if [ -f "$SNAPSHOT" ]; then
  /usr/local/bin/update-refuges || true
else
  /usr/local/bin/update-refuges
fi

(
  while :; do
    sleep 86400
    /usr/local/bin/update-refuges || true
  done
) &
