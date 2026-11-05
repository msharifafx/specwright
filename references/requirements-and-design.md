# Requirements and design: the source of truth

## Contents

1. Keep the sources untouched
2. Make requirements queryable
3. Ask the requirements at the start of every feature
4. Design from the design source's markup
5. What the requirements do not know

---

## 1. Keep the sources untouched

Keep every requirement source in `requirements_dir` exactly as received — in
an existing project, wherever the sources already live (never move them); in
a new one, `docs/requirements/sources/`: BRDs, PRDs, the clickable prototype, design exports, signed-off
emails and meeting notes that changed scope. Never rewrite them. If the
client's product name differs from yours, it stays as-is inside the sources
and the extract, so any quote can be checked against the original. Use your
own name everywhere else.

Record each source's version and date in `<requirements_dir>/README.md`
(template: `templates/workspace/docs/README.requirements.md`). Two versions of
one document is a supersession question for the interview.

## 2. Make requirements queryable — graphify is required

Specwright builds the requirements into a knowledge graph with the
[graphify](https://github.com/Graphify-Labs/graphify) skill. It is a
**prerequisite**, not an option: without a graph, "ask the requirements" turns
back into "remember the requirements", which is the failure this exists to
prevent.

Install once per machine (Python 3.10+):

```
uv tool install graphifyy          # or: pipx install graphifyy
graphify install                    # Windows: graphify install --platform windows
```

If `graphify` is not on the PATH, or the `/graphify` skill is not available
to the session, **stop setup and tell the user** with the commands above. If
it is installed but cannot run on these sources, stop and ask — do not
substitute a hand-written summary and carry on.

Build the graph from the sources:

```
/graphify <requirements_dir>
```

It extracts concepts and relationships, clusters them into topics, and writes
`graphify-out/` (an interactive HTML view, `graph.json`, and a report). On the
reference project five BRDs and the clickable prototype became a graph whose
topic pages are where every feature starts. Commit the output so the whole
team queries the same graph; rebuild it when a source changes.

Either way, **tag every relationship**:

| Tag | Meaning | Binding? |
|---|---|---|
| EXTRACTED (stated) | The source says it; reference attached | Yes |
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

Rebuild the graph when a requirement source changes, and after a feature if
the code is graphed too: a stale graph makes the next feature's first step
misleading.

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
