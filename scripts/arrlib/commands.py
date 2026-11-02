"""Read-only commands. Each takes (client, opts) and returns a list of row dicts; COLUMNS
gives the TSV column order. Raise ArrError for failures, NotApplicable when meaningless."""
import json
from datetime import datetime, timezone
from pathlib import Path

from .core import REPO, ArrError, NotApplicable, flatten, human_age, human_bytes, parse_ts, redact

SNAPSHOT_DIR = REPO / "private" / "ops" / "inventory"
# Values that change on their own and would make every snapshot diff noisy.
_VOLATILE = {"freeSpace", "totalSpace", "unmappedFolders", "lastExecution", "lastStartTime",
             "lastDuration", "nextExecution", "lastWriteTime"}

COLUMNS = {
    "ping": ("app", "result", "app_version", "api", "ms", "url", "detail"),
    "status": ("app", "key", "value"),
    "health": ("app", "type", "source", "message", "wiki"),
    "queue": ("app", "id", "state", "status", "protocol", "client", "size", "left", "eta", "title", "messages"),
    "history": ("app", "date", "event", "quality", "client", "title", "detail"),
    "wanted": ("app", "missing", "cutoff_unmet"),
    "logs": ("app", "time", "level", "logger", "message"),
    "config": ("app", "section", "key", "value"),
    "snapshot": ("app", "section", "result", "items", "path"),
    "get": ("app", "json"),
}


def _now():
    return datetime.now(timezone.utc)


def _require_media(c):
    if not c.app.media:
        raise NotApplicable(f"{c.app.name} has no media library or queue")


# --- ping -------------------------------------------------------------------------------

def ping(c, opts):
    import time
    t0 = time.monotonic()
    try:
        c.request("GET", "/ping", auth=False)      # reachability without the key
    except ArrError as e:
        if e.code in ("E_API", "E_PROTO", "E_HTTP"):
            who = c.identify()
            raise ArrError("E_APP", f":{c.port} is not a Servarr app ({who or 'no /ping'})",
                           f"wrong {c.app.env}_PORT ({c.app.name} default {c.app.port})")
        raise
    try:
        st = c.get("system/status")
    except ArrError as e:
        if e.code in ("E_AUTH", "E_API"):
            who = c.identify()
            if who and who != c.app.name:
                raise ArrError("E_APP", f":{c.port} is {who}, not {c.app.name}",
                               f"wrong {c.app.env}_PORT ({c.app.name} default {c.app.port})")
            if e.code == "E_AUTH":
                raise ArrError("E_AUTH", f"{c.app.name} is up on :{c.port} but rejected "
                               + e.detail.replace(" rejected (401)", " (401)"), e.hint)
        raise
    got = (st.get("appName") or "?").lower()
    if got == "whisparr" and str(st.get("version", "")).startswith("3."):
        got = "whisparr3"   # v3 reports appName "Whisparr"; the major version tells the instances apart
    if got != c.app.name:
        raise ArrError("E_APP", f":{c.port} is {st.get('appName')} {st.get('version')}, not {c.app.name}",
                       f"wrong {c.app.env}_PORT ({c.app.name} default {c.app.port})")
    ms = round((time.monotonic() - t0) * 1000)
    return [{"app": c.app.name, "result": "ok", "app_version": st.get("version"), "api": c.app.api,
             "ms": ms, "url": c.url, "detail": f"branch={st.get('branch')}"}]


# --- status -----------------------------------------------------------------------------

def status(c, opts):
    a = c.app.name
    rows = []
    add = lambda k, v: rows.append({"app": a, "key": k, "value": v})
    st = c.get("system/status")
    add("version", f"{st.get('appName')} {st.get('version')} branch={st.get('branch')} api={c.app.api}")
    started = parse_ts(st.get("startTime"))
    if started:
        add("uptime", human_age((_now() - started).total_seconds()))
    add("platform", f"{st.get('osName')} {st.get('osVersion')} {st.get('runtimeName', '')} "
                    f"{st.get('runtimeVersion', '')} db={st.get('databaseType')} {st.get('databaseVersion', '')}".strip())
    add("auth", st.get("authentication"))

    health = c.get("health") or []
    add("health", "ok" if not health else ", ".join(
        f"{n} {t}" for t, n in sorted(_count(h.get("type") for h in health).items())))
    for h in health:
        add(f"health.{h.get('type')}", f"{h.get('source')}: {h.get('message')}")

    by_fs = {}   # container mounts on the same filesystem report identical numbers; group them
    for d in c.get("diskspace") or []:
        p = (d.get("path") or "").rstrip("/") or "/"
        if p.startswith(("/etc", "/dev", "/proc", "/sys", "/app", "/run")):
            continue
        paths = by_fs.setdefault((d.get("freeSpace"), d.get("totalSpace")), [])
        if p not in paths:
            paths.append(p)
    for (free, total), paths in by_fs.items():
        pct = f"{free / total * 100:.0f}%" if free and total else "?"
        add("disk", f"free={human_bytes(free)}/{human_bytes(total)} ({pct}) {','.join(paths)}")

    if c.app.media:
        q = c.get("queue/status") or {}
        flags = [f for f in ("errors", "warnings", "unknownErrors", "unknownWarnings") if q.get(f)]
        add("queue", f"total={q.get('totalCount', 0)} unknown={q.get('unknownCount', 0)}"
                     + (f" flags={','.join(flags)}" if flags else ""))

    cmds = c.get("command") or []
    active = [x for x in cmds if x.get("status") in ("started", "queued")]
    add("commands", "idle" if not active else ", ".join(f"{x.get('name')}({x.get('status')})" for x in active))

    tasks = sorted((t for t in (c.get("system/task") or []) if t.get("nextExecution")),
                   key=lambda t: t["nextExecution"])
    for t in tasks[:opts.limit_tasks]:
        wait = (parse_ts(t["nextExecution"]) - _now()).total_seconds()
        when = "due" if wait <= 60 else f"in {human_age(wait)}"
        add("task.next", f"{t.get('name')} {when} (every {t.get('interval')}m)")

    try:
        upd = c.get("update") or []
    except ArrError:
        upd = []
    newer = [u for u in upd if not u.get("installed") and u.get("installable") and u.get("latest")]
    if newer:
        add("update", f"{newer[0].get('version')} available (image pin in flotilla controls upgrades)")
    return rows


def _count(it):
    out = {}
    for x in it:
        out[x] = out.get(x, 0) + 1
    return out


# --- health / queue / history / wanted / logs -------------------------------------------

def health(c, opts):
    return [{"app": c.app.name, "type": h.get("type"), "source": h.get("source"),
             "message": h.get("message"), "wiki": h.get("wikiUrl")} for h in (c.get("health") or [])]


def queue(c, opts):
    _require_media(c)
    params = {"page": 1, "pageSize": opts.limit, **{k: "true" for k in c.app.queue_include}}
    recs = (c.get("queue", **params) or {}).get("records", [])
    rows = []
    for r in recs:
        msgs = [m for s in r.get("statusMessages") or [] for m in (s.get("messages") or [s.get("title")]) if m]
        if r.get("errorMessage"):
            msgs.insert(0, r["errorMessage"])
        rows.append({
            "app": c.app.name, "id": r.get("id"),
            "state": r.get("trackedDownloadState") or r.get("status"),
            "status": r.get("trackedDownloadStatus"), "protocol": r.get("protocol"),
            "client": r.get("downloadClient"), "size": human_bytes(r.get("size")),
            "left": human_bytes(r.get("sizeleft")), "eta": r.get("timeleft"),
            "title": r.get("title"), "messages": " | ".join(msgs),
        })
    return rows


def history(c, opts):
    recs = (c.get("history", page=1, pageSize=opts.limit, sortKey="date", sortDirection="descending") or {}).get("records", [])
    cutoff = opts.since_seconds
    rows = []
    for r in recs:
        when = parse_ts(r.get("date"))
        if cutoff and when and (_now() - when).total_seconds() > cutoff:
            continue
        ev = str(r.get("eventType", ""))
        if opts.failed and "fail" not in ev.lower():
            continue
        d = r.get("data") or {}
        q = ((r.get("quality") or {}).get("quality") or {}).get("name")
        rows.append({
            "app": c.app.name, "date": r.get("date"), "event": ev, "quality": q,
            "client": d.get("downloadClientName") or d.get("downloadClient") or d.get("indexer"),
            "title": r.get("sourceTitle") or d.get("query") or d.get("grabTitle"),
            "detail": d.get("message") or d.get("reason") or d.get("droppedPath") or d.get("importedPath"),
        })
    return rows


def wanted(c, opts):
    _require_media(c)
    m = (c.get("wanted/missing", page=1, pageSize=1) or {}).get("totalRecords")
    try:
        cu = (c.get("wanted/cutoff", page=1, pageSize=1) or {}).get("totalRecords")
    except ArrError as e:
        if e.code != "E_API":
            raise
        cu = "n/a"
    return [{"app": c.app.name, "missing": m, "cutoff_unmet": cu}]


_LEVELS = {"trace": 0, "debug": 1, "info": 2, "warn": 3, "error": 4, "fatal": 5}


def logs(c, opts):
    floor = _LEVELS.get(opts.level, 3)
    recs = (c.get("log", page=1, pageSize=max(opts.limit * 4, 200), sortKey="time", sortDirection="descending") or {}).get("records", [])
    cutoff = opts.since_seconds
    rows = []
    for r in recs:
        if _LEVELS.get(str(r.get("level", "")).lower(), 2) < floor:
            continue
        when = parse_ts(r.get("time"))
        if cutoff and when and (_now() - when).total_seconds() > cutoff:
            continue
        msg = r.get("message") or ""
        if r.get("exception"):
            msg += " :: " + r["exception"].strip().splitlines()[0]
        rows.append({"app": c.app.name, "time": r.get("time"), "level": r.get("level"),
                     "logger": r.get("logger"), "message": redact(msg)})
        if len(rows) >= opts.limit:
            break
    return rows


# --- config / snapshot / get ------------------------------------------------------------

def _sections(c, wanted):
    if not wanted:
        return list(c.app.sections)
    picked = [s for s in c.app.sections if any(s == w or s.startswith(w) or s.split("/")[-1] == w for w in wanted)]
    extra = [w for w in wanted if not any(s == w or s.startswith(w) or s.split("/")[-1] == w for s in c.app.sections)]
    return picked + extra       # unknown names are tried as raw endpoints


def _fetch_sections(c, names):
    for s in names:
        try:
            yield s, redact(c.get(s)), None
        except ArrError as e:
            if e.code == "E_API":
                yield s, None, "n/a"
            else:
                raise


def config(c, opts):
    rows = []
    for s, data, note in _fetch_sections(c, _sections(c, opts.args)):
        if note:
            rows.append({"app": c.app.name, "section": s, "key": "-", "value": note})
            continue
        if opts.json:
            rows.append({"app": c.app.name, "section": s, "data": data})
            continue
        for k, v in flatten(data):
            rows.append({"app": c.app.name, "section": s, "key": k or "-", "value": v})
    return rows


def _strip_volatile(o):
    if isinstance(o, dict):
        return {k: _strip_volatile(v) for k, v in o.items() if k not in _VOLATILE}
    if isinstance(o, list):
        return [_strip_volatile(x) for x in o]
    return o


def snapshot(c, opts):
    out_dir = SNAPSHOT_DIR / c.app.name
    out_dir.mkdir(parents=True, exist_ok=True)
    rows = []
    for s, data, note in _fetch_sections(c, _sections(c, opts.args)):
        f = out_dir / (s.replace("/", "_") + ".json")
        rel = str(f.relative_to(REPO))
        if note:
            if f.exists():
                f.unlink()
            rows.append({"app": c.app.name, "section": s, "result": note, "items": "-", "path": "-"})
            continue
        data = _strip_volatile(data)
        if isinstance(data, list):
            data = sorted(data, key=lambda x: (x.get("id", 0) if isinstance(x, dict) else 0))
        text = json.dumps(data, indent=1, sort_keys=True, ensure_ascii=False) + "\n"
        old = f.read_text() if f.exists() else None
        f.write_text(text)
        rows.append({"app": c.app.name, "section": s,
                     "result": "new" if old is None else "same" if old == text else "changed",
                     "items": len(data) if isinstance(data, list) else 1, "path": rel})
    return rows


def get(c, opts):
    if not opts.args:
        raise ArrError("E_USAGE", "get needs a path, e.g. `get config/naming`", "")
    path = opts.args[0]
    params = dict(a.split("=", 1) for a in opts.args[1:] if "=" in a)
    return [{"app": c.app.name, "json": redact(c.get(path, **params))}]


COMMANDS = {f.__name__: f for f in (ping, status, health, queue, history, wanted, logs, config, snapshot, get)}


# --- writes (phase 2): dry-run unless --apply ---------------------------------------------

import re as _re
import time as _time

from .core import load_env as _load_env

_PLACEHOLDER = _re.compile(r"\$\{env:([A-Z0-9_]+)\}")


def _body(c, opts, idx):
    """JSON from args[idx] (inline or @file). ${env:NAME} placeholders are filled from .env
    only in the copy that is sent; the displayed copy keeps the placeholder."""
    if len(opts.args) <= idx:
        return None, None
    src = opts.args[idx]
    text = Path(src[1:]).read_text() if src.startswith("@") else src
    try:
        shown = json.loads(text)
    except ValueError as e:
        raise ArrError("E_USAGE", f"body is not valid JSON: {e}", "")
    env = _load_env()
    missing = [n for n in _PLACEHOLDER.findall(text) if not env.get(n)]
    if missing:
        raise ArrError("E_ENV", f"placeholder(s) not set in .env: {', '.join(missing)}", "")
    sent = json.loads(_PLACEHOLDER.sub(lambda m: json.dumps(env[m.group(1)])[1:-1], text))
    return shown, sent


def _kv(args):
    out = {}
    for a in args:
        if "=" not in a:
            raise ArrError("E_USAGE", f"expected key=value, got {a!r}", "")
        k, v = a.split("=", 1)
        try:
            out[k] = json.loads(v)
        except ValueError:
            out[k] = v
    return out


def _backup(c, opts):
    if opts.no_backup:
        return
    st = _run_command(c, {"name": "Backup"}, wait=120)
    if (st or {}).get("status") != "completed":
        raise ArrError("E_BACKUP", f"pre-write Backup did not complete ({(st or {}).get('status')})",
                       "retry, or pass --no-backup to skip it")
    _time.sleep(2)   # let the DB lock from the backup clear


def _run_command(c, body, wait):
    r = c.request("POST", "command", body=body)
    cid = (r or {}).get("id")
    deadline = _time.monotonic() + wait
    while cid and _time.monotonic() < deadline:
        st = c.get(f"command/{cid}")
        if st.get("status") in ("completed", "failed", "aborted", "cancelled", "orphaned"):
            return st
        _time.sleep(1)
    return c.get(f"command/{cid}") if cid else r


def _write(c, opts, method, needs_body):
    if not opts.args:
        raise ArrError("E_USAGE", f"{method.lower()} needs a path", "")
    path = opts.args[0]
    shown, sent = _body(c, opts, 1) if needs_body else (None, None)
    params = _kv(opts.args[2 if needs_body else 1:])
    row = {"app": c.app.name, "method": method, "path": path,
           "detail": json.dumps(redact(shown), separators=(",", ":"))[:600] if shown is not None else _cell_params(params)}
    if not opts.apply:
        return [{**row, "result": "dry-run (add --apply)"}]
    _backup(c, opts)
    res = c.request(method, path, params=params or None, body=sent)
    rid = res.get("id") if isinstance(res, dict) else None
    return [{**row, "result": f"ok{f' id={rid}' if rid is not None else ''}"}]


def _cell_params(p):
    return " ".join(f"{k}={v}" for k, v in p.items()) or "-"


def post(c, opts):
    return _write(c, opts, "POST", True)


def put(c, opts):
    return _write(c, opts, "PUT", True)


def delete(c, opts):
    has_body = len(opts.args) > 1 and opts.args[1][:1] in ("{", "[", "@")
    return _write(c, opts, "DELETE", has_body)


def cmd(c, opts):
    """Run an app command (RssSync, RescanSeries seriesId=11, EpisodeSearch episodeIds=[..], Backup)."""
    if not opts.args:
        raise ArrError("E_USAGE", "cmd needs a command name, e.g. `cmd RssSync`", "")
    body = {"name": opts.args[0], **_kv(opts.args[1:])}
    row = {"app": c.app.name, "method": "COMMAND", "path": body["name"],
           "detail": _cell_params({k: v for k, v in body.items() if k != "name"})}
    if not opts.apply:
        return [{**row, "result": "dry-run (add --apply)"}]
    st = _run_command(c, body, wait=opts.wait)
    msg = st.get("message") or (st.get("body") or {}).get("completionMessage") or ""
    return [{**row, "result": st.get("status"), "detail": f"{row['detail']} {msg}".strip()}]


COLUMNS["write"] = ("app", "method", "path", "result", "detail")
for _f in (post, put, delete, cmd):
    COMMANDS[_f.__name__] = _f
    COLUMNS[_f.__name__] = COLUMNS["write"]


def set(c, opts):
    """set <resource>/<id> key=value ... : GET the object unredacted in memory, change top-level
    keys or fields.<name> (dotted paths into nested dicts also work), show a redacted diff, and
    PUT the full object only with --apply. Values parse as JSON when they can (true, 3, "x")."""
    if len(opts.args) < 2:
        raise ArrError("E_USAGE", "set needs <resource>/<id> and at least one key=value", "")
    path, changes = opts.args[0], _kv(opts.args[1:])
    obj = c.get(path)
    if not isinstance(obj, dict):
        raise ArrError("E_USAGE", f"{path} is not a single object (add /<id>)", "")
    diffs = []
    for key, new in changes.items():
        if key.startswith("fields."):
            name = key[7:]
            f = next((x for x in obj.get("fields", []) if x.get("name") == name), None)
            if f is None:
                raise ArrError("E_USAGE", f"{path} has no field {name!r}",
                               "fields: " + ",".join(x.get("name", "?") for x in obj.get("fields", [])))
            old, f["value"] = f.get("value"), new
            secret = f.get("privacy") in ("apiKey", "password", "userName")
        else:
            parts, tgt = key.split("."), obj
            for p in parts[:-1]:
                if not isinstance(tgt.get(p), dict):
                    raise ArrError("E_USAGE", f"{path} has no object at {p!r} in {key!r}", "")
                tgt = tgt[p]
            if parts[-1] not in tgt and not getattr(opts, "add_keys", False):
                raise ArrError("E_USAGE", f"{path} has no key {key!r}",
                               "pass --add-keys to create it; keys: " + ",".join(sorted(tgt)))
            old, tgt[parts[-1]] = tgt.get(parts[-1]), new
            secret = bool(_re.search(r"(api_?key|password|secret|token)", parts[-1], _re.I))
        show = (lambda v: "<redacted>") if secret else (lambda v: json.dumps(v))
        diffs.append(f"{key}: {show(old)} -> {show(new)}" + ("" if old != new else " (unchanged)"))
    row = {"app": c.app.name, "method": "PUT", "path": path, "detail": "; ".join(diffs)}
    if not opts.apply:
        return [{**row, "result": "dry-run (add --apply)"}]
    _backup(c, opts)
    for attempt in range(3):           # a just-finished Backup can still hold the SQLite lock
        try:
            c.request("PUT", path, body=obj)
            break
        except ArrError as e:
            if "database is locked" not in e.detail or attempt == 2:
                raise
            _time.sleep(3)
    return [{**row, "result": "ok"}]


COMMANDS["set"] = set
COLUMNS["set"] = COLUMNS["write"]
