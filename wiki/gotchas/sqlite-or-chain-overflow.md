---
title: Long OR chains of release-date buckets overflow SQLite's parser
kind: gotcha
summary: The age-at-filming match builds one date bucket per year; past about 16 years the OR chain overflows SQLite's expression depth in Stash, so buckets widen to two years beyond that span.
tags: [stash, sqlite, filters, performers]
symptom: "Stash answers 500 to an age-at-filming filter with many release-date OR buckets (SQLite parser limit; exact message not recorded)"
found: 2026-10-28 # inferred from the fixing commit
status: current
verified: 2026-10-30
updated: 2026-10-30
code: [apps/server/src/stash.ts]
related: [browse-and-filters, stash-api]
---

# Long OR chains of release-date buckets overflow SQLite's parser

## Symptom

An age-at-filming filter answered a Stash 500 once the library's release dates spanned many
years.

## Cause

Stash has no "performer age at the scene's date" criterion that is restricted to one gender
(its `performer_age` matches any performer, so a 40+ male co-star counts). flix emulates it
with one OR branch per release-year bucket, each pairing a birth-year range with a date range.
SQLite limits the depth of an expression tree; a chain of 16+ nested ORs exceeds it.

## Fix

Buckets are yearly while the library spans 16 years or less, and two-yearly beyond that,
which keeps the match right to about six months (2026-10-28, commit 707da69).

## Avoid

Any filter that fans out into OR branches per value needs a cap. Test with the widest set
the library can produce. See [[browse-and-filters]].
