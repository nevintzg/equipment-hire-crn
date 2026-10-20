import js from '@eslint/js';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default [
  { ignores: ['node_modules/**', 'drizzle/**', 'coverage/**', 'dist/**'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    linterOptions: { reportUnusedDisableDirectives: true },
    rules: {
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      eqeqeq: ['error', 'smart'],
      'no-return-await': 'error',
      'prefer-const': 'error',
      'object-shorthand': ['error', 'properties'],
      curly: ['error', 'multi-line'],
    },
  },
  {
    files: ['src/db/seed.js', 'src/db/migrate.js', 'scripts/**/*.js'],
    rules: { 'no-console': 'off' },
  },
  {
    files: ['test/**/*.js', 'vitest.config.js'],
    languageOptions: { globals: { ...globals.node } },
    rules: { 'no-console': 'off' },
  },
  prettier,
];
