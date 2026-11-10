#!/usr/bin/env python3
"""whisparr.py: Whisparr v3 API client (copied from the nas repo's arr.py on 2026-11-02, narrowed to Whisparr).
URL and key from flix's .env (WHISPARR_URL, WHISPARR_API_KEY); never printed.

Usage: whisparr.py [options] [whisparr3] <command> [args]

Commands (all read-only):
  ping                 .env -> host -> port -> app -> key -> identity, with timing
  status               version, uptime, health, disks, queue counts, active commands, next tasks
  health               health warnings with wiki links
  queue                download queue with tracked state and messages
  history              recent events (--since 24h, --failed, --limit N)
  wanted               counts of missing and cutoff-unmet items
  logs                 recent log lines at --level (default warn) and above
  config [section..]   every setting as app/section/key/value; sections match by name or prefix
  snapshot [section..] write redacted config JSON to private/ops/inventory/whisparr3/ (git diff shows changes)
  get <path> [k=v..]   raw GET of /api/<ver>/<path>, redacted JSON

Writes (dry run unless --apply; --apply runs the app's Backup first unless --no-backup):
  post|put <path> <json|@file> [k=v..]   body may use ${env:NAME} placeholders filled from .env
  delete <path> [json|@file] [k=v..]
  set <resource>/<id> key=value..        edit one object in place (top-level keys or fields.<name>);
                       secrets stay intact because the object is never round-tripped through redaction
  cmd <Name> [k=v..]   app command, waits for completion (RssSync, RescanSeries seriesId=11, ...)

Neutral output: add --neutral to any command and everything it prints goes through
`node scripts/neutral.mjs redact` first: ids, numbers, dates and states stay, every title, name,
path, indexer and release name becomes a token (wiki/runbooks/neutral-observability.md). Use this
form in an assistant session; without a .env, `node scripts/neutral.mjs whisparr …` reaches
Whisparr from inside the flix pod instead.

Output: TSV with a header line on stdout (--json: one JSON object per line).
Failures: one line per app on stderr: ERR<TAB>app<TAB>code<TAB>detail<TAB>hint.
Exit: 0 ok, 1 some apps failed, 2 usage or .env problem, 3 every app failed.
Config: <APP>_API_KEY required in .env; <APP>_HOST and <APP>_PORT optional (defaults 192.168.0.10
and the app's port). ARR_ENV_FILE overrides the .env path.
"""
import argparse
import re
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from arrlib import core  # noqa: E402
from arrlib.apps import APPS  # noqa: E402
from arrlib.commands import COLUMNS, COMMANDS  # noqa: E402
from arrlib.core import ArrError, NotApplicable, emit, err_line  # noqa: E402


def parse_since(s):
    if not s:
        return None
    m = re.fullmatch(r"(\d+)([smhd])", s)
    if not m:
        raise SystemExit(f"whisparr.py: --since wants e.g. 30m, 24h, 7d (got {s!r})")
    return int(m.group(1)) * {"s": 1, "m": 60, "h": 3600, "d": 86400}[m.group(2)]


def main(argv):
    ap = argparse.ArgumentParser(prog="whisparr.py", description=__doc__.split("\n\n")[0],
                                 formatter_class=argparse.RawDescriptionHelpFormatter, epilog=__doc__.split("\n\n", 1)[1])
    ap.add_argument("target", help="app name, comma list, or all")
    ap.add_argument("command", choices=sorted(COMMANDS))
    ap.add_argument("args", nargs="*")
    ap.add_argument("--json", action="store_true", help="JSON lines instead of TSV")
    ap.add_argument("-v", "--verbose", action="store_true", help="log each request to stderr")
    ap.add_argument("--limit", type=int, default=50, help="rows for queue/history/logs (default 50)")
    ap.add_argument("--since", help="history/logs window: 30m, 24h, 7d")
    ap.add_argument("--level", default="warn", choices=["trace", "debug", "info", "warn", "error", "fatal"])
    ap.add_argument("--failed", action="store_true", help="history: failures only")
    ap.add_argument("--tasks", type=int, default=3, dest="limit_tasks", help="status: next N scheduled tasks")
    ap.add_argument("--apply", action="store_true", help="writes: actually send (default is a dry run)")
    ap.add_argument("--no-backup", action="store_true", help="writes: skip the app's Backup command before --apply")
    ap.add_argument("--wait", type=int, default=120, help="cmd: seconds to wait for completion (default 120)")
    ap.add_argument("--add-keys", action="store_true", help="set: allow creating top-level keys the object lacks")
    ap.add_argument("--timeout", type=float, help="read timeout in seconds for slow endpoints (default 15 GET, 60 write)")
    if argv and argv[0] in COMMANDS:  # the app is optional: Whisparr is the only one
        argv = ["whisparr3", *argv]
    opts = ap.parse_args(argv)
    opts.since_seconds = parse_since(opts.since)
    core.VERBOSE = opts.verbose
    if opts.timeout:
        core.READ_TIMEOUT = core.WRITE_TIMEOUT = opts.timeout

    explicit = opts.target != "all"
    names = list(APPS) if not explicit else [n.strip().lower() for n in opts.target.split(",") if n.strip()]
    unknown = [n for n in names if n not in APPS]
    if unknown:
        print(f"whisparr.py: unknown app {', '.join(unknown)} (know: {' '.join(APPS)})", file=sys.stderr)
        return 2

    env = core.load_env()
    fn = COMMANDS[opts.command]

    def run(name):
        app = APPS[name]
        try:
            c = core.Client(app, env)
        except ArrError as e:
            return name, None, e
        try:
            return name, fn(c, opts), None
        except (ArrError, NotApplicable) as e:
            return name, None, e
        except Exception as e:  # a bug in one app's handling must not hide the others
            return name, None, ArrError("E_BUG", f"{type(e).__name__}: {e}", "report this; rerun with -v")

    with ThreadPoolExecutor(max_workers=len(names)) as pool:
        results = list(pool.map(run, names))

    rows, failed, skipped, na = [], [], [], []
    for name, r, e in results:
        if isinstance(e, NotApplicable):
            na.append((name, str(e)))
        elif e is not None and e.code == "E_ENV" and not explicit:
            skipped.append(name)
            if opts.command == "ping":
                rows.append({"app": name, "result": "unset", "detail": f"no {name.upper()}_API_KEY"})
        elif e is not None:
            failed.append((name, e))
            if opts.command == "ping":
                rows.append({"app": name, "result": "FAIL", "detail": f"{e.code} {e.detail} -> {e.hint}"})
        else:
            rows.extend(r)

    if opts.command == "get":
        for r in rows:
            print(core.json.dumps({"app": r["app"], **({"data": r["json"]})}, separators=(",", ":"))
                  if len(names) > 1 else core.json.dumps(r["json"], indent=1))
    elif opts.command == "config" and opts.json:
        emit(rows, (), as_json=True)
    else:
        emit(rows, COLUMNS[opts.command], as_json=opts.json)

    for name, e in failed:
        if opts.command != "ping":
            err_line(name, e)
    for name, why in na:
        print(f"NA\t{name}\t{why}", file=sys.stderr)
    if skipped:
        print(f"SKIP\t{','.join(skipped)}\tno *_API_KEY in {core.env_path()}", file=sys.stderr)

    ran = len(names) - len(skipped) - len(na)
    findings = False
    if skipped and not ran and not na:
        return 2
    if any(e.code == "E_ENV" for _, e in failed):
        return 2
    if failed and len(failed) == ran:
        return 3
    return 1 if failed or findings else 0


if __name__ == "__main__":
    if "--neutral" in sys.argv:
        sys.exit(core.run_neutral(__file__, sys.argv[1:]))
    sys.exit(main(sys.argv[1:]))
