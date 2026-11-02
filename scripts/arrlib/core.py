"""Shared core (copied from the nas repo 2026-11-02): .env loading, HTTP client with failure classification, redaction, output.

Error codes (stderr and ping rows): E_ENV, E_HOST, E_PORT, E_TIMEOUT, E_PROTO, E_AUTH, E_API,
E_APP, E_HTTP, E_BUG. Each carries a one-line detail and a hint naming what to fix.
"""
import http.client
import json
import os
import re
import socket
import sys
import time
import urllib.parse
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
DEFAULT_HOST = "192.168.0.10"
CONNECT_TIMEOUT = 3.0
READ_TIMEOUT = 15.0
WRITE_TIMEOUT = 60.0   # writes can queue behind a Backup's DB lock
VERBOSE = False


class ArrError(Exception):
    def __init__(self, code, detail, hint=""):
        super().__init__(detail)
        self.code, self.detail, self.hint = code, detail, hint


class NotApplicable(Exception):
    """The command has no meaning for this app (e.g. queue on Prowlarr)."""


# --- .env -------------------------------------------------------------------------------

def env_path():
    return Path(os.environ.get("ARR_ENV_FILE") or REPO / ".env")


def load_env():
    """KEY=VALUE lines from .env; the process environment overrides. Values are never printed."""
    env = {}
    p = env_path()
    if p.is_file():
        for raw in p.read_text().splitlines():
            line = raw.strip()
            if line.startswith("export "):
                line = line[7:].lstrip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            k, v = k.strip(), v.strip()
            if len(v) >= 2 and v[0] == v[-1] and v[0] in "'\"":
                v = v[1:-1]
            else:
                v = v.split(" #", 1)[0].strip()
            env[k] = v
    env.update({k: v for k, v in os.environ.items() if k.endswith(("_HOST", "_PORT", "_API_KEY", "_URL"))})
    # flix's .env names each service by URL (STASH_URL, WHISPARR_URL) and key (WHISPARR_API_KEY); the clients
    # copied from the nas repo want <APP>_HOST, <APP>_PORT and <APP>_API_KEY, so derive those when absent.
    for url_key, prefix in (("STASH_URL", "STASH"), ("WHISPARR_URL", "WHISPARR3")):
        u = urllib.parse.urlsplit(env.get(url_key, ""))
        if u.hostname:
            env.setdefault(f"{prefix}_HOST", u.hostname)
            env.setdefault(f"{prefix}_PORT", str(u.port or (443 if u.scheme == "https" else 80)))
    if env.get("WHISPARR_API_KEY"):
        env.setdefault("WHISPARR3_API_KEY", env["WHISPARR_API_KEY"])
    return env


# --- HTTP client ------------------------------------------------------------------------

class Client:
    def __init__(self, app, env):
        self.app = app
        P = app.env
        self.host = env.get(f"{P}_HOST") or DEFAULT_HOST
        port = env.get(f"{P}_PORT") or str(app.port)
        key = env.get(f"{P}_API_KEY", "")
        if not port.isdigit():
            raise ArrError("E_ENV", f"{P}_PORT={port!r} is not a number", f"fix {P}_PORT in {env_path()}")
        if not key:
            raise ArrError("E_ENV", "WHISPARR_API_KEY missing or empty",
                           f"set WHISPARR_URL and WHISPARR_API_KEY in {env_path()} (Whisparr Settings > General > Security > API Key)")
        self.port = int(port)
        self._key = key
        # other apps configured with the very same key: the usual copy-paste mistake
        self._key_twins = [k[:-8] for k, v in env.items() if k.endswith("_API_KEY") and k != f"{P}_API_KEY" and v == key]
        self.base = f"/api/{app.api}"

    @property
    def url(self):
        return f"http://{self.host}:{self.port}"

    def get(self, path, **params):
        return self.request("GET", path, params=params)

    def request(self, method, path, params=None, body=None, auth=True, decode=True):
        P, name = self.app.env, self.app.name
        full = path if path.startswith("/") else f"{self.base}/{path}"
        if params:
            q = {k: (str(v).lower() if isinstance(v, bool) else v) for k, v in params.items() if v is not None}
            if q:
                full += ("&" if "?" in full else "?") + urllib.parse.urlencode(q, doseq=True)
        headers = {"Accept": "application/json"}
        if auth:
            headers["X-Api-Key"] = self._key
        data = None
        if body is not None:
            data = json.dumps(body).encode()
            headers["Content-Type"] = "application/json"

        tries = 2 if method == "GET" else 1
        for attempt in range(tries):
            t0 = time.monotonic()
            conn = http.client.HTTPConnection(self.host, self.port, timeout=CONNECT_TIMEOUT)
            try:
                try:
                    conn.connect()
                except socket.gaierror:
                    raise ArrError("E_HOST", f"cannot resolve {self.host}", f"check {P}_HOST")
                except TimeoutError:
                    raise ArrError("E_HOST", f"{self.host} did not answer within {CONNECT_TIMEOUT:.0f}s",
                                   f"host down or unreachable, or wrong {P}_HOST")
                except ConnectionRefusedError:
                    raise ArrError("E_PORT", f"{self.host} is up but nothing listens on :{self.port}",
                                   f"{name} not running, or wrong {P}_PORT (default {self.app.port})")
                except OSError as e:
                    raise ArrError("E_HOST", f"{self.host}:{self.port} unreachable ({e.strerror or e})",
                                   f"check network and {P}_HOST")
                conn.sock.settimeout(READ_TIMEOUT if method == "GET" else WRITE_TIMEOUT)
                try:
                    conn.request(method, full, body=data, headers=headers)
                    resp = conn.getresponse()
                    raw = resp.read()
                except TimeoutError:
                    if attempt + 1 < tries:
                        continue
                    raise ArrError("E_TIMEOUT", f"{method} {full} no reply within {READ_TIMEOUT if method == 'GET' else WRITE_TIMEOUT:.0f}s",
                                   f"{name} busy or hung; check `scripts/whisparr.py logs` or the container log")
                except http.client.InvalidURL as e:
                    raise ArrError("E_USAGE", f"invalid request path {full!r} ({e})", "check the path argument (spaces or quotes?)")
                except (http.client.HTTPException, ConnectionError) as e:
                    raise ArrError("E_PROTO", f":{self.port} closed without an HTTP reply ({type(e).__name__})",
                                   f"something other than {name} on :{self.port}? check {P}_PORT")
            finally:
                conn.close()
            if VERBOSE:
                print(f"# {name} {method} {full} {resp.status} {(time.monotonic() - t0) * 1000:.0f}ms", file=sys.stderr)
            if not decode:
                return resp.status, resp.getheader("Location", ""), raw
            return self._decode(method, full, resp, raw)

    def identify(self):
        """App name from the unauthenticated web UI (window.<App> or <title>), or None."""
        path = "/"
        try:
            for _ in range(2):
                st, loc, raw = self.request("GET", path, auth=False, decode=False)
                if 300 <= st < 400 and loc:
                    path = "/" + loc.split("://", 1)[-1].split("/", 1)[-1] if "://" in loc else loc
                    continue
                m = re.search(rb"window\.(\w+)\s*=", raw) or re.search(rb"<title>(?:Login - )?\s*(\w+)", raw)
                return m.group(1).decode().lower() if m else None
        except ArrError:
            return None
        return None

    def _decode(self, method, full, resp, raw):
        P, name = self.app.env, self.app.name
        st = resp.status
        if st == 401:
            twin = f"; it is identical to {'/'.join(t + '_API_KEY' for t in self._key_twins)}" if self._key_twins else ""
            if not re.fullmatch(r"[0-9a-fA-F]{32}", self._key):
                twin += f"; value is {len(self._key)} chars, not the 32-hex-char form of an arr API key"
            raise ArrError("E_AUTH", f"{P}_API_KEY rejected (401){twin}",
                           f"copy the key from {name} Settings > General > Security")
        if st == 404:
            raise ArrError("E_API", f"404 {method} {full}",
                           f"no such endpoint or id in {name} {self.app.api} (already removed?), or a URL base is set")
        if st >= 400:
            raise ArrError("E_HTTP", f"{st} {method} {full}: {_server_message(raw)}", "")
        if not raw.strip():
            return None
        try:
            return json.loads(raw)
        except ValueError:
            ctype = resp.getheader("Content-Type", "") or "no content-type"
            raise ArrError("E_PROTO", f"{method} {full} returned non-JSON ({ctype})",
                           f"is {name} really on :{self.port}? check {P}_PORT")


def _server_message(raw):
    try:
        d = json.loads(raw)
    except ValueError:
        return raw.decode(errors="replace").strip().splitlines()[0][:200] if raw.strip() else "(empty body)"
    if isinstance(d, list):
        return "; ".join(f"{x.get('propertyName', '?')}: {x.get('errorMessage', x)}" for x in d if isinstance(x, dict))[:400]
    if isinstance(d, dict):
        return str(d.get("message") or d.get("errorMessage") or d.get("description") or d)[:400]
    return str(d)[:200]


# --- redaction --------------------------------------------------------------------------

_SECRET_NAME = re.compile(r"(api_?key|password|passwd|passkey|secret|token|cookie)", re.I)
_SECRET_PRIVACY = {"apiKey", "password", "userName"}
_SECRET_IN_TEXT = re.compile(r"(?i)\b(api_?key|apitoken|token|passkey|password)=([^&\s\"']+)")
REDACTED = "<redacted>"


def redact(o):
    """Blank credentials: Servarr fields marked privacy apiKey/password/userName, any string
    under a secret-looking key, and key=value secrets embedded in URLs."""
    if isinstance(o, dict):
        secret_field = o.get("privacy") in _SECRET_PRIVACY or bool(_SECRET_NAME.search(str(o.get("name", ""))))
        out = {}
        for k, v in o.items():
            if k == "value" and secret_field and v not in (None, "", []):
                out[k] = REDACTED
            elif isinstance(v, str) and v and _SECRET_NAME.search(k):
                out[k] = REDACTED
            else:
                out[k] = redact(v)
        return out
    if isinstance(o, list):
        return [redact(x) for x in o]
    if isinstance(o, str):
        return _SECRET_IN_TEXT.sub(r"\1=" + REDACTED, o)
    return o


# --- flattening (config output) ---------------------------------------------------------

_FIELD_NOISE = {"presets", "selectOptions", "helpText", "helpTextWarning", "helpLink", "label",
                "order", "type", "advanced", "hidden", "isFloat", "privacy", "section", "unit"}


def flatten(o, prefix=""):
    """Yield (dotted.key, scalar). Lists of named objects become [name]; Servarr `fields`
    arrays become fields.<name> = value."""
    if isinstance(o, dict):
        for k, v in o.items():
            if k in _FIELD_NOISE:
                continue
            yield from flatten(v, f"{prefix}.{k}" if prefix else k)
    elif isinstance(o, list):
        if not o:
            yield prefix, "[]"
        elif all(isinstance(x, dict) for x in o):
            if prefix.endswith("fields") and all("name" in x for x in o):
                for f in o:
                    yield from flatten(f.get("value"), f"{prefix}.{f['name']}")
                return
            for i, x in enumerate(o):
                label = x.get("name") or x.get("label") or x.get("id")
                if label is None and isinstance(x.get("quality"), dict):
                    label = x["quality"].get("name")
                yield from flatten(x, f"{prefix}[{label if label is not None else i}]")
        elif all(not isinstance(x, (dict, list)) for x in o):
            yield prefix, ",".join(str(x) for x in o)
        else:
            for i, x in enumerate(o):
                yield from flatten(x, f"{prefix}[{i}]")
    else:
        yield prefix, o


# --- output -----------------------------------------------------------------------------

def _cell(v):
    if v is None or v == "":
        return "-"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (dict, list)):
        v = json.dumps(v, separators=(",", ":"))
    return str(v).replace("\t", " ").replace("\r", " ").replace("\n", " ")


def emit(rows, cols, as_json=False):
    if as_json:
        for r in rows:
            print(json.dumps(r, separators=(",", ":"), default=str))
        return
    print("\t".join(cols))
    for r in rows:
        print("\t".join(_cell(r.get(c)) for c in cols))


def err_line(app, e):
    print(f"ERR\t{app}\t{e.code}\t{e.detail}\t{e.hint or '-'}", file=sys.stderr)


# --- small formatters -------------------------------------------------------------------

def human_bytes(n):
    if n is None:
        return None
    n = float(n)
    for unit in ("B", "K", "M", "G", "T"):
        if abs(n) < 1024 or unit == "T":
            return f"{n:.0f}{unit}" if unit in ("B", "K") else f"{n:.1f}{unit}"
        n /= 1024


def human_age(seconds):
    s = int(abs(seconds))
    d, s = divmod(s, 86400)
    h, s = divmod(s, 3600)
    m, _ = divmod(s, 60)
    out = f"{d}d{h}h" if d else f"{h}h{m}m" if h else f"{m}m"
    return out if seconds >= 0 else f"in {out}"


def parse_ts(s):
    from datetime import datetime, timezone
    if not s:
        return None
    try:
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
