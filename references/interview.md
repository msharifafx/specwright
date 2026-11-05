# The interview: what to ask, when, and how

Specwright is opinionated, but the project is not yours. Every project has
answers only its people know: who decides scope, what may never break, which
of two documents is current. Guessing those is how a fast build turns into a
fast build of the wrong thing. This file covers how to find the questions
that need asking, and how to ask them so they get answered.

## Contents

1. Principles
2. Discovery first: answer what you can yourself
3. The question bank, by area
4. How to ask
5. Recording answers

---

## 1. Principles

- **Ask only what changes what you build.** If every plausible answer leads to
  the same files, pick the default, say so in one line, and move on.
- **Never ask what the project can answer.** Read the code, the configs, the
  CI files, the git history and the docs first. "Which test framework do you
  use?" is a failure when `package.json` says Vitest.
- **Ask about contradictions, not just gaps.** Two documents that disagree are
  the most valuable questions you will find. See `contradictions.md`.
- **Recommend.** Every question carries your recommended answer and the
  reason. A stakeholder can confirm in seconds what they would take minutes to
  invent.
- **Batch, then build.** Ask the blocking questions together, up front. Keep
  non-blocking ones in the open-questions file and build the parts they do not
  touch.
- **Plain language.** Name the concrete thing ("the Status field on the Agent
  form"), not the abstraction ("state management"). If the reader has to
  re-read the question to work out what is being asked, it was the wrong
  question.

## 2. Discovery first: answer what you can yourself

Run this before asking anything. Start with
`node <skill>/scripts/audit.mjs <root>`: it reports the layout, the manifests,
and which Specwright pieces already exist.

**Prerequisites first.** `node` (18+) and `git` must be on the PATH, and
**graphify is required**: if `graphify` is not on the PATH or the `/graphify`
skill is not available, stop and tell the user to run
`uv tool install graphifyy` (or `pipx install graphifyy`) and then
`graphify install` (`graphify install --platform windows` on Windows). Do not
continue the setup without it.

| Find out | Where to look |
|---|---|
| Layout: single repo, monorepo, workspace of repos, sibling repos | `git rev-parse --show-toplevel` in each directory; `pnpm-workspace.yaml`, `nx.json`, `turbo.json`, `lerna.json`, `go.work`, Cargo `[workspace]`, Gradle `settings.gradle`, Maven modules, `.gitmodules` |
| Units and their toolchains | Manifests per directory: `package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`, `pom.xml`, `build.gradle(.kts)`, `*.csproj`, `Gemfile`, `composer.json`, `pubspec.yaml`, `Package.swift`, `*.tf` |
| Lint, format, typecheck commands | Scripts in the manifests; `.eslintrc*`/`eslint.config.*`, `ruff.toml`, `.golangci.yml`, `detekt.yml`, `.editorconfig`, `Makefile`, `justfile`, `Taskfile.yml` |
| Tests | Test directories and config; how CI runs them |
| CI/CD and the deployment model | `.github/workflows`, `.gitlab-ci.yml`, `buildspec.yml`, `Jenkinsfile`, `azure-pipelines.yml`, `bitbucket-pipelines.yml`; branch names (`release`, `uat`, `staging`) |
| Existing agent instructions | `CLAUDE.md`, `AGENTS.md`, `.cursorrules`, `.cursor/rules`, `.github/copilot-instructions.md`, `.windsurfrules`, `CONVENTIONS.md`, `.claude/settings.json` |
| Existing records | `docs/adr`, `docs/decisions`, `CHANGELOG`, issue templates, `CODEOWNERS` |
| Requirements and design | `docs/`, `*.pdf`, `*.docx`, prototype `*.html`, Figma links in READMEs |
| Contracts | `openapi.*`, `*.graphql`, `*.proto`, generated client directories |
| Data and migrations | migration folders, ORM schema files |
| Local environment | `docker-compose*.yml`, `.env.example`, `devcontainer.json`, `Tiltfile` |
| History of pain | `git log --grep='fix\|revert\|hotfix'`, reopened issues |

Write what you found as a short **discovery summary** before asking anything,
and show it: the user corrects a wrong assumption faster than they answer an
open question.

## 3. The question bank, by area

Each row has a **default**. Ask only when discovery did not settle it, and only
when the answer changes the build. Questions marked ★ are always worth
confirming, even when discovery suggests an answer, because a wrong guess is
expensive.

### A. Scope and authority

The tier is asked first, because it decides how much of the rest applies
(`tiers.md`):

| Question | Ask when | Default if unanswered |
|---|---|---|
| ★ How much ceremony does this project need? **Lite** — a prototype, script, small service or internal tool: instructions, hooks, gate, feature worktrees, open questions, team lessons. **Standard** — a product with real users: adds the decision log, defect tracker, feature workflow, requirements graph, path-scoped rules and cases. **Platform** — many users or tenants sharing infrastructure: adds per-session isolated stacks, multi-tenant load tests, leak probes, observability rules and the hotfix chain. | Always, once | Standard |

| Question | Ask when | Default if unanswered |
|---|---|---|
| ★ What is the product, and who uses it (internal staff, customers, their customers)? | No source says it plainly | Ask — isolation and permission questions depend on it |
| ★ Which documents are the requirements, and which version is current? | More than one source, or versions in file names | The newest dated, signed-off one; log the others as superseded |
| ★ Who decides when two sources disagree? | Always, once | The product owner; record the name |
| Is the design (prototype, Figma) binding, or illustrative? | A design source exists | Binding for layout and controls; requirements win on behaviour |
| What is out of scope for the first release? | Requirements are large | Nothing is out of scope until someone says so; log it as a question |
| Is there a deadline or a milestone that orders the work? | Always, once | None; order by dependency |

### B. Invariants — what may never break

| Question | Ask when | Default |
|---|---|---|
| ★ What must never happen, whatever a requirement says? (data leaking across customers, money moving twice, an unaudited change...) | Always | Propose a list from the architecture (see `stacks.md` § invariants) and ask for confirmation |
| Is there an isolation boundary — tenants, accounts, organisations, regions? | Multi-customer product | Assume yes for B2B SaaS and confirm |
| Regulatory or audit constraints? (PII, financial, health, data residency) | Domain suggests it | Ask; never assume none |

### C. Layout and stack (existing projects: usually answered by discovery)

| Question | Ask when | Default |
|---|---|---|
| Keep the current layout, or restructure? | Existing project | **Keep it.** Specwright adapts to the layout, never the reverse |
| For sibling repos with no wrapper: may we add a workspace directory above them? | Sibling layout | Recommend yes; feature worktrees need one root to mirror |
| New project: which stack per unit? | New project with no decision | Ask; recommend what the team already runs in production |
| Which commands are the source of truth — the manifest scripts, a Makefile, or CI? | They disagree | CI — **after checking CI can actually run** (its configs exist, its tests exist). A broken CI is a finding; ask before copying it into the gate |

### D. Ways of working

| Question | Ask when | Default |
|---|---|---|
| ★ Deployment model: promote one artifact dev → uat → prod, or a branch per environment? | Environment branches exist, or CI is unclear | Artifact promotion; the hotfix chain stays unarmed |
| Who may commit, merge and run migrations — people only, or agents too? | Agents will run in parallel | People own git and migrations; agents edit files |
| Is there a test or QA team who should own the cases? | Always, once | The developer owns them until a tester exists |
| Where should decisions and questions live? | An ADR folder or wiki already exists | Use what exists |
| Is a lint rule allowed to be relaxed, and by whom? | Existing project with many lint disables | Only with the rule and its doc changed in the same PR |

### E. Verification

| Question | Ask when | Default |
|---|---|---|
| Is there a local or ephemeral environment that runs the whole system? | No compose/devcontainer found | Build one before the first feature |
| Is there seeded data with the shape of production? | Always, once | Build a fixture tenant/account with realistic volume |
| What volumes should the system handle? (rows per table, users, requests/s) | Lists, imports, reports | Ask; size the indexes and the load test from it |
| Which external services cost money per call? | Integrations exist | Never load-test them; mock at the boundary |

### F. Per feature (asked at the start of every feature, not at setup)

| Question | Ask when |
|---|---|
| The requirement says X and the design shows Y — which? | They disagree |
| The requirement contradicts how the system already behaves — change the behaviour, or the requirement? | Existing behaviour differs |
| The requirement would break invariant N — what was meant? | Always ask; never build it |
| Who sees this — which roles, which tenants/accounts? | Permissions are implied but not stated |
| What happens on failure, partial success, retry, or a duplicate? | Imports, payments, approvals, integrations |

## 4. How to ask

- Use the structured question tool when one is available (in Claude Code:
  `AskUserQuestion`), at most four questions per call, each standing on its
  own: the person may see only the dialog, so name the documents and items
  inside the question.
- Put your recommended option first and mark it "(Recommended)".
- For a contradiction, quote both sides briefly in the question. "BRD §4.2
  says the code is editable after approval; the prototype greys it out.
  Which should the form do?"
- Do not ask "should I proceed?" or "is this plan OK?". Ask the decision.
- Group by who can answer. Product questions to the product owner, platform
  questions to the tech lead. Say which in the open-questions entry.
- If no one can answer now, record the question, take the recommended default
  for the parts it does not block, and say so in your report.

## 5. Recording answers

Every answer is written down where the next session will find it:

| Answer type | Goes to |
|---|---|
| A contradiction resolved | `open-questions.md` entry marked ANSWERED (who, when), then the requirement note or code change |
| A choice between two readings, or a deliberate "not now" | `deferred-decisions.md` |
| An invariant | The workspace `CLAUDE.md` invariants list, and a lint rule if one can enforce it |
| A command, location or layout fact | `.claude/specwright.ini` |
| A trap the team should never hit twice | A team lesson in `<lessons_dir>/`, indexed in `INDEX.md` |
| A personal preference of one developer | That developer's personal Claude memory |

An answer that lives only in the chat is re-asked next week.
