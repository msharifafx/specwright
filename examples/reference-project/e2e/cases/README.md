# Test cases

**These files are the source of truth. The scripts under `tests/` are derived
from them, not the other way round.**

A tester who has never opened a Playwright file should be able to read a case,
disagree with it, and change it here — in English, in a table — and have the
script follow. That is the whole point of this directory existing.

## How a case is written

Every case has an **ID**, and the ID is the join between this directory and the
scripts. It never changes once written down, even if the wording does; a
renamed case is a new ID and a deleted one, so history stays readable.

```
| ID | Case | Steps | Expected |
|----|------|-------|----------|
| MAS-GRADE-004 | A duplicate code is refused | Create `G-DUP`. Create it again. | The dialog stays open and says the code is in use. |
```

IDs are `AREA-SCREEN-NNN`, numbered within their file and never reused:

| Prefix | Area |
|---|---|
| `JRN-` | a journey that spans screens |
| `MAS-` | master configuration |
| `ACC-` | accounts, users, roles, hierarchy |
| `LDR-` | loan data reconciliation |
| `PAY-` | payout, invoicing, payments |
| `AGT-` | agent onboarding and the agent portal |
| `CFG-` | workspace configuration |
| `SYS-` | profile, audit, job runs |
| `PLT-` | the platform console |
| `PUB-` | anything reachable without signing in |

## The loop

1. **A tester edits a case here** — reword an expectation, add a row, mark one
   `SKIP` with a reason, delete one that no longer describes the product.
2. **`pnpm cases:check`** reports the difference between this directory and
   `tests/`: cases with no script, scripts with no case, and IDs that appear
   twice. It is part of `pnpm gate`, so the two cannot drift silently.
3. **Claude adjusts the scripts** to match, in a commit that says which IDs
   moved. The case file is not edited to match the script — that would make the
   script the source of truth again, which is exactly the inversion this
   directory prevents.

## What belongs in a case, and what does not

A case says **what a user does and what they must see**. It does not name a CSS
selector, a route, an API endpoint or a test id — those belong in the script,
where they can change without anyone re-reading the case.

Good: *"Save without a description. The form says the description is required
before the request is sent."*

Bad: *"Click `[data-testid=save]` and assert `.field-error` is visible."*

## A case the product does not answer yet

Some cases describe behaviour that has not been built, or that was decided
against. They are **not** marked `SKIP` and left to rot — they are **PINNED AS
AN ABSENCE**: a script in `tests/tenant/product-gaps.spec.ts` asserts what the
product does today, in the shape of the case it fails to satisfy.

The day somebody builds the feature, that assertion breaks and sends them
straight to the case that has been waiting for them. A `SKIP` would not: it is a
sentence in a file nobody reads again.

One case is pinned the other way round. `PAY-LC-019` describes an invariant the
product **violates** — new cases join a cost sheet that has already been
approved — and its script is marked `test.fail()`. It reproduces the defect, the
suite stays green, and the day the defect is fixed Playwright reports that the
case passed unexpectedly and somebody has to come back to it.
