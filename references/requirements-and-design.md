# Requirements and design: the source of truth

## Contents

1. Keep the sources untouched
2. Make requirements queryable
3. Ask the requirements at the start of every feature
4. Design from the design source's markup
5. What the requirements do not know

---

## 1. Keep the sources untouched

Put every requirement source in `REQUIREMENTS_DIR/sources/` exactly as
received: BRDs, PRDs, the clickable prototype, design exports, signed-off
emails and meeting notes that changed scope. Never rewrite them. If the
client's product name differs from yours, it stays as-is inside the sources
and the extract, so any quote can be checked against the original. Use your
own name everywhere else.

Record each source's version and date in `REQUIREMENTS_DIR/README.md`
(template: `templates/workspace/docs/README.requirements.md`). Two versions of
one document is a supersession question for the interview.

## 2. Make requirements queryable

Best: a knowledge graph built from the sources. On the reference project the
`graphify` skill turned five BRDs, a P&L BRD and the prototype into 481
concepts and 1,041 relationships in 21 topic communities, with an HTML view
and a wiki page per topic. Any equivalent works.

Without a graph tool: a glossary file per area with, for each concept, its
definition, its rules, and its relationships to other concepts. Slower to
build, same discipline.

Either way, **tag every relationship**:

| Tag | Meaning | Binding? |
|---|---|---|
| STATED / EXTRACTED | The source says it; reference attached | Yes |
| INFERRED | Implied; a lead | No — verify against the source |
| AMBIGUOUS | Readable two ways | No — it is an open question |

An extractor guesses. Only stated links bind.

## 3. Ask the requirements at the start of every feature

Before designing, query the area the feature touches:

```
/graphify query "what feeds the Cost Sheet"
/graphify path "Agent Sales Data" "Payment Listing"
/graphify explain "Matching Rule Engine"
```

Then run the contradiction procedure (`contradictions.md`) over what came
back. On the reference project this is how the cost sheet turned out to be a
*sequence* of sheets (a late case opens the next sheet rather than reopening a
finalized one): a fact no single paragraph said, and that memory alone would
have missed.

After the feature, refresh the graph if the code graph is kept too (a stale
graph makes the next feature's step 1 misleading).

## 4. Design from the design source's markup

The requirements answer WHAT a screen must do. The design source answers what
it LOOKS like. An agent given only a field list builds to its own taste: on
the reference project, User Management came out with the right data and
looked nothing like the design, and had to be rebuilt.

For every screen:

1. Open the prototype HTML/CSS (or the design file's inspect view) for that
   screen.
2. Extract: fields in order, labels as written, which are mandatory and how
   that is shown, the control for each field (segmented switch vs dropdown vs
   radio), empty states, buttons and their order, table columns.
3. Build to the project's **shared components**. Where one screen of the
   prototype has a look no other screen shares (a one-off header colour, a
   native select), the shared component wins; ask the designer if in doubt.
4. Compare the result side by side in a browser before calling it done.

Write the extraction snippets and the convention checklist once, in a
path-scoped rule that loads with UI code. The real one, with Python snippets
that pull a screen's markup out of a single-file prototype, is
`examples/reference-project/web/.claude/rules/prototype-fidelity.md`.

## 5. What the requirements do not know

Requirements documents are usually written for one customer, one region, one
happy path. Write down, once, the platform concerns they never mention but
which bind every requirement read from them: multi-tenancy, audit, offline
mode, localisation, scale, retention. On the reference project: "The BRDs are
a single-tenant spec. Every requirement read from them is still built
tenant-scoped." That single line in the workspace instructions prevented a
class of contradiction from ever being asked twice.

Where requirements and build docs disagree: about **what the product does**,
the requirements win; about **how it is built**, the build docs win.
