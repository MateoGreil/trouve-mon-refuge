#!/bin/sh
set -eu

API_URL="${REFUGES_API_URL:-https://www.refuges.info/api/bbox?bbox=world&types_point=7%2C9%2C10&nb_points=all&detail=complet&format=geojson&format_texte=texte&cache=3600}"
DATA_DIR="${REFUGES_DATA_DIR:-/usr/share/nginx/html/data}"
MAX_AGE_DAYS="${REFUGES_MAX_AGE_DAYS:-7}"

SNAPSHOT="$DATA_DIR/refuges.json"
SOURCE_TMP="$SNAPSHOT.source.$$"
COMPACT_TMP="$SNAPSHOT.tmp.$$"

est_recent() {
  [ -f "$SNAPSHOT" ] || return 1
  [ "$(
    jq -r --argjson jours "$MAX_AGE_DAYS" \
      'try ((now - ((.updatedAt | sub("\\.[0-9]+Z$"; "Z")) | fromdateiso8601)) / 86400 < $jours) catch false' \
      "$SNAPSHOT" 2>/dev/null
  )" = "true" ]
}

nettoyer() {
  rm -f "$SOURCE_TMP" "$COMPACT_TMP"
}
trap nettoyer EXIT INT TERM

if est_recent; then
  exit 0
fi

curl -fsSL --max-time 300 "$API_URL" -o "$SOURCE_TMP"

jq -c '{
  updatedAt: (now | todateiso8601),
  refuges: [.features[].properties | {
    id,
    name: .nom,
    type: .type.valeur,
    capacity: .places.valeur,
    altitude: .coord.alt,
    latitude: .coord.lat,
    longitude: .coord.long,
    url: .lien,
    closed: (.etat.valeur // ""),
    chimney: (.info_comp.cheminee.valeur == "Oui"),
    water: (.info_comp.eau.valeur == "Oui"),
    forest: (.info_comp.bois.valeur == "Oui")
  }]
}' "$SOURCE_TMP" > "$COMPACT_TMP"

jq -e '(.updatedAt | type == "string") and (.refuges | length > 0)' "$COMPACT_TMP" > /dev/null

mv "$COMPACT_TMP" "$SNAPSHOT"
