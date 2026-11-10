#!/usr/bin/env bash
# Times GET routes on flix (read-only). For each route: N samples with the browser's
# Accept-Encoding, recording total time, compressed bytes, Content-Encoding, Cache-Control, ETag,
# and how many upstream requests (Stash queries, assets; Whisparr/StashDB are not counted by the
# server) the sample caused, read from GET /api/admin/cache before and after.
# Usage: scripts/api-latency.sh [base] [samples] [routes-file] > out.tsv   (no routes file: the built-in list below)
BASE=${1:-http://flix.lan}; N=${2:-4}; ROUTES=${3:-}
if [ -z "$ROUTES" ]; then ROUTES=$(mktemp); cat > "$ROUTES" <<'ROUTES_EOF'
/api/home
/api/scenes?perPage=24
/api/scenes?perPage=24&page=2
/api/scenes?perPage=24&page=3
/api/scenes/facets
/api/scenes/2775
/api/scenes/2775/related
/api/performers?perPage=24
/api/performers/447
/api/performers/807
/api/scenes?performers=447&perPage=40
/api/scenes?performers=807&perPage=40
/api/scenes/facets?performers=447
/api/scenes/facets?performers=807
/api/studios/6
/api/scenes?studios=6&perPage=40
/api/scenes/facets?studios=6
/api/tags/tiles
/api/tags/25
/api/scenes?tags=25&perPage=40
/api/search?q=a
/api/search?q=the%20first%20one
/api/whisparr/performer/447
/api/whisparr/performer/807
/api/whisparr/studio/6
/api/whisparr/new
/api/whisparr/activity
/api/history
/api/playlists
/api/settings
/api/stats
/api/duplicates
/api/stations
/api/stations/resume
/api/featured
/api/features
/api/blocklist
/api/favorites
/api/rows
/api/scenes/hidden
/api/tags?perPage=1000
/api/studios?perPage=200
/api/scenes?inProgress=1&perPage=1
ROUTES_EOF
fi
up() { curl -s -m 10 "$BASE/api/admin/cache" | python3 -c 'import json,sys; d=json.load(sys.stdin); u=d["upstream"]; print(u["queries"], u["assets"])'; }
printf 'route\tsample\tms\tbytes_gz\tbytes_raw\tencoding\tcache_control\tetag\tstash_queries\tstash_assets\tstatus\n'
while IFS= read -r route; do
  [ -z "$route" ] && continue; case "$route" in \#*) continue;; esac
  for i in $(seq 1 "$N"); do
    read -r q0 a0 <<<"$(up)"
    hdr=$(mktemp)
    out=$(curl -s -m 60 -D "$hdr" -o /dev/null -H 'Accept-Encoding: gzip, deflate, br' -w '%{time_total} %{size_download} %{http_code}' "$BASE$route")
    read -r t sz code <<<"$out"
    read -r q1 a1 <<<"$(up)"
    enc=$(grep -i '^content-encoding:' "$hdr" | tr -d '\r' | cut -d' ' -f2-)
    cc=$(grep -i '^cache-control:' "$hdr" | tr -d '\r' | cut -d' ' -f2-)
    et=$(grep -i '^etag:' "$hdr" | tr -d '\r' | cut -d' ' -f2-)
    raw=''
    if [ "$i" = 1 ]; then raw=$(curl -s -m 60 -o /dev/null -w '%{size_download}' "$BASE$route"); fi
    ms=$(python3 -c "print(round($t*1000))")
    printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$route" "$i" "$ms" "$sz" "$raw" "${enc:--}" "${cc:--}" "${et:--}" "$((q1-q0))" "$((a1-a0))" "$code"
    rm -f "$hdr"
  done
done < "$ROUTES"
