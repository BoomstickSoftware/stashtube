---
title: A useEffect callback that returns a value crashes the page
kind: gotcha
summary: Returning anything from a useEffect callback makes React call it as the cleanup; Chrome's window.scrollTo returns a Promise, so `useEffect(() => window.scrollTo(0, 0))` crashes.
tags: [react, web, crash]
symptom: "page crashes after a scroll-to-top navigation; React tries to call a Promise as an effect cleanup (exact message not recorded)"
found: 2026-10-27 # inferred from the fixing commit
status: current
verified: 2026-10-30
updated: 2026-10-30
code: [apps/web/src/pages]
related: [coding-conventions, web-app]
---

# A useEffect callback that returns a value crashes the page

## Symptom

A page crashes when React unmounts or re-runs an effect, with a cleanup error such as
"destroy is not a function". It only shows in Chrome, not in Safari.

## Cause

React treats whatever a `useEffect` callback returns as the cleanup function. An arrow
effect that returns an expression returns that expression's value. In Chrome,
`window.scrollTo` returns a Promise, so `useEffect(() => window.scrollTo(0, 0), [])` hands
React a Promise as its cleanup and React calls it.

## Fix

Effects use a block body so they return `undefined`:

```ts
useEffect(() => {
  window.scrollTo(0, 0)
}, [])
```

## Avoid

Rule in [[coding-conventions]]: `useEffect` callbacks never return a value except a cleanup
function. Review any one-line arrow effect for an implicit return.
