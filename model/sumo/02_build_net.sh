#!/usr/bin/env bash
# Convert the OSM extract to a SUMO network (cars and trams only), then apply the sourced turn rules.
#   --lefthand              Melbourne drives on the left: right turns cross oncoming traffic, left turns don't.
#                           (Until 30 Sep 8am the network was built right-hand, so every crossing turn was mirrored.)
#   --osm.turn-lanes        which lane each turn is made from, from OpenStreetMap turn:lanes arrows.
#   OSM turn restriction relations are applied by netconvert itself; 07_turn_rules.py checks them.
#   turn_rules.json         bans and hook turns from DTP signal sheets, applied in a second netconvert pass.
#   TLS_TYPE=delay_based    signals respond to waiting cars (SUMO's delay-based actuated control), roughly as
#                           SCATS does: green is held while delayed cars keep arriving, phases without demand
#                           are skipped. TLS_TYPE=actuated is SUMO's gap-based control (no phase skipping; on
#                           the big joined CBD junctions it wasted most of the cycle). TLS_TYPE=static gives the
#                           old fixed 90 s cycles.
# Settings kept from the first runs (30 Sep): signals only where OpenStreetMap has them, no internal junction
# lanes, and the network cut just east of Exhibition St (the Spring St junctions gridlocked).
#   SUMO_WORK=dir           build into another folder (the OSM extract is always read from work/).
#   Extra arguments go to 07_turn_rules.py, e.g. --allow 2921-latrobe-westbound-right-ban
set -euo pipefail
cd "$(dirname "$0")"
source ./env.sh
WORK="${SUMO_WORK:-$PWD/work}"
TLS="${TLS_TYPE:-delay_based}"
mkdir -p "$WORK"
opts=(--lefthand --keep-edges.by-vclass passenger,tram --geometry.remove --junctions.join
      --tls.join --tls.default-type "$TLS" --no-internal-links true
      --keep-edges.in-geo-boundary 144.952,-37.816,144.970,-37.801
      --remove-edges.isolated --output.street-names --osm.turn-lanes)
[ "$TLS" = static ] && opts+=(--tls.cycle.time 90)
netconvert --osm-files work/swanston.osm -o "$WORK/net_raw.net.xml" "${opts[@]}" >/dev/null 2>"$WORK/netconvert.log"
python3 07_turn_rules.py resolve "$@"
netconvert -s "$WORK/net_raw.net.xml" --connection-files "$WORK/turns.con.xml" --lefthand --no-internal-links true \
  -o "$WORK/net.net.xml" >/dev/null 2>"$WORK/netconvert_rules.log"
python3 07_turn_rules.py access
python3 07_turn_rules.py check
echo "signals: $(grep -o '<tlLogic[^>]*type="[^"]*"' "$WORK/net.net.xml" | grep -o 'type="[^"]*"' | sort | uniq -c | tr '\n' ' ')"
ls -l "$WORK/net.net.xml"
