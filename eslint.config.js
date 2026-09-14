import js from '@eslint/js';
import ts from 'typescript-eslint';
export default ts.config(
  {
    ignores: [
      'node_modules/**',
      '.wxt/**',
      '.output*/**',
      'research/**',
      'test-results/**',
      'playwright-report/**',
    ],
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    files: ['**/*.{ts,tsx,js,mjs}'],
    languageOptions: {
      globals: {
        fetch: 'readonly',
        history: 'readonly',
        DOMParser: 'readonly',
        console: 'readonly',
        process: 'readonly',
        chrome: 'readonly',
        document: 'readonly',
        window: 'readonly',
        URL: 'readonly',
        setTimeout: 'readonly',
      },
    },
    rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }] },
  },
);
