---
# Loaded automatically ONLY when the agent reads or edits a file matching one
# of these globs. Keeps context light: database rules arrive with database
# code, not with a CSS change. One topic per file.
paths:
  - 'src/<area>/**/*.<ext>'
---

# <Topic>

Full detail: `docs/<topic>.md`. These are the rules that must hold in the code
you are writing right now.

## Rules

1. **<The rule, one line.>** <Why: the failure it prevents, ideally one that is
   silent until production.>
2. ...

## How to check you followed them

- <A command, a query, a grep — something that proves it.>

## Traps

- <A mistake that cost real time here, and the symptom it shows.>
