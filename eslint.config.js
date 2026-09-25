// ESLint flat config following GNOME Shell's upstream style
// (gnome-shell lint/eslintrc-gjs + eslintrc-shell), with formatting rules
// provided by @stylistic since ESLint 10 dropped them from core.

import js from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import globals from 'globals';

const gjsGlobals = {
    ARGV: 'readonly',
    Debugger: 'readonly',
    GIRepositoryGType: 'readonly',
    globalThis: 'readonly',
    imports: 'readonly',
    Intl: 'readonly',
    log: 'readonly',
    logError: 'readonly',
    print: 'readonly',
    printerr: 'readonly',
    TextEncoder: 'readonly',
    TextDecoder: 'readonly',
    console: 'readonly',
    setTimeout: 'readonly',
    setInterval: 'readonly',
    clearTimeout: 'readonly',
    clearInterval: 'readonly',
};

const shellGlobals = {
    global: 'readonly',
    _: 'readonly',
    C_: 'readonly',
    N_: 'readonly',
    ngettext: 'readonly',
};

const style = {
    '@stylistic/array-bracket-newline': ['error', 'consistent'],
    '@stylistic/array-bracket-spacing': ['error', 'never'],
    '@stylistic/arrow-parens': ['error', 'as-needed'],
    '@stylistic/arrow-spacing': 'error',
    '@stylistic/block-spacing': 'error',
    '@stylistic/brace-style': ['error', '1tbs', {allowSingleLine: true}],
    '@stylistic/comma-dangle': ['error', {
        arrays: 'always-multiline',
        objects: 'always-multiline',
        imports: 'always-multiline',
        exports: 'always-multiline',
        functions: 'never',
    }],
    '@stylistic/comma-spacing': ['error', {before: false, after: true}],
    '@stylistic/comma-style': ['error', 'last'],
    '@stylistic/computed-property-spacing': 'error',
    '@stylistic/dot-location': ['error', 'property'],
    '@stylistic/eol-last': 'error',
    '@stylistic/function-call-spacing': 'error',
    '@stylistic/indent': ['error', 4, {
        ignoredNodes: [
            // Allow not indenting the body of GObject.registerClass, since in the
            // future it's intended to be a decorator
            'CallExpression[callee.object.name=GObject][callee.property.name=registerClass] > ClassExpression:first-child',
        ],
        CallExpression: {arguments: 'first'},
        ArrayExpression: 'first',
        ObjectExpression: 'first',
        MemberExpression: 'off',
    }],
    '@stylistic/key-spacing': ['error', {beforeColon: false, afterColon: true}],
    '@stylistic/keyword-spacing': ['error', {before: true, after: true}],
    '@stylistic/linebreak-style': ['error', 'unix'],
    '@stylistic/lines-between-class-members': ['error', 'always', {exceptAfterSingleLine: true}],
    '@stylistic/max-statements-per-line': 'error',
    '@stylistic/new-parens': 'error',
    '@stylistic/no-extra-parens': ['error', 'functions'],
    '@stylistic/no-multi-spaces': 'error',
    '@stylistic/no-multiple-empty-lines': ['error', {max: 1}],
    '@stylistic/no-tabs': 'error',
    '@stylistic/no-trailing-spaces': 'error',
    '@stylistic/no-whitespace-before-property': 'error',
    '@stylistic/nonblock-statement-body-position': ['error', 'below'],
    '@stylistic/object-curly-newline': ['error', {consistent: true, multiline: true}],
    '@stylistic/object-curly-spacing': 'error',
    '@stylistic/operator-linebreak': 'error',
    '@stylistic/padded-blocks': ['error', 'never'],
    '@stylistic/quotes': ['error', 'single', {avoidEscape: true}],
    '@stylistic/rest-spread-spacing': 'error',
    '@stylistic/semi': ['error', 'always'],
    '@stylistic/semi-spacing': ['error', {before: false, after: true}],
    '@stylistic/semi-style': 'error',
    '@stylistic/space-before-blocks': 'error',
    '@stylistic/space-before-function-paren': ['error', {
        named: 'never',
        anonymous: 'always',
        asyncArrow: 'always',
    }],
    '@stylistic/space-in-parens': 'error',
    '@stylistic/space-infix-ops': ['error', {int32Hint: false}],
    '@stylistic/space-unary-ops': 'error',
    '@stylistic/spaced-comment': 'error',
    '@stylistic/template-curly-spacing': 'error',
    '@stylistic/template-tag-spacing': 'error',
    '@stylistic/wrap-iife': ['error', 'inside'],
    '@stylistic/yield-star-spacing': 'error',
};

const correctness = {
    'camelcase': ['error', {
        properties: 'never',
        allow: ['^vfunc_', '^on_'],
    }],
    'consistent-return': 'error',
    'curly': ['error', 'multi-or-nest', 'consistent'],
    'eqeqeq': 'error',
    'func-name-matching': 'error',
    'func-style': ['error', 'declaration', {allowArrowFunctions: true}],
    'max-nested-callbacks': ['error', 5],
    'no-array-constructor': 'error',
    'no-await-in-loop': 'error',
    'no-caller': 'error',
    'no-constant-condition': ['error', {checkLoops: false}],
    'no-div-regex': 'error',
    'no-empty': ['error', {allowEmptyCatch: true}],
    'no-extra-bind': 'error',
    'no-implicit-coercion': ['error', {allow: ['!!']}],
    'no-invalid-this': 'error',
    'no-iterator': 'error',
    'no-label-var': 'error',
    'no-lonely-if': 'error',
    'no-loop-func': 'error',
    'no-nested-ternary': 'error',
    'no-new-wrappers': 'error',
    'no-object-constructor': 'error',
    'no-octal-escape': 'error',
    'no-proto': 'error',
    'no-prototype-builtins': 'off',
    'no-restricted-globals': ['error', 'window'],
    'no-return-assign': 'error',
    'no-self-compare': 'error',
    'no-shadow-restricted-names': 'error',
    'no-template-curly-in-string': 'error',
    'no-throw-literal': 'error',
    'no-undef-init': 'error',
    'no-unneeded-ternary': 'error',
    'no-unused-expressions': 'error',
    'no-unused-vars': ['error', {
        // Vars use a suffix _ instead of a prefix because of file-scope private vars
        varsIgnorePattern: '(^unused|_$)',
        argsIgnorePattern: '^(unused|_)',
    }],
    'no-useless-call': 'error',
    'no-useless-computed-key': 'error',
    'no-useless-concat': 'error',
    'no-useless-constructor': 'error',
    'no-useless-rename': 'error',
    'no-useless-return': 'error',
    'no-with': 'error',
    'object-shorthand': 'error',
    'operator-assignment': 'error',
    'prefer-arrow-callback': 'error',
    'prefer-const': 'error',
    'prefer-numeric-literals': 'error',
    'prefer-promise-reject-errors': 'error',
    'prefer-rest-params': 'error',
    'prefer-spread': 'error',
    'prefer-template': 'error',
    'require-await': 'error',
    'symbol-description': 'error',
    'unicode-bom': 'error',
    'yoda': 'error',
};

export default [
    {
        ignores: [
            'reference-hangly/**',
            'node_modules/**',
            'dist/**',
            // Generated copy of core/ (linted at its source)
            'extension/core/**',
        ],
    },
    js.configs.recommended,
    {
        plugins: {'@stylistic': stylistic},
        languageOptions: {
            ecmaVersion: 2024,
            sourceType: 'module',
        },
        rules: {...style, ...correctness},
    },
    {
        // Pure physics: only ECMAScript built-ins, no host globals at all.
        files: ['core/**/*.js'],
        languageOptions: {globals: {...globals.es2024}},
    },
    {
        files: ['extension/**/*.js'],
        languageOptions: {globals: {...globals.es2024, ...gjsGlobals, ...shellGlobals}},
    },
    {
        files: ['tests/**/*.js', 'eslint.config.js', 'tools/**/*.js'],
        languageOptions: {globals: {...globals.es2024, ...globals.node}},
    },
];
