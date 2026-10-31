---
title: playwright install webkit hangs after the download
kind: gotcha
summary: On this Mac `playwright install webkit` downloads its archive and then hangs in its own unzip step (one dylib, 0% CPU); unzipping the archive by hand into the cache dir and touching INSTALLATION_COMPLETE takes seconds.
tags: [dev, testing, webkit, playwright, mobile]
symptom: "playwright install webkit shows 100% of 72.6 MiB and never returns; ~/Library/Caches/ms-playwright/webkit-<rev>/ holds only libwebrtc.dylib"
found: 2026-10-31
status: current
verified: 2026-10-31
updated: 2026-10-31
code: [scripts/webkit-mini-check.mjs]
related: [mobile-checks]
---

# `playwright install webkit` hangs after the download

## Symptom

`playwright install webkit` (Playwright 1.58.2, global install) prints the download bar to
100% and never exits. Two hours later the child `oopDownloadBrowserMain.js` is asleep at 0%
CPU, `~/Library/Caches/ms-playwright/webkit-2248/` holds a single file (`libwebrtc.dylib`,
15 MB) and the complete archive (76 MB) sits in `$TMPDIR/playwright-download-*/`. A second
attempt did exactly the same.

## Fix

Kill the installer and unzip the archive yourself; the marker file is all Playwright checks:

```sh
pkill -f "playwright install webkit"; pkill -f oopDownloadBrowserMain
Z=$(/bin/ls $TMPDIR/playwright-download-*/playwright-download-webkit-*.zip | tail -1)
rm -rf ~/Library/Caches/ms-playwright/webkit-2248 && mkdir -p ~/Library/Caches/ms-playwright/webkit-2248
cd ~/Library/Caches/ms-playwright/webkit-2248 && unzip -q "$Z" && touch INSTALLATION_COMPLETE
```

(6998 files, 276 MB, a few seconds.) `webkit-2248` is the revision Playwright 1.58.2 wants;
read the one it creates. Then `node scripts/webkit-mini-check.mjs …` works ([[mobile-checks]]).

## Cause

Not established; Playwright's in-process extraction stalls after the first large entry on
this machine. The network was not the problem (the download completed both times).
