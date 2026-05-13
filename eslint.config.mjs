// @ts-check

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

const sharedGlobals = {
  Blob: 'readonly',
  Buffer: 'readonly',
  clearInterval: 'readonly',
  clearTimeout: 'readonly',
  console: 'readonly',
  document: 'readonly',
  fetch: 'readonly',
  FileReader: 'readonly',
  FormData: 'readonly',
  MessageChannel: 'readonly',
  module: 'readonly',
  MutationObserver: 'readonly',
  performance: 'readonly',
  process: 'readonly',
  requestAnimationFrame: 'readonly',
  self: 'readonly',
  setInterval: 'readonly',
  setTimeout: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  window: 'readonly',
  XMLHttpRequest: 'readonly',
};

const eslintConfig = [
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    ignores: [
      'src/custom-types.d.ts',
      'node_modules/**',
      '.next/**',
      '**/dist/**',
      'out/**',
      '**/out/**',
      'coverage/**',
      'public/**'
    ]
  },
  {
    files: ['**/*.{js,jsx,mjs,cjs,ts,tsx}'],
    languageOptions: {
      globals: sharedGlobals,
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
    },
    rules: {
      'react-hooks/exhaustive-deps': 'off',
      '@typescript-eslint/no-unused-vars': 'error',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      'react/no-unescaped-entities': 'off',
      '@typescript-eslint/no-empty-function': 'warn'
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
  },
];

export default eslintConfig;
