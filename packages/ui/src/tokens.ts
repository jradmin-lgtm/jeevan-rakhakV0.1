/**
 * Design tokens for Jeevan Rakshak.
 * Tuned for high-contrast emergency UI on low-end Android (no gradients, flat colors).
 */
export const colors = {
  primary: "#E5322B",        // emergency red
  primaryDark: "#B92520",
  primaryFaint: "#FCE9E8",
  accent: "#1E5EFF",
  success: "#10B981",
  warning: "#F59E0B",
  danger: "#DC2626",

  bg: "#F7F8FB",
  surface: "#FFFFFF",
  card: "#FFFFFF",
  border: "#E5E7EB",
  borderStrong: "#CBD5E1",

  textPrimary: "#0F172A",
  textSecondary: "#475569",
  textMuted: "#94A3B8",
  textInverse: "#FFFFFF",

  // Status pills
  statusRequested: "#F59E0B",
  statusAccepted: "#3B82F6",
  statusArrived: "#8B5CF6",
  statusPickedUp: "#06B6D4",
  statusCompleted: "#10B981",
  statusCancelled: "#94A3B8",
  statusTimedOut: "#94A3B8"
};

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32
};

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  pill: 999
};

export const font = {
  // System fonts only — no custom font loading on cold start = faster TTI on low RAM.
  sizeXs: 11,
  sizeSm: 13,
  sizeMd: 15,
  sizeLg: 18,
  sizeXl: 22,
  sizeXxl: 28,
  weightRegular: "400" as const,
  weightMedium: "500" as const,
  weightSemi: "600" as const,
  weightBold: "700" as const
};

export const shadow = {
  // Single-elevation, no large shadows (cheap to draw).
  card: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2
  },
  pop: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4
  }
};

export const animation = {
  fast: 160,
  normal: 240,
  slow: 380
};
