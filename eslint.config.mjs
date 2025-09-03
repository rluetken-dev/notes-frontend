// eslint.config.mjs
// Flat config for a browser-based ESM app

export default [
  {
    files: ['**/*.js'],
    ignores: ['node_modules/**', 'dist/**', 'build/**'],

    // ---- Parser / language options ----
    languageOptions: {
      ecmaVersion: 'latest', // allow modern syntax
      sourceType: 'module', // <-- treat all .js as ES modules
      globals: {
        // Expose common browser globals as read-only
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        localStorage: 'readonly',
        setTimeout: 'readonly',
        crypto: 'readonly',
      },
    },

    // ---- Rules (keep it minimal; Prettier can come on top) ----
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
];
