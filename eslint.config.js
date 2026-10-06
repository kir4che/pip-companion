const js = require("@eslint/js");
const globals = require("globals");

const floatingCommentsGlobals = {
  FLOATING_COMMENTS_BODY_CLASS: "readonly",
  toggleFloatingComments: "readonly",
  ensureFloatingCommentsButton: "readonly",
  ensureFloatingCommentsCloseButton: "readonly",
  updateFloatingCommentsDimensions: "readonly",
};

module.exports = [
  js.configs.recommended,
  {
    ignores: ["node_modules/**"],
  },
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: { ...globals.browser, chrome: "readonly" },
    },
    rules: {
      "no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  {
    files: ["content.js"],
    languageOptions: { globals: floatingCommentsGlobals },
  },
  {
    files: ["eslint.config.js"],
    languageOptions: { globals: { ...globals.commonjs } },
  },
];
