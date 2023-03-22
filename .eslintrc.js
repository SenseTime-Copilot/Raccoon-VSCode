module.exports = {
    "env": {
        "browser": true,
        "es6": true,
        "node": true,
        "commonjs": true
    },
    "parserOptions": {
        "project": ["tsconfig.json"],
        "sourceType": "module",
        "ecmaVersion": 2015
    },
    "parser": "@typescript-eslint/parser",
    "plugins": [
        "@typescript-eslint"
    ],
    "ignorePatterns": [".eslintrc.js", "**/toolkit.js"],
    "root": true,
    "rules": {
        "@typescript-eslint/member-delimiter-style": [
            "warn",
            {
                "multiline": {
                    "delimiter": "semi",
                    "requireLast": true
                },
                "singleline": {
                    "delimiter": "semi",
                    "requireLast": false
                }
            }
        ],
        "@typescript-eslint/naming-convention": "warn",
        "@typescript-eslint/no-unused-expressions": "warn",
        "@typescript-eslint/no-shadow": "warn",
        "@typescript-eslint/semi": [
            "warn",
            "always"
        ],
        "curly": "warn",
        "eqeqeq": [
            "warn",
            "always"
        ],
        "indent": ["warn", 2, { "SwitchCase": 1 }],
        "linebreak-style": ["warn", "unix"],
        "max-statements-per-line": ["warn", { "max": 1 }],
        "no-redeclare": "warn",
        "no-throw-literal": "warn",
        "no-unused-expressions": "warn",
        "semi": "warn",
        "no-multiple-empty-lines": ["warn", { "max": 1 }],
        "lines-between-class-members": ["warn", "always", { "exceptAfterSingleLine": true }],
        "no-useless-return": "warn",
        "no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }],
        "no-buffer-constructor": "warn",
        "block-spacing": "warn",
        "brace-style": ["warn", "1tbs", { "allowSingleLine": true }]
    },
};
