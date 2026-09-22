#!/bin/sh
set -eu

DATA_DIR="${REFUGES_DATA_DIR:-/usr/share/nginx/html/data}"
SNAPSHOT="$DATA_DIR/refuges.json"
CRONTAB="${SUPERCRONIC_CRONTAB:-/etc/refuges.crontab}"

snapshot_valide() {
  jq -e '
    (.refuges | type == "array" and length > 0) and
    (try (.updatedAt | sub("\\.[0-9]+Z$"; "Z") | fromdateiso8601 | type == "number") catch false)
  ' "$SNAPSHOT" > /dev/null 2>&1
}

mkdir -p "$DATA_DIR"
if snapshot_valide; then
  update-refuges || true
else
  update-refuges
fi

exec supercronic "$CRONTAB"
