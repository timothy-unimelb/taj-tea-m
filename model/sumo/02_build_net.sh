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
#   SUMO_SITE=name          another site: area from sites/<name>.json, built in work/<name>/.
#   Extra arguments go to 07_turn_rules.py, e.g. --allow 2921-latrobe-westbound-right-ban
set -euo pipefail
cd "$(dirname "$0")"
source ./env.sh
read -r WORK OSM BOX VCLASS < <(python3 -c "from common import *; print(WORK, OSM, ','.join(map(str, BBOX)), SITE.get('vclasses', 'passenger,tram') if SITE else 'passenger,tram')")
TLS="${TLS_TYPE:-delay_based}"
mkdir -p "$WORK"
opts=(--lefthand --keep-edges.by-vclass "$VCLASS" --geometry.remove --junctions.join
      --tls.join --tls.default-type "$TLS" --no-internal-links true
      --keep-edges.in-geo-boundary "$BOX"
      --remove-edges.isolated --output.street-names --osm.turn-lanes)
[ "$TLS" = static ] && opts+=(--tls.cycle.time 90)
if [ -z "${SUMO_SITE:-}" ]; then
  netconvert --osm-files "$OSM" -o "$WORK/net_raw.net.xml" "${opts[@]}" >/dev/null 2>"$WORK/netconvert.log"
else
  # Other sites are built in two steps. Straight from OpenStreetMap, netconvert leaves a big junction as a knot
  # of short edges when it has a tram or bus stop inside ("Not joining junctions ... it contains a pt stop edge").
  # So: OpenStreetMap to plain network files first (they carry no stops), then join junctions from those.
  # A junction it still refuses because two carriageways run side by side is joined by name, and built again.
  # Not done for the CBD run, whose results were made with the single step above.
  first=(); second=()
  for o in "${opts[@]}"; do
    case "$o" in --geometry.remove|--junctions.join|--tls.join) second+=("$o");; *) first+=("$o");; esac
  done
  netconvert --osm-files "$OSM" --plain-output-prefix "$WORK/plain" -o "$WORK/net_unjoined.net.xml" "${first[@]}" >/dev/null 2>"$WORK/netconvert_osm.log"
  plain=(--node-files "$WORK/plain.nod.xml" --edge-files "$WORK/plain.edg.xml" --connection-files "$WORK/plain.con.xml"
         --tllogic-files "$WORK/plain.tll.xml" --type-files "$WORK/plain.typ.xml"
         --lefthand --tls.default-type "$TLS" --no-internal-links true --output.street-names "${second[@]}")
  [ "$TLS" = static ] && plain+=(--tls.cycle.time 90)
  netconvert "${plain[@]}" -o "$WORK/net_raw.net.xml" >/dev/null 2>"$WORK/netconvert.log"
  : > "$WORK/joins.txt"
  for round in 1 2 3 4; do
    before=$(wc -l < "$WORK/joins.txt")
    grep -oE 'Not joining junctions [0-9,]+ \(parallel incoming' "$WORK/netconvert.log" | awk '{print $4}' >> "$WORK/joins.txt" || true
    sort -u -o "$WORK/joins.txt" "$WORK/joins.txt"
    [ "$(wc -l < "$WORK/joins.txt")" -eq "$before" ] && break
    # The joins go inside the node file, each with its position (the middle of its nodes). Without a position,
    # or from a second node file, netconvert 1.x shifts the whole network by 2^30 m and puts the junction at y=0.
    python3 - "$WORK" <<'PY'
import re, sys
work = sys.argv[1]
nod = open(f"{work}/plain.nod.xml").read()
pos = {m.group(1): (float(m.group(2)), float(m.group(3))) for m in re.finditer(r'<node id="([^"]+)" x="([^"]+)" y="([^"]+)"', nod)}
joins = ""
for line in open(f"{work}/joins.txt"):
    ids = [i for i in line.strip().split(",") if i in pos]
    x, y = (sum(pos[i][k] for i in ids) / len(ids) for k in (0, 1))
    joins += f'    <join nodes="{" ".join(ids)}" x="{x:.2f}" y="{y:.2f}"/>\n'
open(f"{work}/plain_joined.nod.xml", "w").write(nod.replace("</nodes>", joins + "</nodes>"))
PY
    plain[1]="$WORK/plain_joined.nod.xml"
    netconvert "${plain[@]}" -o "$WORK/net_raw.net.xml" >/dev/null 2>"$WORK/netconvert.log"
  done
  echo "junctions joined by name: $(wc -l < "$WORK/joins.txt" | tr -d ' ')"
fi
python3 07_turn_rules.py resolve "$@"
netconvert -s "$WORK/net_raw.net.xml" --connection-files "$WORK/turns.con.xml" --lefthand --no-internal-links true \
  -o "$WORK/net.net.xml" >/dev/null 2>"$WORK/netconvert_rules.log"
python3 07_turn_rules.py access
python3 07_turn_rules.py check
echo "signals: $(grep -o '<tlLogic[^>]*type="[^"]*"' "$WORK/net.net.xml" | grep -o 'type="[^"]*"' | sort | uniq -c | tr '\n' ' ')"
ls -l "$WORK/net.net.xml"
