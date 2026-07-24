import { buildCssVariables } from "./cssVariables";

const STYLE_ID = "ai-sales-design-tokens";

const BASE_RESET = `
html, body, #root {
  height: 100%;
}
body {
  margin: 0;
  font-family: var(--ai-sales-font-base);
  font-size: var(--ai-sales-font-size-base);
  line-height: var(--ai-sales-line-height-base);
  color: var(--ai-sales-color-text-primary);
  background-color: var(--ai-sales-color-background-subtle);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
*, *::before, *::after {
  box-sizing: border-box;
}
a {
  color: var(--ai-sales-color-action-primary);
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
`;

/**
 * Injects `:root` CSS variables + a light base reset once per document.
 * Safe to call multiple times (idempotent).
 */
export function injectDesignTokens(doc: Document = document): void {
  if (doc.getElementById(STYLE_ID)) return;
  const styleTag = doc.createElement("style");
  styleTag.id = STYLE_ID;
  styleTag.textContent = `${buildCssVariables()}\n${BASE_RESET}`;
  doc.head.appendChild(styleTag);
}
