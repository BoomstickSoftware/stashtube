#!/usr/bin/env python3
"""stash.py: Stash (GraphQL) client (copied from the nas repo 2026-11-02). URL and key from flix's .env:
STASH_URL, STASH_API_KEY (STASH_HOST/STASH_PORT still work); the key is never printed.

Usage:
  stash.py ping                     version, schema, auth check (an unauthenticated request must get 401)
  stash.py status                   scene/image/performer counts, library paths, key settings, job queue
  stash.py config                   full configuration as redacted JSON
  stash.py q '<graphql>' [vars-json] run a query; a mutation is a dry run unless --apply
  stash.py jobs [--wait]            job queue; --wait polls every 30s until it is empty

Mutations print the request and stop unless --apply is given. Bodies may use ${env:NAME}
placeholders, filled from .env at send time so secrets never appear in arguments or output.
Output is redacted (api keys, passwords, tokens).
"""
import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from arrlib.core import load_env, redact  # noqa: E402

ENV = load_env()


def die(code, msg, rc=2):
    print(f"ERR\tstash\t{code}\t{msg}", file=sys.stderr)
    sys.exit(rc)


def url():
    for k in ("STASH_HOST", "STASH_PORT", "STASH_API_KEY"):
        if not ENV.get(k):
            die("E_ENV", f"{k} missing: set STASH_URL and STASH_API_KEY in flix's .env (filled by hand)")
    return f"http://{ENV['STASH_HOST']}:{ENV['STASH_PORT']}/graphql"


def fill(text):
    def sub(m):
        if m.group(1) not in ENV:
            die("E_ENV", f"placeholder ${{env:{m.group(1)}}} not in .env")
        return json.dumps(ENV[m.group(1)])[1:-1]
    return re.sub(r"\$\{env:([A-Z0-9_]+)\}", sub, text)


def gql(query, variables=None, key=True, timeout=30):
    body = fill(json.dumps({"query": query, "variables": variables or {}})).encode()
    endpoint = url()  # first, so a missing key is reported as E_ENV rather than a KeyError
    h = {"Content-Type": "application/json"}
    if key:
        h["ApiKey"] = ENV["STASH_API_KEY"]
    req = urllib.request.Request(endpoint, data=body, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            d = json.load(r)
    except urllib.error.HTTPError as e:
        if not key:
            return e.code
        die("E_AUTH" if e.code == 401 else "E_HTTP", f"HTTP {e.code}", 1)
    except (urllib.error.URLError, OSError) as e:
        die("E_HOST", f"{e}", 1)
    if not key:
        return 200
    if d.get("errors"):
        die("E_API", "; ".join(x.get("message", "?") for x in d["errors"]), 1)
    return d["data"]


def show(o):
    print(json.dumps(redact(o), indent=1))


JOBS = "{ jobQueue { id status description progress subTasks } }"


def main(argv):
    apply = "--apply" in argv
    wait = "--wait" in argv
    args = [a for a in argv if a not in ("--apply", "--wait")]
    if not args or args[0] in ("-h", "--help"):
        print(__doc__)
        return 0
    cmd = args[0]
    if cmd == "ping":
        d = gql("{ version { version } systemStatus { status databaseSchema appSchema } }")
        anon = gql("{ version { version } }", key=False)
        print(f"version\t{d['version']['version']}\nstatus\t{d['systemStatus']['status']}\n"
              f"schema\t{d['systemStatus']['databaseSchema']}/{d['systemStatus']['appSchema']}\n"
              f"anonymous\t{anon}{'' if anon == 401 else '  WARNING: no login set'}")
        return 0 if anon == 401 else 1
    if cmd == "status":
        d = gql("""{ stats { scene_count image_count gallery_count performer_count studio_count tag_count
                    scenes_size scenes_duration }
                  configuration { general { stashes { path } parallelTasks transcodeHardwareAcceleration
                    maxStreamingTranscodeSize stashBoxes { name endpoint } } } }""")
        d.update(gql(JOBS))
        show(d)
        return 0
    if cmd == "config":
        show(gql("""{ configuration { general { stashes { path excludeVideo excludeImage } databasePath
          generatedPath metadataPath cachePath parallelTasks previewSegments previewSegmentDuration
          maxTranscodeSize maxStreamingTranscodeSize transcodeHardwareAcceleration calculateMD5
          videoFileNamingAlgorithm stashBoxes { name endpoint api_key } username }
          defaults { scan { scanGenerateCovers scanGeneratePreviews scanGenerateSprites scanGeneratePhashes
            scanGenerateThumbnails } generate { covers sprites previews phashes transcodes markers } } } }"""))
        return 0
    if cmd == "q":
        if len(args) < 2:
            die("E_USAGE", "q needs a GraphQL string")
        query = args[1]
        variables = json.loads(args[2]) if len(args) > 2 else None
        if query.lstrip().startswith("mutation") and not apply:
            print("dry run (add --apply):")
            print(query.strip())
            if variables:
                show(variables)
            return 0
        show(gql(query, variables, timeout=120))
        return 0
    if cmd == "jobs":
        while True:
            q = gql(JOBS)["jobQueue"] or []
            for j in q:
                pct = "" if j["progress"] is None else f"{j['progress'] * 100:.0f}%"
                print(f"{j['id']}\t{j['status']}\t{pct}\t{j['description']}")
            if not wait or not q:
                if not q:
                    print("queue empty")
                return 0
            time.sleep(30)
    die("E_USAGE", f"unknown command {cmd}")


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
