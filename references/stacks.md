# Stacks and architectures: the same practices, different tools

The practices in this harness are fixed. The tools are not. This file maps
each practice to its equivalent per ecosystem, and lists the invariants that
typically come with each architecture, as a starting point for the interview.
Prefer what the project already uses over anything here.

## Contents

1. Practice → tool, per ecosystem
2. Architecture lint: making structure an error
3. Invariants by architecture
4. "Run it yourself" by kind of system

---

## 1. Practice → tool, per ecosystem

| Practice | TypeScript / JS | Python | Go | JVM (Java/Kotlin) | .NET | Rust | Mobile (Swift / Kotlin / Flutter) |
|---|---|---|---|---|---|---|---|
| Lint one file | `eslint --fix {file}` | `ruff check --fix {file}` | `golangci-lint run` (package) | `ktlint -F {file}`, Checkstyle, Spotless | `dotnet format --include {file}` | `cargo clippy` (crate) | SwiftLint `--path {file}`, ktlint, `dart analyze {file}` |
| Format | Prettier, Biome | `ruff format`, Black | `gofmt -w {file}` | Spotless | `dotnet format` | `rustfmt {file}` | swift-format, `dart format` |
| Typecheck (Stop hook) | `tsc --noEmit` / `tsc -b` | `mypy`, `pyright` | `go vet ./...` / `go build ./...` | `gradle compileKotlin`, `mvn -q compile` | `dotnet build -warnaserror` | `cargo check` | `xcodebuild build`, `gradle compileDebugKotlin`, `flutter analyze` |
| Unit tests | Vitest, Jest | pytest | `go test ./...` | JUnit | xUnit, NUnit | `cargo test` | XCTest, JUnit, `flutter test` |
| Architecture rules | ESLint `no-restricted-imports`, `import-x/no-cycle`, dependency-cruiser, eslint-plugin-boundaries | import-linter, Ruff `TID`/`flake8-tidy-imports` | depguard (golangci), `go-arch-lint` | ArchUnit, Konsist | NetArchTest, ArchUnitNET | `cargo-deny`, module privacy | SwiftLint custom rules, Konsist |
| Size limits | `max-lines`, `max-lines-per-function` | Ruff `PLR0915`, `C901`; pylint `max-module-lines` | `funlen`, `gocyclo` | detekt `LongMethod`, `LargeClass` | Roslyn analyzers | clippy `too_many_lines` | SwiftLint `file_length`, `function_body_length` |
| Duplication | sonarjs `no-identical-functions` | pylint `duplicate-code` | `dupl` | detekt, PMD CPD | Sonar | — | jscpd |
| Contract freshness | `openapi` emit + `git diff --exit-code` | FastAPI/drf-spectacular emit + diff | `swag`/`oapi-codegen` + diff | springdoc + diff | Swashbuckle CLI + diff | utoipa + diff | generated client + diff |
| Migration required | drizzle-kit/prisma `migrate diff` | `alembic check`, `manage.py makemigrations --check` | atlas `migrate diff` | Flyway/Liquibase diff | `dotnet ef migrations has-pending-model-changes` | sqlx/diesel | Room schema export diff |
| Vulnerability + secrets | Trivy, osv-scanner, gitleaks | Trivy, pip-audit | Trivy, govulncheck | Trivy, OWASP dependency-check | Trivy, `dotnet list package --vulnerable` | `cargo audit` | Trivy, MobSF |
| End-to-end | Playwright, Cypress | Playwright | Playwright | Playwright, Selenide | Playwright | — | XCUITest, Espresso, Maestro, Detox |
| Load test | k6 | Locust, k6 | k6, vegeta | Gatling, k6 | k6, NBomber | k6 | — |
| Leak probe | heap snapshots + RSS over time | tracemalloc + RSS | pprof heap + RSS | heap dump / JFR | dotnet-counters, dotnet-gcdump | heaptrack | Instruments, LeakCanary |

Rules of thumb:

- The lint hook needs a **per-file** command. When a linter only works per
  package (golangci-lint, clippy), lint the package containing the file and
  keep the output short (`| head -40`).
- The Stop hook needs the **fastest whole-unit** check. If the full check takes
  over a minute, use an incremental mode and keep the full one in the gate.
- Pin tool versions in the repo (lockfile, `tool-versions`, a script that
  downloads a pinned binary). A gate whose scanner updates itself fails on a
  Tuesday for no reason anyone changed.

## 2. Architecture lint: making structure an error

Whatever the linter, encode these as **errors**, with a message that names
the doc explaining why:

1. **Boundaries**: module A may not import module B's internals. Each
   restriction message says what to use instead.
2. **Dangerous handles go through one door**: database handles, tenant
   context, HTTP clients for external systems, secrets access, cache clients.
   Ban direct imports; allow the one wrapper module.
3. **No cycles** between modules.
4. **Size**: a file limit (around 300 lines, blank lines and comments
   excluded so explanation is not punished) and a function limit (around 50).
   Hitting one means two concerns share a file.
5. **Narrow DRY**: identical functions and identical branches, not "any
   similarity". Blanket DRY produces premature abstraction.
6. **Type safety**: no `any`/untyped escape hatches, no unhandled promises or
   ignored errors, exhaustive switches.

The server example (`examples/reference-project/server/eslint.config.mjs`) shows
all six in ESLint, including a ban whose comment explains the exact failure
it prevents. Copy the shape, not the rules.

## 3. Invariants by architecture

Propose these in the interview as a starting list; the user confirms, edits
or removes. Each confirmed invariant goes into the workspace `CLAUDE.md` and,
where possible, into a lint rule or a test.

| Architecture | Typical invariants |
|---|---|
| **Multi-tenant SaaS** | Tenant identity derived by the server, never sent by the client · no query, cache key, queue message, file path or log line without the tenant · one tenant cannot exhaust shared capacity (connection budget, queue fairness) · migrations reach every tenant before a deploy is done |
| **Single-tenant / internal app** | Every write audited with who and when · no destructive operation without confirmation · role checks on the server, never only in the UI |
| **Payments / money movement** | Idempotency key on every money-moving call · amounts in integer minor units, never floats · double-entry or append-only ledger · reconciliation job with an alarm |
| **Event-driven / microservices** | Consumers idempotent · schema registry or versioned contracts · at-least-once delivery assumed · no synchronous call chains longer than N · every message carries a correlation id |
| **Data pipelines / analytics** | Reruns produce the same output (idempotent, partitioned by date) · schema changes are additive · row counts reconciled between stages · PII columns tagged and masked downstream |
| **Mobile / offline-first** | The app works without a network for its core flows · server is the conflict-resolution authority · no secrets in the binary · backward-compatible API for N old app versions |
| **Serverless** | Cold-start budget · no state between invocations · timeouts shorter than the caller's · dead-letter queue on every async trigger |
| **Public API / SDK / library** | Semantic versioning, no breaking change without a major · deprecation before removal · public surface documented and tested |
| **Regulated (health, finance, gov)** | Data residency · retention and deletion rules · access logged · encryption at rest and in transit |
| **ML / LLM features** | Evaluation set run before a model or prompt change ships · no PII in prompts or logs without consent · fallback path when the model is unavailable · cost per request bounded |

## 4. "Run it yourself" by kind of system

| System | What running it means |
|---|---|
| HTTP API | A curl/httpie script through the happy path, each validation, the conflict, the permission refusal and the isolation boundary; output pasted in the PR |
| Web UI | Drive the screen in a real browser (headless with screenshots is fine); every control, every message, resize, keyboard-only pass; compare with the design side by side |
| Mobile | On a simulator/emulator and one real device; airplane mode for offline flows; smallest and largest supported screens |
| CLI | Run the commands with real arguments, bad arguments and `--help`; check exit codes |
| Background jobs | Enqueue a real message; watch it complete; kill it midway and confirm the retry is safe |
| Data pipeline | Run on a realistic sample; compare row counts and a few known records end to end |
| Library | A tiny consumer project that installs the built package, not the source tree |
| Infra | `plan` reviewed, applied in a non-prod account, then a smoke test against what it created |
