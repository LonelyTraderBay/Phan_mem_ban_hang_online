/**
 * PROVISIONAL — placeholder palette pending brand/Figma handoff (spec 7.7).
 * Swap values here only when real brand tokens arrive — no consumer code should change,
 * since every consumer references semantic names (e.g. `action.primary`), never raw hex values.
 */

export const color = {
  background: {
    base: "#FFFFFF",
    subtle: "#F8FAFC",
    muted: "#F1F5F9",
  },
  surface: {
    base: "#FFFFFF",
    raised: "#FFFFFF",
    overlay: "rgba(15, 23, 42, 0.48)",
  },
  text: {
    primary: "#0F172A",
    secondary: "#475569",
    muted: "#94A3B8",
    inverse: "#FFFFFF",
    disabled: "#CBD5E1",
  },
  border: {
    default: "#E2E8F0",
    strong: "#CBD5E1",
    focus: "#2563EB",
  },
  action: {
    primary: "#2563EB",
    primaryHover: "#1D4ED8",
    primaryActive: "#1E40AF",
    secondary: "#475569",
    secondaryHover: "#334155",
  },
  focus: {
    ring: "#2563EB",
    ringOffset: "#FFFFFF",
  },
  success: { base: "#16A34A", subtle: "#F0FDF4", text: "#166534" },
  warning: { base: "#D97706", subtle: "#FFFBEB", text: "#92400E" },
  danger: { base: "#DC2626", subtle: "#FEF2F2", text: "#991B1B" },
  info: { base: "#0284C7", subtle: "#F0F9FF", text: "#075985" },
} as const;

export const typography = {
  fontFamily: {
    base: '"Inter", "Segoe UI", system-ui, sans-serif',
    mono: '"JetBrains Mono", "Consolas", monospace',
  },
  fontSize: {
    xs: "12px",
    sm: "13px",
    base: "14px",
    md: "16px",
    lg: "18px",
    xl: "20px",
    "2xl": "24px",
    "3xl": "30px",
  },
  fontWeight: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
  lineHeight: {
    tight: 1.25,
    base: 1.5,
    relaxed: 1.75,
  },
  letterSpacing: {
    tight: "-0.01em",
    base: "0",
    wide: "0.02em",
  },
} as const;

// 4px grid (spec 7.1).
export const spacing = {
  0: "0px",
  1: "4px",
  2: "8px",
  3: "12px",
  4: "16px",
  5: "20px",
  6: "24px",
  8: "32px",
  10: "40px",
  12: "48px",
  16: "64px",
} as const;

export const radius = {
  sm: "4px",
  md: "6px",
  lg: "8px",
  full: "9999px",
} as const;

export const shadow = {
  sm: "0 1px 2px rgba(15,23,42,0.06)",
  md: "0 4px 6px rgba(15,23,42,0.10)",
  lg: "0 10px 15px rgba(15,23,42,0.12)",
} as const;

export const zIndex = {
  dropdown: 1000,
  sticky: 1100,
  overlay: 1200,
  modal: 1300,
  popover: 1400,
  toast: 1500,
  tooltip: 1600,
} as const;

export const motion = {
  durationFast: "100ms",
  durationBase: "200ms",
  durationSlow: "300ms",
  easingStandard: "cubic-bezier(0.4, 0, 0.2, 1)",
  easingDecelerate: "cubic-bezier(0, 0, 0.2, 1)",
} as const;

// Aligned to spec 7.3's supported viewport table.
export const breakpoint = {
  minSupported: "1280px",
  standard: "1440px",
  large: "1920px",
  windowsCompact: "1024px",
} as const;

export const density = {
  comfortable: { rowHeight: "40px", padding: "12px" },
  compact: { rowHeight: "32px", padding: "8px" },
} as const;
