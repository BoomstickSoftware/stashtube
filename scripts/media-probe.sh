#!/usr/bin/env bash
# Probes media proxy URLs (GET, read-only): status, bytes, time, content-type, cache-control, etag,
# content-length, and the asset-fetch counter delta (did the BFF go to Stash?). Two passes each.
# Usage: scripts/media-probe.sh <base> <url>...   e.g. /media/stash/scene/2775/screenshot?w=640
BASE=${1:-http://flix.lan}; shift
up() { curl -s -m 10 "$BASE/api/admin/cache" | python3 -c 'import json,sys; print(json.load(sys.stdin)["upstream"]["assets"])'; }
printf 'url\tpass\tstatus\tms\tbytes\ttype\tcache_control\tetag\tcontent_length\tstash_assets\n'
for u in "$@"; do for pass in 1 2; do
  a0=$(up); h=$(mktemp)
  read -r t sz code <<<"$(curl -s -m 60 -D "$h" -o /dev/null -w '%{time_total} %{size_download} %{http_code}' "$BASE$u")"
  a1=$(up)
  g() { grep -i "^$1:" "$h" | tr -d '\r' | cut -d' ' -f2-; }
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$u" "$pass" "$code" "$(python3 -c "print(round($t*1000))")" "$sz" "$(g content-type)" "$(g cache-control)" "$(g etag | head -c 40)" "$(g content-length)" "$((a1-a0))"
  rm -f "$h"
done; done
