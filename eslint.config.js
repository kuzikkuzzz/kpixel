import js from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import importX from 'eslint-plugin-import-x';
import globals from 'globals';
import babelParser from '@babel/eslint-parser';

export default [
  {
    ignores: ['dist/', 'node_modules/'],
  },

  js.configs.recommended,
  react.configs.flat.recommended,
  react.configs.flat['jsx-runtime'],
  reactHooks.configs.flat.recommended,
  jsxA11y.flatConfigs.recommended,
  stylistic.configs.customize({
    indent: 2,
    quotes: 'single',
    semi: true,
    jsx: true,
    braceStyle: '1tbs',
  }),

  {
    files: ['**/*.{js,jsx,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parser: babelParser,  // Use the imported object, not a string
      parserOptions: {
        babelOptions: {
          rootMode: "upward",
        },
        ecmaFeatures: {
          jsx: true,
        }
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        __DEV__: false,
      }
    },

    plugins: {
      'import-x': importX,
    },

    rules: {
      'no-shadow': 'error',
      'eqeqeq': ['error', 'always', { null: 'always' }],
      'max-len': [1, 80, 2, { ignoreComments: true }],
      'no-await-in-loop': 'error',
      '@stylistic/arrow-parens': ['error', 'always', { requireForBlockBody: true }],
      '@stylistic/no-multiple-empty-lines': 'off',
      '@stylistic/multiline-ternary': 'off',
      '@stylistic/quote-props': 'off',
      '@stylistic/jsx-one-expression-per-line': 'off',
      '@stylistic/jsx-closing-tag-location': 'off',
      '@stylistic/jsx-closing-bracket-location': 'off',
      'react/prop-types': 'off',
      'jsx-a11y/click-events-have-key-events': 'off',
      'jsx-a11y/no-static-element-interactions': 'off',
      'jsx-a11y/control-has-associated-label': 'off',
      'jsx-a11y/label-has-associated-control': 'off',

      "function-paren-newline": "off",
      "function-call-argument-newline": "off",
      "no-underscore-dangle": "warn",
      'camelcase': 'error',
      "class-methods-use-this": "error",
      "object-property-newline": "off",
      "no-restricted-syntax": "off",
      "lines-between-class-members": ["warn", "always", { exceptAfterSingleLine: true }],
    },

    settings: {
      react: {
        version: "detect"
      },
      "import-x/extensions": [".js", ".jsx"],
      "import-x/resolver": {
        node: true,
      }
    }
  }
];
