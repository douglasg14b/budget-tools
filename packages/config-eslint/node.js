const { resolve } = require('node:path');

const project = resolve(process.cwd(), 'tsconfig.json');

module.exports = {
    parser: '@typescript-eslint/parser',
    env: {
        node: true,
        es2021: true,
    },
    overrides: [
        {
            files: ['*.ts', '*.tsx'],
            extends: [
                'eslint:recommended',
                'plugin:@typescript-eslint/strict-type-checked',
                'plugin:import/recommended',
                'plugin:import/typescript',
                'prettier', // Turns off rules that conflict with prettier
            ],
            plugins: ['import', '@typescript-eslint', 'simple-import-sort'],
            parserOptions: {
                ecmaVersion: 'latest',
                sourceType: 'module',
                projectService: true,
                project,
                tsconfigRootDir: process.cwd(),
            },
            settings: {
                'import/parsers': {
                    '@typescript-eslint/parser': ['.ts', '.js'],
                },
                'import/resolver': {
                    typescript: {
                        project,
                    },
                    node: {
                        project,
                    },
                },
            },
            rules: {
                'simple-import-sort/imports': 'warn',
                'simple-import-sort/exports': 'warn',
                '@typescript-eslint/naming-convention': [
                    'warn',
                    {
                        // Default applied to everything
                        selector: ['default'],
                        format: ['strictCamelCase', 'StrictPascalCase'],
                    },
                    {
                        // Allow all naming conventions for properties
                        selector: ['objectLiteralProperty', 'objectLiteralMethod', 'typeProperty'],
                        format: ['UPPER_CASE', 'strictCamelCase', 'StrictPascalCase', 'snake_case'],
                    },
                    {
                        // Allow leading underscores for private class members
                        selector: ['memberLike'],
                        modifiers: ['private'],
                        format: ['strictCamelCase'],
                        leadingUnderscore: 'allow',
                    },
                    {
                        // Unused parameters can (and should) have leading underscores
                        selector: ['parameter'],
                        modifiers: ['unused'],
                        format: ['strictCamelCase'],
                        leadingUnderscore: 'allow',
                    },
                    {
                        // Any globally declared variables, normal style
                        selector: ['variable'],
                        modifiers: ['const', 'global'],
                        format: ['UPPER_CASE', 'strictCamelCase', 'StrictPascalCase'],
                    },
                    {
                        // Any globally declared variables that are exported, CONST_CASE
                        selector: ['variable'],
                        modifiers: ['const', 'global', 'exported'],
                        types: ['string', 'number', 'boolean'],
                        format: ['UPPER_CASE'],
                    },
                    {
                        // All types should be Pascal
                        selector: ['typeLike'],
                        format: ['StrictPascalCase'],
                    },
                    {
                        // Type parameters should be Pascal and prefixed with T ie. function<TData>
                        selector: ['typeParameter'],
                        format: ['PascalCase'],
                        prefix: ['T'],
                    },
                    {
                        // Ignore destructuring
                        selector: ['variable'],
                        modifiers: ['destructured'],
                        format: null,
                    },
                    {
                        // Function params should be camel cased
                        selector: ['parameter'],
                        format: ['strictCamelCase'],
                    },
                    {
                        // Ignore discards
                        selector: ['parameter', 'variableLike', 'memberLike'],
                        format: null,
                        filter: {
                            regex: '^_',
                            match: true,
                        },
                    },
                    {
                        // Ignore all keys that require quotes as object keys
                        selector: [
                            'classProperty',
                            'objectLiteralProperty',
                            'typeProperty',
                            'classMethod',
                            'objectLiteralMethod',
                            'typeMethod',
                            'accessor',
                            'enumMember',
                        ],
                        format: null,
                        modifiers: ['requiresQuotes'],
                    },
                    {
                        // Ignore specific exceptions
                        selector: ['variable'],
                        format: null,
                        filter: {
                            regex: '^(__filename|__dirname)$',
                            match: true,
                        },
                    },
                    // If:
                    // - It starts with two uppercase letters
                    // - It has a lowercase letter after the second uppercase letter
                    // - It is a property
                    // Then: Pass if it is PascalCase
                    {
                        selector: ['objectLiteralProperty', 'objectLiteralMethod', 'typeProperty'],
                        format: ['PascalCase'],
                        filter: {
                            regex: '^[A-Z]{2}[a-z].*',
                            match: true,
                        },
                    },
                    // If:
                    // - It starts with two uppercase letters
                    // - It has a lowercase letter after the second uppercase letter
                    // - It is a const
                    // - It is global
                    // Then: Pass if it is PascalCase
                    {
                        selector: ['variable'],
                        modifiers: ['const', 'global'],
                        format: ['PascalCase'],
                        filter: {
                            regex: '^[A-Z]{2}[a-z].*',
                            match: true,
                        },
                    },
                ],
                '@typescript-eslint/consistent-type-imports': ['warn', { prefer: 'type-imports' }],
                '@typescript-eslint/restrict-template-expressions': [
                    'error',
                    { allowBoolean: true, allowNumber: true, allowNullish: true },
                ],
                '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
                'import/consistent-type-specifier-style': ['warn', 'prefer-top-level'],
                'import/no-unresolved': 'off',
                eqeqeq: ['error', 'smart'],
                '@typescript-eslint/switch-exhaustiveness-check': 'error',
            },
        },
    ],

    ignorePatterns: ['.eslintrc.js', 'esbuild.mjs', '.eslintrc.cjs', 'dist', 'node_modules'],
};
