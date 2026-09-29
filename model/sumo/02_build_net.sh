#!/usr/bin/env bash
# Convert the OSM extract to a SUMO network (cars and trams only).
# Settings chosen to avoid the artificial gridlock seen in the first runs (30 Sep):
#   signals only where OpenStreetMap has them (no guessed signals at tram crossings),
#   no internal junction lanes (simpler, higher capacity junctions),
#   fixed 90 s signal cycles, and the network cut just east of Exhibition St.
set -euo pipefail
cd "$(dirname "$0")"
source ./env.sh
netconvert --osm-files work/swanston.osm -o work/net.net.xml \
  --keep-edges.by-vclass passenger,tram --geometry.remove --junctions.join \
  --tls.join --tls.default-type static --tls.cycle.time 90 \
  --no-internal-links true \
  --keep-edges.in-geo-boundary 144.952,-37.816,144.970,-37.801 \
  --remove-edges.isolated --output.street-names --no-warnings true
ls -l work/net.net.xml
