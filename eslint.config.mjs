// eslint.config.mjs — furjs (2026)
// Zero deps philosophy: only TS + Canvas, lint enforces production level (0 errors)
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  ...tseslint.configs.stylistic,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { projectService: false },
    },
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/consistent-type-definitions': 'off',
      'prefer-const': 'warn',
      'eqeqeq': ['warn', 'always'],
      'no-throw-literal': 'warn',
      '@typescript-eslint/prefer-for-of': 'off',
      'no-empty': 'off',
      'prefer-const': 'off',
    },
  },
  {
    files: ['bin/**/*.mjs'],
    rules: { '@typescript-eslint/no-unused-vars': 'off', 'no-console': 'off' },
  }
);
