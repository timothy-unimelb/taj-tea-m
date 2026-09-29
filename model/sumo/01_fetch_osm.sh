#!/usr/bin/env bash
# Download OpenStreetMap data for the Melbourne CBD study area (ODbL, (c) OpenStreetMap contributors).
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p work
if [ ! -s work/swanston.osm ]; then
  curl -sS -A "barrier-brain-hackathon/0.1" -o work/swanston.osm \
    "https://overpass-api.de/api/map?bbox=144.952,-37.816,144.974,-37.801"
fi
ls -l work/swanston.osm
