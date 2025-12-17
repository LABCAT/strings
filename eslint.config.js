import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      // Modern JavaScript rules
      'prefer-const': 'error',
      'no-var': 'error',
      'prefer-arrow-callback': 'error',
      'arrow-spacing': 'error',
      'no-duplicate-imports': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      
      // Code quality
      'eqeqeq': 'error',
      'curly': 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-script-url': 'error',
      
      // Spacing and formatting
      'indent': ['error', 2],
      'quotes': ['error', 'single'],
      'semi': ['error', 'always'],
      'comma-dangle': ['error', 'always-multiline'],
      'object-curly-spacing': ['error', 'always'],
      'array-bracket-spacing': ['error', 'never'],
      
      // Astro-specific rules
      'astro/no-conflict-set-directives': 'error',
      'astro/no-unused-define-vars-in-style': 'error',
    },
  },
  {
    files: ['**/*.astro'],
    languageOptions: {
      globals: {
        ...globals.browser,
        Astro: 'readonly',
      },
    },
  },
];