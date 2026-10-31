# UX audit, 2026-10-31

Five independent auditor agents, one lens each, all read-only against production through the
write-blocking check scripts (Vite on 5174 proxying flix.lan; plays, activity, markers, O,
ratings, deletes and Whisparr gets blocked; no app-database writes triggered):

| Report | Lens |
|---|---|
| `server.md` | API latency per route, cache layers, media proxy, Whisparr and StashDB costs |
| `client.md` | bundle, per-route load cost on phone and desktop, rendering, images, previews |
| `phone.md` | iPhone flows screen by screen, tap targets, taps-to-goal |
| `desktop.md` | 1440 and 1920 flows, keyboard, hover, focus, copy consistency |
| `ia.md` | jobs-to-be-done, naming, data freshness after every mutation, error handling |

These are the raw reports, kept as evidence; the synthesis and the plan are
`wiki/history/2026-10-31-ux-audit.md` and the "UX audit roadmap" block in `wiki/roadmap.md`.
Screenshot paths in the reports (`(scratch)/audit/...`) were session files and are not kept;
the scripts that produced them are in `scripts/` (perf-check, phone-flow, desktop-check,
api-latency, media-probe) and reproduce them in minutes.
