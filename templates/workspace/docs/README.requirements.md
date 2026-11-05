# Requirements

The sources — in `sources/` for a new project, or wherever they already live
in an existing one (never move them) — are the requirements EXACTLY as received — BRDs, PRDs,
prototypes, signed-off emails. Never edit them: a rewritten quote can no
longer be checked against the original.

Next to them, a queryable extract: a knowledge graph (e.g. the `graphify`
skill), or failing that a glossary of concepts with, for each relationship:

| Tag | Meaning | Binding? |
|---|---|---|
| STATED | The source says it, with a reference | Yes |
| INFERRED | Implied by the source | No — verify, then ask |
| AMBIGUOUS | The source can be read two ways | No — goes to the open questions |

Ask it at the start of every feature: "what feeds X", "what depends on Y",
"what does the source say about Z".

**Domain vs design.** These files answer WHAT the product must do. The
prototype or design file answers what it LOOKS like — read its markup for the
screen being built, never build a screen from a field list.

**What the requirements do not know.** Write it here: the platform concerns
the source never mentions (multi-tenancy, offline mode, audit, scale) that
still bind every requirement read from it.
