import { color, typography, spacing, radius, shadow, zIndex, motion, breakpoint } from "./tokens";

type TokenGroup = Record<string, unknown>;

function flatten(prefix: string, group: TokenGroup, out: Record<string, string>): void {
  for (const [key, value] of Object.entries(group)) {
    const varName = `${prefix}-${key}`;
    if (typeof value === "object" && value !== null) {
      flatten(varName, value as TokenGroup, out);
    } else {
      out[varName] = String(value);
    }
  }
}

/**
 * Builds a `:root { --ai-sales-*: value; }` CSS string from the token source of truth,
 * so Storybook and every app share exactly one place values are defined (spec 7.1).
 */
export function buildCssVariables(): string {
  const vars: Record<string, string> = {};
  flatten("--ai-sales-color", color, vars);
  flatten("--ai-sales-font", typography.fontFamily as unknown as TokenGroup, vars);
  flatten("--ai-sales-font-size", typography.fontSize as unknown as TokenGroup, vars);
  flatten("--ai-sales-font-weight", typography.fontWeight as unknown as TokenGroup, vars);
  flatten("--ai-sales-line-height", typography.lineHeight as unknown as TokenGroup, vars);
  flatten("--ai-sales-letter-spacing", typography.letterSpacing as unknown as TokenGroup, vars);
  flatten("--ai-sales-spacing", spacing as unknown as TokenGroup, vars);
  flatten("--ai-sales-radius", radius, vars);
  flatten("--ai-sales-shadow", shadow, vars);
  flatten("--ai-sales-z", zIndex as unknown as TokenGroup, vars);
  flatten("--ai-sales-motion", motion, vars);
  flatten("--ai-sales-breakpoint", breakpoint, vars);

  const lines = Object.entries(vars)
    .map(([name, value]) => `  ${name}: ${value};`)
    .join("\n");

  return `:root {\n${lines}\n}\n`;
}
