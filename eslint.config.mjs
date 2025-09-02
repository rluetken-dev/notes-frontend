import js from '@eslint/js';
import globals from 'globals';

export default [
  // Ignore build dirs
  { ignores: ['node_modules/**', 'dist/**', 'build/**'] },

  // Base rules
  js.configs.recommended,

  // Project config
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'script',
      // <- Browser-Umgebung: liefert setTimeout, window, document, etc.
      globals: {
        ...globals.browser,
        // falls du später Node-Skripte hast, ergänze:
        // ...globals.node,
      },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': 'warn',
      eqeqeq: 'warn',
      'no-console': 'off',
    },
  },
];
