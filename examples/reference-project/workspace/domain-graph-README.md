# Domain knowledge graph

What the reference project **must do**, extracted from the client's five BRDs, the P&L
Dashboard BRD and the two prototypes. 481 concepts, 1,041 relationships, 21 communities.

**P&L Dashboard: the graph records what the BRD SAYS; product decisions taken since
override parts of it** — Net P&L, clawback, commission, GST, State/Branch. Read
`server-app/docs/pnl-dashboard.md` (decisions D1–D9) before building on a
P&L node.

A naming note, because it appears throughout: the BRDs and the prototype call the
product **the client product** (the client, written by the vendor). That name is left
untouched in `sources/` and in the extracted graph — those quote the client's
documents, and rewriting a quotation makes it impossible to check against the
original. **the reference project** is what we are building. Same product, our name for it.

This is the business domain, not the codebase. `server-app/docs/` and
`web-app/docs/` describe how the platform is built; this describes what
it is for. When the two disagree, the BRD wins and the code is wrong.

## Start here

| File | Use it for |
|---|---|
| **`wiki/index.md`** | **Entry point.** 21 communities (the ten `P&L …` ones cover the P&L Dashboard) and 10 god nodes, each linking to an article. Read this first. |
| `wiki/<Concept>.md` | One article per community and per heavily-connected concept, with its neighbours and source citations. |
| `GRAPH_REPORT.md` | God nodes, surprising cross-module connections, cohesion scores, extraction audit. |
| `graph.html` | Interactive graph. Open in a browser — self-contained, no server. |
| `graph.json` | The graph itself. Every node and edge carries its source file, section, and a confidence tag. |
| `sources/` | The BRDs and prototypes the graph was built from. |

## Reading an edge

Every relationship is tagged, so you can tell a stated requirement from an
inference:

- **EXTRACTED** — stated in the BRD. "Approved invoices move downstream to Payment Listing."
- **INFERRED** — a reasonable reading, not stated outright. Carries a confidence score.
- **AMBIGUOUS** — flagged as uncertain. Verify against `sources/` before relying on it.

Only EXTRACTED edges are requirements. Treat the rest as leads.

## Querying it

```bash
cd docs/domain-graph
/graphify query "how does a loan case reach a paid invoice"
/graphify path "Agent Sales Data" "Payment Listing"
/graphify explain "Matching Rule Engine"
```

## Rebuilding

The graph is rebuildable from this directory alone — `sources/` holds the inputs
and `.graphify-cache/` holds the per-file extraction results, keyed by content
hash. Drop a revised BRD into `sources/` and run:

```bash
cd docs/domain-graph && /graphify sources --update
```

Only the changed file is re-extracted; the rest comes from cache.

## What it is not

Not a schema, and not a plan. The graph says a Cost Sheet exists, what feeds it,
and which rules govern it — it does not say which table stores it or which
endpoint serves it. It is the input to that design, not a substitute for it.

Also: the BRDs are a **single-tenant product spec**. Nothing in them mentions the
tenant boundary that every rule in `CLAUDE.md` exists to protect. Multi-tenancy is
this platform's addition, so any requirement read from here still has to be built
tenant-scoped.
