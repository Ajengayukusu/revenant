# REVENANT — Product Steering

## What REVENANT is
A browser-only tool that diagnoses public GitHub repositories and scores
how dead they are (the Resurrection Score), issues a styled "Death
Certificate", and — in the full build — generates a downloadable Kiro
resurrection spec for reviving the repo. Kiroween 2026, Resurrection
category.

## Who it is for
Open-source maintainers and developers deciding whether an abandoned
dependency or project can be saved, and what saving it would take.

## Product rules for every change
- The user must get a result or a clear, human error. Never a silent
  failure, a spinner forever, or a stack trace.
- Every number shown must come from live API data or a documented formula.
  Never invent repo statistics.
- The score formula is a product promise: if it changes, update `score.js`,
  its header comment, the README, and the tests in the same change.
- Cemetery theme serves the function. Atmosphere yes; anything that hurts
  readability, contrast, or keyboard/screen-reader use, no.
- The demo arc matters: paste URL -> Death Certificate in under 10 seconds
  on a normal connection. Keep the first screen fast and focused on that.

## Tone
Playful about death, serious about the data. Labels are plain English;
the gothic flavour lives in styling and microcopy, not in hiding meaning.
