import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      'dist',
      'dist-*',
      'dev-dist',
      'coverage',
      'node_modules',
      '.tools',
      '.venv',
      'source',
      'research',
      'docs',
      'tools',
      'playwright-report',
      'test-results',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    extends: [reactHooks.configs.flat['recommended-latest'], jsxA11y.flatConfigs.recommended],
    plugins: { 'react-refresh': reactRefresh },
    rules: {
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    files: ['*.{js,ts,mjs}', 'scripts/**/*.{js,ts,mjs}', 'tests/**/*.ts', 'server/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    // The rules engine stays pure: no React, DOM storage, UI, or storage imports.
    files: ['src/engine/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'react', message: 'src/engine must not import React.' },
            { name: 'react-dom', message: 'src/engine must not import React DOM.' },
            { name: 'idb-keyval', message: 'src/engine must not import storage.' },
          ],
          patterns: [
            {
              group: ['react/*', 'react-dom/*', 'idb-keyval/*'],
              message: 'src/engine must not import React or storage.',
            },
            {
              regex: '(^|/)(ui|storage)(/|$)',
              message: 'src/engine must not import from src/ui or src/storage.',
            },
          ],
        },
      ],
    },
  },
  prettier,
);
