import shared from "@ame-de-fil/eslint-config";

export default [
  ...shared,
  {
    rules: {
      // Nest's DI relies on parameter-property constructors and decorated
      // classes with no explicit usage the linter can trace.
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-extraneous-class": "off",
    },
  },
  {
    ignores: ["dist/**"],
  },
];
