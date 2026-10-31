---
title: Whisparr's calendar is empty even with unmonitored=true
kind: gotcha
summary: Whisparr v3's /api/v3/calendar returns nothing for unmonitored items because nothing upcoming is ever added unmonitored, so the planned "Coming soon" home row became "recent releases, not downloaded".
tags: [whisparr, api, home]
symptom: "GET /api/v3/calendar?unmonitored=true returns []"
found: 2026-10-30
status: current
verified: 2026-10-30
updated: 2026-10-30
code: [apps/server/src/whisparr.ts]
related: [whisparr-api, whisparr-shelf, home-feed, whisparr-nothing-monitored]
---

# Whisparr's calendar is empty even with unmonitored=true

## Symptom

While building the Whisparr home row on 2026-10-30, `GET /api/v3/calendar` returned an
empty list for every date range, with and without `unmonitored=true`.

## Cause

The calendar lists upcoming releases of items Whisparr tracks. Under the library policy
([[whisparr-nothing-monitored]]) nothing is monitored, and Whisparr never adds an upcoming
scene to a studio with new-items monitoring off, so there is nothing for the calendar to
show regardless of the flag.

## Fix

The "Coming soon" row was replaced by "New from your favourites, not downloaded": recent
releases from favourite performers taken from Whisparr's movie list, shown from three items.
See [[home-feed]] and [[whisparr-shelf]].

## Avoid

Do not build on Whisparr's calendar while the policy stands. The movie list
(`GET /api/v3/movie`, ~25 MB) is the source of what exists; see [[whisparr-api]].
