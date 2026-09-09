import shared from "@ame-de-fil/eslint-config";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  ...shared,
  {
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },
];
