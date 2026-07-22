import baseConfig from "@ai-sales/eslint-config";

export default [
  ...baseConfig,
  // Generated code is exempt from most style rules — it is never hand-edited.
  { files: ["src/generated/**"], rules: { "@typescript-eslint/no-explicit-any": "off", "@typescript-eslint/consistent-type-imports": "off" } },
];
