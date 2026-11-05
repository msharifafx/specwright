// @ts-check
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';
import importX from 'eslint-plugin-import-x';
import sonarjs from 'eslint-plugin-sonarjs';
import tseslint from 'typescript-eslint';

/**
 * the reference project server ESLint config.
 *
 * Most rules here are ordinary quality rules. The `no-restricted-*` blocks are
 * different: each one encodes an architectural invariant from CLAUDE.md that is
 * silent until production. Do not relax one without reading the doc it cites.
 */

/** Patterns that break PgBouncer transaction-pooling mode. */
const PGBOUNCER_TXN_MODE = [
  {
    selector: "CallExpression[callee.property.name='prepare']",
    message:
      'Named prepared statements break PgBouncer transaction mode — the statement is bound to a backend the next query may not land on. See docs/multi-tenancy.md.',
  },
  {
    selector: 'TemplateElement[value.raw=/\\b(LISTEN|NOTIFY|UNLISTEN)\\b/i]',
    message:
      'LISTEN/NOTIFY needs a session-pinned connection, which PgBouncer transaction mode does not give you. Use SQS or Valkey pub/sub. See docs/multi-tenancy.md.',
  },
  {
    selector: 'TemplateElement[value.raw=/\\bpg_advisory_lock\\s*\\(/i]',
    message:
      'Session-scoped advisory locks leak across pooled connections. Use pg_advisory_xact_lock (transaction-scoped) or a Valkey lock. See docs/multi-tenancy.md.',
  },
  {
    selector: 'TemplateElement[value.raw=/^\\s*SET\\s+(?!LOCAL\\b)/i]',
    message:
      'Session-level SET persists onto a connection another tenant will reuse. Use SET LOCAL inside the transaction. See docs/multi-tenancy.md.',
  },
];

/** Connection ownership: only the registry may build pools or db handles. */
const CONNECTION_OWNERSHIP = [
  {
    selector: "NewExpression[callee.name='Pool']",
    message:
      'Pools are owned by TenantConnectionRegistry, which caps live pools and evicts idle tenants. An ad-hoc Pool escapes the connection budget. See docs/multi-tenancy.md.',
  },
  {
    selector: "NewExpression[callee.name='Client']",
    message:
      'Raw pg Clients bypass the connection budget entirely. Go through TenantConnectionRegistry. See docs/multi-tenancy.md.',
  },
  {
    selector: "CallExpression[callee.name='drizzle']",
    message:
      'Build db handles in src/db/registry only, so every handle is budgeted and tenant-scoped. See docs/multi-tenancy.md.',
  },
];

/** NestJS reflexes that defeat the compile-time transaction guarantee. */
const AMBIENT_STATE = [
  {
    selector: "MemberExpression[object.name='Scope'][property.name='REQUEST']",
    message:
      'Request-scoped providers bubble up the whole injection chain and invite ambient transaction lookup. Pass `tx` explicitly as the first argument. See docs/database.md.',
  },
  {
    selector: "MemberExpression[object.name='Scope'][property.name='TRANSIENT']",
    message:
      'Transient scope on the data path has the same instantiation cost as request scope. See docs/database.md.',
  },
];

/** Query-shape rules. Cheap to write, expensive to discover at 100k rows. */
const QUERY_SHAPE = [
  {
    selector: 'TemplateElement[value.raw=/SELECT\\s+\\*/i]',
    message:
      'Explicit column lists only — SELECT * defeats covering indexes and breaks silently when a column is added. See docs/database.md.',
  },
];

/** Config access. Off only inside src/config. */
const ENV_ACCESS = [
  {
    selector: "MemberExpression[object.name='process'][property.name='env']",
    message:
      'Read config through src/config only, so every env var is validated once at boot instead of failing on a code path nobody exercised. See docs/environments.md.',
  },
];

/** Repository shape. On only for *.repository.ts. */
const REPOSITORY_SHAPE = [
  {
    selector:
      "MethodDefinition[kind='method'][key.name!='constructor'] > FunctionExpression[params.0.name!='tx'][params.length>0]",
    message:
      'Repository methods take `tx` as their first parameter. Accepting a bare db handle lets a caller run outside a transaction. See docs/database.md.',
  },
  {
    selector:
      "MethodDefinition[kind='method'][key.name!='constructor'] > FunctionExpression[params.length=0]",
    message:
      'Repository methods take `tx` as their first parameter, even when they need no other arguments. See docs/database.md.',
  },
];

/**
 * `no-restricted-syntax` is an array-valued rule, so an override REPLACES the
 * whole list rather than merging into it. Compose explicitly instead — every
 * block below must state its full set, or it silently drops the rules it omits.
 */
const restrict = (...sets) => ['error', ...sets.flat(Infinity)];
const ALWAYS = [PGBOUNCER_TXN_MODE, AMBIENT_STATE, QUERY_SHAPE];

export default tseslint.config(
  {
    // `lambda/**` is deliberately outside this project: each function has its
    // own package.json and lockfile so sharp and Chromium never reach the
    // server's runtime image. Linting it here would resolve against the wrong
    // tsconfig and the wrong dependencies.
    ignores: [
      'dist/**',
      'node_modules/**',
      'graphify-out/**',
      'coverage/**',
      'lambda/**',
      '**/*.js',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  importX.flatConfigs.recommended,
  importX.flatConfigs.typescript,

  {
    plugins: { sonarjs },
    languageOptions: {
      parserOptions: {
        // This config file is not in tsconfig's include; allowDefaultProject
        // lets it be linted without a project reference.
        projectService: {
          allowDefaultProject: ['eslint.config.mjs', 'drizzle.*.config.ts', 'vitest*.config.ts'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    settings: {
      'import-x/resolver-next': [
        createTypeScriptImportResolver({ project: './tsconfig.json', alwaysTryTypes: true }),
      ],
    },
    rules: {
      // --- Architectural invariants (see CLAUDE.md) -------------------------
      'no-restricted-syntax': restrict(ALWAYS, CONNECTION_OWNERSHIP, ENV_ACCESS),

      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'ioredis',
              message:
                'Import the shared Valkey client from src/cache — one client per process, tenant-namespaced keys. See docs/caching.md.',
            },
          ],
          patterns: [
            {
              // NOT `**/db/tenant/**`. `importNames` cannot narrow a NAMESPACE
              // import — ESLint assumes `import * as x` may reach any name — so
              // the wider group made `import * as schema from '../db/tenant/schema'`
              // an error. That barrel exports tables and types and neither
              // guarded symbol; the ban is on handles, and handles live in
              // `db/tenant-context` and `db/registry`, which this still covers.
              // `scripts/verify-schema-objects.ts` needs the whole barrel to
              // enumerate what the model declares, and there is no narrower
              // import that answers "every table".
              group: ['**/db/tenant/**', '!**/db/tenant/schema', '!**/db/tenant/schema/**'],
              importNames: ['tenantDb', 'getTenantDb'],
              message:
                'Tenant db handles come from withTenantTx, never by direct import. See docs/database.md.',
            },
            {
              // Infrastructure-READ clients, allowed only under
              // src/modules/admin/infrastructure/ — the override further down
              // re-permits them there.
              //
              // CLAUDE.md rule 53 bans calling a CloudWatch SDK to PUBLISH. The
              // Infrastructure screen reads alarm state, which is free and
              // creates no dimensions. This block is what stops "read" quietly
              // becoming "emit" somewhere else in the tree, where nobody would
              // be looking for it.
              group: [
                '@aws-sdk/client-cloudwatch',
                '@aws-sdk/client-cloudwatch-logs',
                '@aws-sdk/client-rds',
                '@aws-sdk/client-elasticache',
                '@aws-sdk/client-elastic-load-balancing-v2',
              ],
              message:
                'AWS infrastructure reads belong to src/modules/admin/infrastructure/ only, and NEVER to emit metrics. See CLAUDE.md rule 53 and docs/observability.md.',
            },
          ],
        },
      ],

      // --- Type safety ------------------------------------------------------
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/require-await': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],

      // --- Structure --------------------------------------------------------
      // express's default export legitimately carries named exports too.
      'import-x/no-named-as-default-member': 'off',
      'import-x/no-cycle': ['error', { maxDepth: 6 }],
      'import-x/no-default-export': 'error',
      'import-x/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],

      // --- DRY (docs/conventions.md) ----------------------------------------
      // Narrow on purpose. A blanket "never repeat anything" rule produces
      // premature abstraction, which is more expensive than the duplication it
      // removes. These three catch copy-paste, not incidental similarity.
      'sonarjs/no-identical-functions': ['error', 5],
      'sonarjs/no-all-duplicated-branches': 'error',
      'sonarjs/no-identical-conditions': 'error',
      'sonarjs/no-redundant-boolean': 'error',
      'sonarjs/prefer-immediate-return': 'error',

      // --- Correctness ------------------------------------------------------
      eqeqeq: ['error', 'always'],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'prefer-const': 'error',

      // --- Size (docs/feature-workflow.md) ----------------------------------
      // Blank lines and comments are excluded: this codebase is deliberately
      // comment-heavy about why the rules exist, and a limit that punishes
      // explanation would get explanation deleted.
      'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['error', { max: 50, skipBlankLines: true, skipComments: true }],
      'max-params': ['error', 4],
      'max-depth': ['error', 4],
      complexity: ['error', 12],
    },
  },

  // Size limits off where the content is generated, mechanical, or declarative
  // rather than logic. A migration is as long as the change requires; a schema
  // file grows one table at a time and splitting it hides the model.
  {
    files: [
      'src/db/**/migrations/**/*.ts',
      'src/db/*/schema/*.ts',
      'eslint.config.mjs',
      '*.config.ts',
      '**/*.spec.ts',
      '**/*.e2e-spec.ts',
    ],
    rules: {
      'max-lines': 'off',
      'max-lines-per-function': 'off',
      complexity: 'off',
    },
  },

  // Structured logging goes to stdout by design — ECS ships stdout to
  // CloudWatch Logs. `no-console` exists to stop debug logging, not to stop the
  // logger itself. Entrypoints and the log helper are the only exemptions.
  {
    files: [
      'src/main.ts',
      'src/worker.ts',
      'src/db/migrate.ts',
      // THE log helper this comment refers to. It was inside `queue/worker.ts`
      // until `queue/wake.ts` needed it too and could not import from there
      // without a cycle — so it moved here rather than being copied, and this
      // list stays a list of entrypoints plus one logger.
      'src/queue/log.ts',
      'src/queue/worker.ts',
      // The OpenTelemetry bootstrap. It runs before the Nest container exists,
      // so a failure to start tracing has nowhere else to be reported.
      'src/tracing.ts',
      'src/mail/mailer.ts',
      // A one-shot CLI whose only output is its progress. Note it is NOT in the
      // pool-ownership exemption below: it reaches the central database through
      // the registry like everything else, and needs no exception for that.
      'scripts/seed-catalog.ts',
      // The same shape as seed-catalog: a one-shot CLI publishing platform
      // reference data, whose only output is a record of what it published.
      'scripts/seed-geography.ts',
      'scripts/seed-integrations.ts',
      'scripts/setup-tenant-integrations.ts',
      // The invoice-type backfill: one line per workspace repaired, skipped or
      // failed, which IS the record an operator reads after a deploy.
      'scripts/migrate-invoice-types.ts',
      // Adds the chosen-user signatory to an existing the e-sign provider row; its one line
      // says whether it did.
      'scripts/migrate-esign-lender-signatory.ts',
      'scripts/emit-openapi.ts',
      'scripts/provision-tenant.ts',
      'scripts/seed-logos.ts',
      // A one-shot CLI whose only output is a record of the documents it wrote.
      'scripts/seed-agreement-documents.ts',
      // The payout engine's own tenant, and the script that drives it. The
      // seeder's only output is a record of what it wrote; the exerciser's only
      // output is the PASS/FAIL line per assertion, which IS the result.
      'scripts/seed-payout-w0b.ts',
      'scripts/exercise-payout-calc.ts',
      // The invoicing session's own tenant, and the script that drives it. Same
      // shape and same reason as the two above.
      'scripts/seed-invoicing-w1c.ts',
      'scripts/exercise-invoicing.ts',
      // The advance approval session's own tenant, and the script that drives
      // §5.1's auto-removal. Same shape, same reason as the two above.
      'scripts/seed-payout-w2b.ts',
      'scripts/exercise-advance-dump.ts',
      // §6's re-reconciliation, driven against a running tenant. Same shape and
      // same reason as every exercise script above: its whole output is the
      // report a person reads.
      'scripts/exercise-clawback.ts',
    ],
    rules: { 'no-console': 'off' },
  },

  // Standalone one-shot scripts, not request paths. Both build a short-lived
  // pool per tenant and end it immediately, precisely because they must NOT
  // hold connections in the registry's LRU while iterating N databases. These
  // are the only legitimate exceptions to pool ownership.
  {
    files: [
      'src/db/migrate.ts',
      'scripts/seed-local.ts',
      'scripts/provision-tenant.ts',
      // The same shape as seed-local, for the one identity it does not cover:
      // reads one central row, opens one tenant pool, writes the agent's
      // credential and ends the pool. Dev-only, and it refuses to run elsewhere.
      'scripts/seed-agent-login.ts',
      // The same shape again, for Payment Listing's own workspace: one central
      // row read, one tenant pool opened and ended, approved invoices written.
      // Dev-only, and it refuses to run elsewhere.
      'scripts/seed-payments-w1d.ts',
      // Writes one central row per fixture and ends its pool; it never touches
      // a tenant database, so it holds nothing in the registry's LRU.
      'scripts/seed-logos.ts',
      // The same shape as seed-agent-login: one central row read, one tenant
      // pool opened and ended, the §7/§9 fixtures written. Dev-only, and it
      // refuses to run elsewhere.
      'scripts/seed-payout-w1b.ts',
      // One short-lived pool per fixture, ended in a finally, writing the
      // agreement documents whose keys the template rows already name.
      // Dev-only, and it refuses to run elsewhere.
      'scripts/seed-agreement-documents.ts',
    ],
    rules: {
      'no-restricted-syntax': restrict(ALWAYS, ENV_ACCESS),
      'max-lines-per-function': 'off',
      'no-console': 'off',
    },
  },

  // The single exemption to "src/config owns process.env", and it proves the
  // rule rather than bending it: this file's entire job is to SET placeholder
  // variables before src/config validates them, so that emitting the OpenAPI
  // contract needs no database, no Valkey and no .env. It reads nothing.
  {
    files: ['scripts/openapi-bootstrap.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },

  // src/cache is the one place allowed to construct the Valkey client — the
  // rule that bans importing ioredis elsewhere has to exempt its own owner.
  {
    files: ['src/cache/**/*.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },

  // The one place allowed to read AWS infrastructure state.
  //
  // Scoped to a directory rather than trusted to a comment: the rule it relaxes
  // (CLAUDE.md 53) is about cost and about keeping the telemetry backend
  // swappable, and both survive as long as these clients only ever READ and only
  // ever from here. `no-restricted-syntax` is untouched — the connection and env
  // rules still apply in full.
  {
    files: ['src/modules/admin/infrastructure/**/*.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },

  // The registry is the one place allowed to construct pools and db handles.
  {
    files: ['src/db/registry/**/*.ts'],
    rules: {
      'no-restricted-syntax': restrict(ALWAYS, ENV_ACCESS),
    },
  },

  // drizzle-kit CLI configs run outside the application process — there is no
  // src/config to load, so they read the environment directly by necessity.
  {
    files: ['drizzle.*.config.ts'],
    rules: { 'no-restricted-syntax': restrict(ALWAYS, CONNECTION_OWNERSHIP) },
  },

  // The OpenTelemetry bootstrap runs under `node --require`, before the Nest
  // container and therefore before `src/config` can be loaded — importing it
  // here would pull half the application in ahead of the instrumentation,
  // which is the one thing this file must not do. Same necessity as the
  // drizzle-kit configs above.
  {
    files: ['src/tracing.ts'],
    rules: { 'no-restricted-syntax': restrict(ALWAYS, CONNECTION_OWNERSHIP) },
  },

  // Config is the one place allowed to read process.env.
  {
    files: ['src/config/**/*.ts'],
    rules: {
      'no-restricted-syntax': restrict(ALWAYS, CONNECTION_OWNERSHIP),
    },
  },

  // Repositories: every method takes the transaction as its first argument.
  // This is what makes "every write inside a transaction" a compile-time fact
  // rather than a convention. See docs/database.md.
  //
  // Deliberately LAST. `no-restricted-syntax` is array-valued, so a later block
  // replaces an earlier one wholesale — if the registry block came after this,
  // a repository placed under src/db/registry would silently lose these rules.
  {
    files: ['**/*.repository.ts'],
    rules: {
      'no-restricted-syntax': restrict(ALWAYS, CONNECTION_OWNERSHIP, ENV_ACCESS, REPOSITORY_SHAPE),
    },
  },

  // A NestJS module class is a decorator carrier — an empty body is the
  // framework's idiom, not a code smell. Filters and interceptors log
  // structured JSON to stdout by design (ECS ships stdout to CloudWatch).
  {
    files: ['**/*.module.ts', 'src/common/*.filter.ts', 'src/common/*.interceptor.ts'],
    rules: {
      '@typescript-eslint/no-extraneous-class': 'off',
      'no-console': 'off',
    },
  },

  // NestJS modules and Drizzle migration files legitimately default-export.
  {
    files: ['**/*.module.ts', 'src/db/**/migrations/**/*.ts', '*.config.ts'],
    rules: { 'import-x/no-default-export': 'off' },
  },

  // This file configures the linter; type-aware rules on it produce noise about
  // plugin packages that ship no types, not signal. Syntax rules still apply.
  {
    files: ['eslint.config.mjs'],
    extends: [tseslint.configs.disableTypeChecked],
    rules: {
      'import-x/no-default-export': 'off',
      'import-x/no-named-as-default-member': 'off',
      'import-x/no-named-as-default': 'off',
    },
  },

  // Tests may reach for shapes that production code may not.
  {
    files: ['test/**/*.ts', '**/*.spec.ts', '**/*.e2e-spec.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
    },
  },

  prettier,
);
