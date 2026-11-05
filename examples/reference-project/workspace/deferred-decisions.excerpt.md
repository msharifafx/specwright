# Deferred decisions

Things we have decided **not** to build yet, written down with enough context that
the next person does not have to rediscover the reasoning. Each entry says what
the current behaviour is, why it is deferred, and what has to be true before it
gets picked up.

Requirements gaps found against the BRDs go here too — a gap that is only in a
chat log is a gap that gets re-found six months later.

---

## 1. Approval Management — checker scoping to reportees

**Status:** requirements gap. Not built. Needed before maker-checker is correct.

**What the BRD says.** Onboarding & Invoicing BRD §4.3–4.4: *"Products and approver
roles are available as masters"*, and the approval hierarchy configures *"the number
of approval levels, approver roles, approval sequence, and approval conditions"* per
flow.

**What we already have.** The approver-roles-per-level half is built:
`approval_flow_levels` carries `mode` (`all` / `any`) and
`approval_flow_level_roles` maps a level to N roles — roles, not users, so a flow
survives someone leaving. See `server-app/src/db/tenant/schema/approvals.ts`.

**What is missing.** The hierarchy half:

> A checker can only see and approve requests raised by their **direct and indirect
> reportees**.

Today, holding an approver role at level N shows you **every** pending request at
level N, tenant-wide. Two regional managers see each other's regions' submissions
and can approve them. Nothing in `src/modules/approvals/` reads the reporting tree —
grep for `reportee`, `reported_to`, or `descendant` in that module returns nothing,
and the only `path` hits there are validation-error field paths.

**What it will need.**

- The materialized path is already there and already correct — `users.path`, shape
  `/a/b/c/` with leading *and* trailing slash, plus the pure helpers in
  `src/modules/users/hierarchy-path.ts`. Subtree membership is
  `submitter.path LIKE checker.path || '%'`, which is index-friendly.
- The pending-queue query in `approvals.repository.ts` gains that predicate, and so
  does the claim/decide path — a scoped list with an unscoped `POST /approve` is
  the same hole with an extra step.
- Decide what happens to a request whose only eligible approver is **not** an
  ancestor of the submitter. Under a strict reading it is unapprovable and sits in
  the queue forever. Options: fall back to the flow's role list unscoped at the top
  level, or refuse the flow at configuration time. Client question.
- `Reported To` is mandatory for System users (BRD Add User spec), so every system
  user has a path. Non-System users do not log in and never submit, so they are out
  of scope.

**Why deferred and not just done:** it changes the semantics of an existing queue,
so it wants its own feature, its own tests, and the unapprovable-request question
answered first.

---

