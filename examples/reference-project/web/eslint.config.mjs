// @ts-check
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';
import importX from 'eslint-plugin-import-x';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import sonarjs from 'eslint-plugin-sonarjs';
import tseslint from 'typescript-eslint';

import loadingBeforeEmpty from './eslint-rules/loading-before-empty.js';
import urlStateForView from './eslint-rules/url-state-for-view.js';

/**
 * the reference project web ESLint config.
 *
 * The `no-restricted-*` blocks encode architectural invariants from CLAUDE.md.
 * Read the doc a rule cites before relaxing it.
 */

/**
 * Design-system enforcement. The component library in src/components/ui is the
 * only source of UI primitives; a raw <button> or a hex colour in a feature is
 * how a design system fragments one screen at a time.
 */
const DESIGN_SYSTEM = [
  {
    selector: "JSXOpeningElement[name.name='button']",
    message:
      'Use <Button> from @/components/ui. A raw <button> misses the variant scale, focus ring, and disabled handling. See docs/ui.md.',
  },
  {
    // The product ships ONE appearance — the prototype's. A dark: variant is
    // a second design nobody drew, and it makes screenshots and support
    // conversations stop matching what the user sees. See docs/ui.md.
    // Scoped to JSX attribute values, so the rule does not match its own
    // message text (or any prose that mentions the variant).
    selector: 'JSXAttribute[name.name=/^(className|class)$/] Literal[value=/(^|\\s)dark:/]',
    message:
      'No dark: variants. The app is single-theme by design — see docs/ui.md. Use the tokens in src/styles/index.css.',
  },
  {
    selector:
      'JSXAttribute[name.name=/^(className|class)$/] TemplateElement[value.raw=/(^|\\s)dark:/]',
    message: 'No dark: variants. The app is single-theme by design — see docs/ui.md.',
  },
  {
    selector: "JSXOpeningElement[name.name='dialog']",
    message: 'Use <Modal> from @/components/ui — it owns focus trapping and the backdrop.',
  },
  {
    // `Select` was retired when every dropdown in the product became a
    // Combobox, and a second control shape on the same form is exactly what
    // that retirement was for. The rule lived only in a file comment until a
    // native select reached the Import Formats grid — so it is enforced here
    // now, where forgetting is not an option.
    selector: "JSXOpeningElement[name.name='select']",
    message:
      'Use <Combobox> from @/components/ui. A native <select> is a second dropdown shape — see docs/ui.md.',
  },
  {
    selector: 'Literal[value=/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/]',
    message:
      'No hard-coded colours. Use a design token (bg-card, text-ink, border-line) from src/styles/index.css — a hex in a component is where theming stops working.',
  },
  {
    selector: 'TemplateElement[value.raw=/#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\\b/]',
    message: 'No hard-coded colours. Use a design token from src/styles/index.css. See docs/ui.md.',
  },
];

/**
 * Shared by the base config and the `src/app` override, which has to restate
 * the whole option object to add one entry — ESLint replaces these rather than
 * merging them.
 */
const RESTRICTED_IMPORTS = {
  paths: [
    {
      name: 'axios',
      message:
        'Use the generated client in src/api — hand-rolled calls drift from the server contract. See docs/api-client.md.',
    },
  ],
  patterns: [
    {
      group: ['../../*'],
      message: 'Use the @/ alias instead of climbing out of a directory twice.',
    },
  ],
};

const ARCHITECTURE = [
  {
    selector:
      "CallExpression[callee.name='useEffect'] CallExpression[callee.name=/^(fetch|axios)$/]",
    message:
      'Fetching in useEffect reintroduces the race conditions, missing cache, and duplicated loading state that TanStack Query exists to remove. See docs/api-client.md.',
  },
  {
    selector: "MemberExpression[object.name='localStorage'][property.name='setItem']",
    message:
      'Tenant and auth context come from the subdomain and the JWT, never from client-writable storage. See docs/architecture.md.',
  },
  {
    selector:
      "CallExpression[callee.property.name='getFullYear'][callee.object.type='NewExpression']",
    message:
      'Tenant timezones differ from the browser. Format dates through src/lib/datetime with the tenant timezone. See docs/conventions.md.',
  },
];

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'eslint-rules/**',
      'node_modules/**',
      'graphify-out/**',
      'coverage/**',
      'src/api/generated/**', // generated from openapi.json; not hand-maintained
      // Verification scripts, run by hand against a live stack. Outside
      // tsconfig by design — they are not part of the bundle, and the project
      // service cannot type them without pulling them into the app's program.
      'scripts/**',
      '**/*.js',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  importX.flatConfigs.recommended,
  importX.flatConfigs.typescript,
  jsxA11y.flatConfigs.recommended,

  {
    plugins: {
      sonarjs,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      // Local rules that encode this codebase's own bugs. See eslint-rules/.
      ez: {
        rules: {
          'loading-before-empty': loadingBeforeEmpty,
          'url-state-for-view': urlStateForView,
        },
      },
    },
    languageOptions: {
      parserOptions: {
        // This config file is not in tsconfig's include; allowDefaultProject
        // lets it be linted without a project reference.
        projectService: { allowDefaultProject: ['eslint.config.mjs'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    settings: {
      'import-x/resolver-next': [
        createTypeScriptImportResolver({ project: './tsconfig.json', alwaysTryTypes: true }),
      ],
    },
    rules: {
      // An empty state must never be reachable before a request finishes.
      // TanStack Query leaves `data` undefined while in flight, so an
      // emptiness check that runs first renders "no data" on every load.
      // Documented repeatedly and still written wrong — hence a lint error.
      'ez/loading-before-empty': 'error',

      // Pagination, filters, search, sort, and tabs belong in the URL. Held in
      // useState the view cannot be shared, reload resets it, and the back
      // button leaves the page instead of undoing the last change.
      'ez/url-state-for-view': 'error',

      'no-restricted-syntax': ['error', ...ARCHITECTURE, ...DESIGN_SYSTEM],

      'no-restricted-imports': ['error', RESTRICTED_IMPORTS],

      // --- Type safety ------------------------------------------------------
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],

      // --- React ------------------------------------------------------------
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // --- Structure --------------------------------------------------------
      'import-x/no-cycle': ['error', { maxDepth: 6 }],
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
      'max-lines': ['error', { max: 250, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['error', { max: 50, skipBlankLines: true, skipComments: true }],
      'max-params': ['error', 4],
      'max-depth': ['error', 4],
      complexity: ['error', 12],
    },
  },

  // Components are tighter than modules: a 150-line component is usually three
  // components. The function limit is raised because a component IS a function
  // and JSX is verbose — the file limit is what does the real work here.
  {
    files: ['src/**/*.tsx'],
    rules: {
      'max-lines': ['error', { max: 150, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['error', { max: 120, skipBlankLines: true, skipComments: true }],
    },
  },

  {
    files: [
      'src/components/ui/**/*.tsx', // shadcn/ui: generated, then owned
      'eslint.config.mjs',
      '*.config.ts',
      '**/*.test.ts',
      '**/*.test.tsx',
    ],
    rules: {
      'max-lines': 'off',
      'max-lines-per-function': 'off',
      complexity: 'off',
    },
  },

  // The library DEFINES the primitives, so it cannot be required to use them —
  // <Button> is built from a real <button>, and the tokens that are not yet
  // expressible as Tailwind utilities (the ghost-variant border tints) are
  // written as hex here and nowhere else.
  // The URL-state hooks are the mechanism the rule points people at. They hold
  // the query string itself in a `search` variable, which the rule cannot
  // distinguish from view state — and should not have to.
  {
    files: ['src/hooks/use-url-state.ts', 'src/hooks/use-pagination.ts'],
    rules: { 'ez/url-state-for-view': 'off' },
  },
  /*
   * Route components are registered with `lazyPage`, never `React.lazy`.
   *
   * Both split the bundle identically, so a bare `lazy()` looks right and works
   * — and quietly loses the `preload` handle the sidebar uses to warm a chunk
   * on hover. Without it the click waits on the download with the PREVIOUS page
   * still on screen, because React Router navigates inside a transition and a
   * transition suppresses the Suspense fallback. `preload-route.test.ts` fails
   * on the same mistake; this catches it as it is typed.
   *
   * `page-chunk.ts` is the one place that may call it: it is the wrapper.
   */
  {
    files: ['src/app/**/*.ts', 'src/app/**/*.tsx'],
    ignores: ['src/app/page-chunk.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          ...RESTRICTED_IMPORTS,
          paths: [
            ...RESTRICTED_IMPORTS.paths,
            {
              name: 'react',
              importNames: ['lazy'],
              message:
                'Use lazyPage() from ./page-chunk — it keeps the .preload the sidebar warms on hover. See preload-route.ts.',
            },
          ],
        },
      ],
    },
  },


  {
    files: ['src/components/ui/**/*.tsx'],
    rules: {
      'no-restricted-syntax': ['error', ...ARCHITECTURE],
      'react-refresh/only-export-components': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
    },
  },
  /**
   * `downloadFile` is not a function you call from an onClick.
   *
   * It POSTs for a signed URL and only then navigates, so between the click and
   * anything happening there is a round trip with NOTHING on screen — and a
   * button that looks unpressed is a button people press again. Every screen
   * that did this had the defect; `useDownload` is where it is fixed once, with
   * a per-key pending flag and somewhere for the failure to go.
   *
   * The two exempt files are the ones that own the wait themselves.
   */
  {
    files: ['src/features/**/*.{ts,tsx}', 'src/components/**/*.{ts,tsx}'],
    ignores: [
      'src/features/_kit/use-download.ts',
      'src/features/_kit/use-listing-export.ts',
      // Both AWAIT the download inside a mutationFn, so `isPending` already
      // spans the wait and the button that reads it is already honest. That is
      // the same guarantee `useDownload` gives, arrived at a different way.
      'src/features/import/use-imports.ts',
      'src/features/agents/use-agent-imports.ts',
      'src/features/**/*.test.{ts,tsx}',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          ...RESTRICTED_IMPORTS,
          paths: [
            ...RESTRICTED_IMPORTS.paths,
            {
              name: '@/api/files',
              importNames: ['downloadFile'],
              message:
                'Use useDownload() from @/features/_kit/use-download — a bare downloadFile in an onClick gives the user no sign the click landed. See CLAUDE.md rule 55a.',
            },
          ],
        },
      ],
    },
  },


  // The PWA manifest names its own colours, and a browser reading a manifest
  // cannot resolve a CSS token. The no-hex rule exists to stop a component
  // hard-coding a colour that theming should own; this is the one place where
  // literal values are the only representation there is. Architecture rules
  // still apply.
  {
    files: ['vite.config.ts'],
    rules: {
      'no-restricted-syntax': ['error', ...ARCHITECTURE],
    },
  },

  // i18next's default export IS the instance and shares its name with a named
  // export; the warning is about a pattern that is correct here.
  {
    files: ['src/i18n/index.ts'],
    rules: {
      'import-x/no-named-as-default': 'off',
      'import-x/no-named-as-default-member': 'off',
    },
  },

  // This file configures the linter; type-aware rules on it produce noise about
  // plugin packages that ship no types, not signal. Syntax rules still apply.
  {
    files: ['eslint.config.mjs'],
    extends: [tseslint.configs.disableTypeChecked],
    rules: {
      'import-x/no-named-as-default-member': 'off',
      'import-x/no-named-as-default': 'off',
    },
  },

  {
    files: ['**/*.test.ts', '**/*.test.tsx', 'src/test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
    },
  },

  prettier,
);
