# Test cases

**These files are the source of truth. The automated tests are derived from
them, never the other way round.**

A tester who has never opened a test script should be able to read a case,
disagree with it, and change it here — in English, in a table — and have the
script follow.

## How a case is written

| ID | Case | Steps | Expected |
|----|------|-------|----------|
| ABC-XY-001 | A short name for the behaviour | What the user does, in order. | What they must see. |

- **ID**: `AREA-SCREEN-NNN`. Never changes once written. A reworded case keeps
  its ID; a different behaviour gets a new one; a removed case's ID is not
  reused.
- **Behaviour, never mechanism.** No selectors, routes, endpoints, test ids or
  table names. Those live in the script, where they can change without anyone
  re-reading the case.
- **SKIP**: `| ABC-XY-002 SKIP | ... |` — written down, deliberately not
  automated yet. Say why in the Expected column or a note. Do not name another
  case's ID in the reason.
- One file per screen (`screens/`) or end-to-end journey (`journeys/`).

## The loop, and the direction it runs

1. A person edits a case — rewords, adds, marks SKIP, deletes.
2. The cases check reports every difference.
3. The scripts are changed to match, in a commit naming the IDs that moved.

**Never edit a case to match a script.** That makes the automation the
specification again. If a case is wrong, a person decides what it should say.
