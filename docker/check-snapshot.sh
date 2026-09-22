#!/bin/sh
set -eu

SNAPSHOT="${REFUGES_DATA_DIR:-/usr/share/nginx/html/data}/refuges.json"
MAX_AGE_DAYS="${REFUGES_HEALTH_MAX_AGE_DAYS:-14}"

jq -e --argjson jours "$MAX_AGE_DAYS" '
  (.refuges | type == "array" and length > 0) and
  (try (((now - ((.updatedAt | sub("\\.[0-9]+Z$"; "Z")) | fromdateiso8601)) / 86400) as $age | $age >= 0 and $age < $jours) catch false)
' "$SNAPSHOT" > /dev/null 2>&1
