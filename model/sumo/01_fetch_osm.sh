#!/usr/bin/env bash
# Download OpenStreetMap data for the study area (ODbL, (c) OpenStreetMap contributors).
# Without SUMO_SITE: the Melbourne CBD. With it: the area in sites/<name>.json (osm_bbox).
set -euo pipefail
cd "$(dirname "$0")"
source ./env.sh
read -r OSM BOX < <(python3 -c "from common import *; print(OSM, ','.join(map(str, SITE['osm_bbox'])) if SITE else '144.952,-37.816,144.974,-37.801')")
mkdir -p "$(dirname "$OSM")"
if [ ! -s "$OSM" ]; then
  curl -sS -A "barrier-brain-hackathon/0.1" -o "$OSM" "https://overpass-api.de/api/map?bbox=$BOX"
fi
ls -l "$OSM"
