import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    files: ['**/*.js'],
    ignores: ['tests/**', 'jest.config.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'script',
      globals: {
        ...globals.browser,
        ...globals.webextensions,
        chrome: 'readonly',
        module: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^(e|err|error|_)$' }],
      'no-undef': 'error',
      'no-console': 'off',
      'semi': ['error', 'always'],
      'quotes': ['warn', 'single', { avoidEscape: true }],
    },
  },
  {
    files: ['tests/**/*.js', 'jest.config.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'commonjs',
      globals: {
        ...globals.jest,
        ...globals.node,
        ...globals.browser,
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^(e|err|error|_)$' }],
      'no-undef': 'error',
      'no-console': 'off',
      'semi': ['error', 'always'],
      'quotes': ['warn', 'single', { avoidEscape: true }],
    },
  },
];
