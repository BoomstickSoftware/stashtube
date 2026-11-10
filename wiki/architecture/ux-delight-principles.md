---
title: UX delight principles
kind: architecture
summary: The researched rules flix's UI is judged against (delight, perceived speed, motion, touch, dark-theme polish, media patterns), with numbers, sources and a checklist.
tags: [ux, ui, mobile, ios, performance, audit]
status: current
verified: 2026-11-10
updated: 2026-11-10
related: [mobile-first-ui, iphone-first-polish, 2026-11-10-architecture-and-ux-review, roadmap]
sources:
  - https://www.nngroup.com/articles/theory-user-delight/
  - https://www.nngroup.com/articles/response-times-3-important-limits/
  - https://www.nngroup.com/articles/skeleton-screens/
  - https://www.nngroup.com/articles/animation-duration/
  - https://www.nngroup.com/articles/bottom-sheet/
  - https://www.nngroup.com/articles/confirmation-dialog/
  - https://www.nngroup.com/articles/dark-mode-users-issues/
  - https://www.nngroup.com/articles/mobile-carousels/
  - https://developer.apple.com/design/human-interface-guidelines/motion
  - https://developer.apple.com/videos/play/wwdc2018/803/
  - https://web.dev/articles/vitals
  - https://webkit.org/blog/15865/webkit-features-in-safari-18-0/
  - https://firt.dev/notes/pwa-ios/
---

# UX delight principles

Internet research of 2026-11-10 for a phone-first, dark, touch-driven video library PWA used
daily by one person. Rules marked (u) were seen only in a search summary, not on a fetched
page. Touch conventions flix already follows are in [[mobile-first-ui]]; this page is the why
and the yardstick.

## 1. What delight is

- Build in order: functional, reliable, usable, then pleasurable. Polish on a flaky flow reads
  as tacky (NN/g, theory of user delight; Walter's hierarchy).
- Deep delight (flow, the interface out of the way) before surface delight (animation, copy).
- Kano: delighters decay into expectations; re-rank them now and then.
- Norman: for a daily tool weight the behavioural level (task time, errors) over the visceral.
- Peak-end: remove the worst moment and end well; an error at the end outweighs polish elsewhere.
- For one power user, value is speed, predictability and stable positions. Keep expressive
  moments for rare events, not routine taps. Ask of every effect: still welcome the 20th time? (u)

## 2. Perceived speed

- 0.1 s feels instant; 1 s keeps the flow of thought; 10 s needs progress and a way out.
- Feedback within 400 ms (Doherty); a tap paints in the next frame (INP good ≤ 200 ms).
- Under 1 s show nothing; a full page under 10 s gets a layout-matching skeleton; a single
  module (a video) gets a spinner.
- Optimistic writes only for binary, near-certain actions; acknowledge in 100 ms, revert quietly
  within about 2 s on failure.
- Reserve space for every image and video (CLS ≤ 0.1); animate only `transform` and `opacity`.
- Never lazy-load the LCP image; `fetchpriority="high"` on one or two images at most.
- Preload the next screen on touchstart (TanStack Router does; preloaded data is fresh 30 s).

## 3. Motion

- 100–500 ms overall: about 100 ms for toggles, 200–300 ms for sheets, 400 ms only for large
  moves. Exits shorter than entrances. Ease-out in, ease-in out, never linear.
- Material 3 standard easing `cubic-bezier(0.2, 0, 0, 1)`; emphasized decelerate
  `cubic-bezier(0.05, 0.7, 0.1, 1)`.
- Apple: avoid motion on frequent interactions; never make the user wait for an animation.
- Fluid interfaces: track the finger 1:1, stay interruptible, carry release velocity, bounce
  only when the gesture had momentum, highlight on touch-down and commit on touch-up.
- View Transitions (same-document, shared elements) work in iOS Safari 18.0+; scroll-driven
  animations in Safari 26.0. Feature-detect both.
- Reduced motion: replace movement and zoom with fades.

## 4. Touch

- 44 × 44 pt targets (28 pt absolute floor); primary actions in the lower thumb zone; a
  top-corner close needs a second way out.
- Sheets: short supplementary tasks only, one at a time, a visible close as well as
  swipe-down, Back dismisses, a grabber.
- A gesture is a shortcut: every swipe or long press also has a visible tap path. One meaning
  per swipe direction; keep clear of the iOS Back edge.
- Undo, not confirm, for routine actions; confirm only what cannot be undone.
- Haptics: `navigator.vibrate` does not exist on iOS; treat any workaround as garnish (u).
- iOS standalone: Media Session works; no background sync; storage is separate from Safari.

## 5. Visual polish

- Every colour, size, radius, duration and easing is a named token.
- Dark theme: elevation by lighter surfaces, not shadows; text ≥ 4.5:1 (aim 7:1 for small
  text); no thin weights; desaturate accents; one text colour at several opacities.
- A 4/8 px spacing scale, a small set of radii, one icon family at three sizes (u).
- A micro-interaction is a trigger plus narrow feedback; design its 100th use.

## 6. Media apps

- The first screen must hold the answer: people give up after reviewing 10–20 titles (u).
- Continue watching comes first, sorted by recency, removable (u).
- Rows: best items first (people stop after 3–4 swipes), a peek of the next item, "see all".
- Fewer rows and one highlighted pick (Hick's law).
- A double-tap recogniser delays single taps; use it only where that is acceptable.
- Previews are user-initiated, one at a time. The hero is the LCP element and does not rotate.

## 7. Simplification

- Progressive disclosure: frequent things on level one, the rest one obvious level down, never three.
- A better default removes a setting; most people never change one.
- Recognition over recall: recents, history, labelled icons.
- Empty state: say the status, what the area is for, and the one action that fills it.
- Errors: next to the source, plain, one next step, input kept, no humour.

## 8. Anti-patterns

Delight before reliability; animation over 400–500 ms or that blocks input; several things
moving at once; artificial delays; confirms on routine actions; hidden-only gestures; stacked
sheets; autoplay chains with no stopping cue.

## Review checklist

1. Does every tap paint feedback in the next frame?
2. Is every wait over 1 s indicated, with a skeleton shaped like the destination?
3. Is all media space reserved, with nothing jumping as data arrives?
4. Are reversible writes optimistic with a quiet revert?
5. Are animations 100–400 ms, interruptible, exits shorter, at most one thing moving?
6. Under reduced motion, are slides and zooms fades?
7. Is every target 44 px, with primary actions in the lower zone?
8. Does every gesture have a visible tap alternative?
9. Do reversible destructive actions offer Undo instead of a confirm?
10. Is there one sheet at most, with a close button and working Back?
11. Do colours, sizes, radii, durations and z layers all come from tokens?
12. Can the user resume from the first screen without scrolling?
13. Are advanced options exactly one level down?
14. Could a better default remove this setting?
15. Does each empty or error state give the one next action?
