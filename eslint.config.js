import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // reference/v1 is read-only prior art and is never linted (CLAUDE.md).
  { ignores: ['reference/**', 'dist/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['src/ui/**/*.{ts,tsx}', 'src/main.tsx'],
    ...reactHooks.configs.flat.recommended,
  },
  {
    // DD §15: the sim core is pure TypeScript with no React and no third-party
    // dependencies, so the Phase 31 headless harness runs on Node alone.
    // src/sim/architecture.test.ts is the authoritative check; this rule is
    // the fast in-editor version of it.
    files: ['src/sim/**/*.ts', 'src/content/**/*.ts', 'src/tuning.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-dom', 'react/*', 'react-dom/*', 'idb', '**/ui/**'],
              message: 'The sim core is React-free and dependency-free (DD §15).',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/**/*.test.ts'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // tools/ is the headless instrumentation (the Phase 21 audit's harness,
    // and the seed of Phase 31's): Node scripts that drive the sim core and,
    // in the Playwright passes, evaluate code inside a browser page. Linted
    // like the rest of the repo, with both sets of globals available.
    files: ['tools/**/*.{ts,mjs}'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  prettier,
);
