# Finding and resolving contradictions

A contradiction found before building costs one question. Found in UAT, it
costs a rebuild. Found in production, it costs trust. This is the
highest-return activity in the whole method, so it is done deliberately, not
noticed by accident.

## Contents

1. Where contradictions hide
2. The procedure
3. Classifying what you found
4. The register entry
5. Worked examples

---

## 1. Where contradictions hide

Check each pair. Most real projects have contradictions in at least four of
these.

| Pair | Typical shape |
|---|---|
| Requirement vs requirement | Two documents, or two sections of one, define the same rule differently: a field mandatory in one, optional in another; a status list with different values |
| Requirement vs design | The BRD says editable, the prototype greys it out; the BRD names a chart "by bank", the prototype draws "by product" |
| Requirement vs a later instruction | An email, ticket or meeting note changes scope without updating the BRD |
| Requirement vs invariant | A single-tenant spec implies a cross-customer report; a "delete" requirement on audited data |
| Requirement vs existing behaviour | The system already does Y; the new requirement says X and does not mention Y |
| Docs vs code | The README says one command, CI runs another; an architecture doc describes a component that was never built or was replaced |
| Config vs practice | CI promotes one artifact but the team keeps a branch per environment; a lint rule exists and the code has 200 disables for it |
| Naming | The client calls it one thing, the code another, the UI a third. Not a contradiction in behaviour, but it causes them |
| Permissions catalog vs screens | A permission names something no screen does, or a screen needs a permission no catalog grants |
| Numbers | Totals that cannot add up, thresholds that conflict, a format (date, currency, fiscal year) used two ways |

## 2. The procedure

Run it at setup over everything, and at the start of each feature over what
that feature touches.

1. **Collect the sources** for the area: requirement sections, the design
   screens, later emails or tickets, the current code path, the relevant docs.
2. **Extract claims**, not prose. One line each, with its source reference:
   `Agent code — editable after approval — BRD v1.0 §4.2`.
3. **Group claims by subject** (a field, a rule, a status, a screen, a number).
   A subject with two or more claims is a candidate.
4. **Compare within each group.** Same meaning → fine. Different → classify
   (section 3).
5. **Check each claim against the invariants.** A claim that would break one
   is always a question, even if no other source disagrees.
6. **Check the silences.** Failure, retry, duplicates, permissions, empty
   states, volume, deletion. A requirement that says nothing about what
   happens when an import half-fails is a gap; gaps go in the register too.
7. **Write each finding** into the open-questions file (section 4), quoting
   both sides exactly.
8. **Ask** the blocking ones (see `interview.md` § How to ask). Build the
   unaffected parts meanwhile.

For large requirement sets, use the requirements graph: query each subject
("what does the source say about Agent code") and look for relationships
tagged AMBIGUOUS, or concepts with conflicting STATED edges.

## 3. Classifying what you found

| Class | Meaning | Action |
|---|---|---|
| **Conflict** | Two sources say incompatible things | Ask. Do not build the affected part |
| **Supersession** | A later, authoritative source replaced an earlier one | Confirm once that the later source wins, then record it and move on |
| **Gap** | No source says anything about a case that must be handled | Ask, with a recommended behaviour. Build the recommendation only if the user says to proceed without an answer |
| **Invariant breach** | A requirement, read literally, breaks something that may never break | Ask what was meant. Never build the literal reading |
| **Drift** | Docs or config disagree with the code | Decide which is true (usually CI and code — once you have checked CI can run), fix the other. Log it as an FYI entry so the fix is visible; ask only if behaviour changes |
| **Naming** | The same thing has several names | Record a glossary line; use the code's name in code and the client's name in quotes |
| **False alarm** | Different words, same meaning | Drop it; do not ask |

Severity for ordering the questions: a contradiction in money, permissions,
data isolation or legal text comes first; layout and wording last.

## 4. The register entry

Use the template in `templates/workspace/docs/open-questions.md`. The parts
that make an entry answerable:

- A **one-line question** a stakeholder can answer without reading the rest.
- **Both sides quoted exactly**, with their location. A paraphrase invites
  "that's not what it says".
- **Why it matters**: what gets built differently.
- **Options with consequences**, and a **recommendation**.
- **Who should answer.**

When answered: write the answer, who, and when; mark it ANSWERED; then move
the outcome into the requirement notes, the code, or the decision log.
Never delete an answered entry: it is the evidence for why the product
behaves as it does.

## 5. Worked examples (from the projects Specwright came from)

**Requirement vs design.** The permission catalog named a chart "Disbursement
by bank — share of disbursement across banks". The prototype drew
"Disbursement mix by product" with home loan / LAP / personal / business
slices. One permission key cannot mean both. Classified as a conflict, small
and cheap to settle; logged and sent to the client as one question rather
than guessed in code.

**Requirement vs invariant.** The BRDs were a single-tenant specification and
never mentioned tenants. Every report they describe would, built literally,
read across all customers. Classified as an invariant breach, answered once
at setup: every requirement is built tenant-scoped. Recorded in the workspace
instructions so no feature asks again.

**Gap found by the cases.** A checker must type a reason to reject an agent
onboarding request, but no source said where the maker sees it, and the
screen did not show it, so makers resubmitted unchanged. Classified as a gap;
fixed by reading the reason from the approval trail, and recorded in the
decision log with the reasoning.

**Config vs practice.** CI documented artifact promotion (one image, dev →
uat → prod) while the team was about to create release/uat branches. Both
cannot be the source of truth about what is deployed where. Classified as
drift with a behaviour change, so asked rather than fixed silently.
