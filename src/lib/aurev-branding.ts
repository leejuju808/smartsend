/**
 * AUREV OS Branding System
 * Unified visual identity across SmartSend, OpsGrid, and AgentCloud
 */

// =====================================================
// Core Brand Colors
// =====================================================

export const AUREV_COLORS = {
  primary: "#FFD700", // Gold - Main brand color
  primaryDark: "#FFC700", // Darker gold for hover states
  primaryLight: "#FFF8DC", // Light gold for backgrounds
  
  accent: "#000000", // Onyx - Secondary accent
  accentLight: "#1a1a1a", // Lighter onyx for hover states
  
  background: {
    dark: "#000000",
    darkSecondary: "#111111",
    darkTertiary: "#1a1a1a",
  },
  
  text: {
    primary: "#FFFFFF",
    secondary: "#CCCCCC",
    muted: "#888888",
  },
  
  // Status colors
  success: "#10B981",
  warning: "#F59E0B",
  error: "#EF4444",
  info: "#3B82F6",
} as const;

// =====================================================
// Module-Specific Branding
// =====================================================

export const MODULE_BRANDING = {
  smartsend: {
    name: "SmartSend AI",
    icon: "⚡",
    description: "Intelligent outreach & lead engine",
    color: "#FFD700", // Gold
    gradient: "from-yellow-400 to-yellow-600",
    tagline: "Outreach, amplified.",
  },
  opsgrid: {
    name: "OpsGrid",
    icon: "🧩",
    description: "Automation workflows & operations",
    color: "#3B82F6", // Blue
    gradient: "from-blue-400 to-blue-600",
    tagline: "Workflow, simplified.",
  },
  agentcloud: {
    name: "AgentCloud",
    icon: "🤖",
    description: "AI agent marketplace & deployment",
    color: "#8B5CF6", // Purple
    gradient: "from-purple-400 to-purple-600",
    tagline: "Intelligence, distributed.",
  },
} as const;

// =====================================================
// Typography
// =====================================================

export const AUREV_TYPOGRAPHY = {
  fonts: {
    heading: "Inter, system-ui, sans-serif",
    body: "Inter, system-ui, sans-serif",
    mono: "Fira Code, monospace",
  },
  
  sizes: {
    xs: "0.75rem",    // 12px
    sm: "0.875rem",   // 14px
    base: "1rem",     // 16px
    lg: "1.125rem",   // 18px
    xl: "1.25rem",    // 20px
    "2xl": "1.5rem",  // 24px
    "3xl": "1.875rem", // 30px
    "4xl": "2.25rem",  // 36px
    "5xl": "3rem",     // 48px
  },
  
  weights: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
} as const;

// =====================================================
// Spacing & Layout
// =====================================================

export const AUREV_SPACING = {
  xs: "0.25rem",  // 4px
  sm: "0.5rem",   // 8px
  md: "1rem",     // 16px
  lg: "1.5rem",   // 24px
  xl: "2rem",     // 32px
  "2xl": "3rem",  // 48px
  "3xl": "4rem",  // 64px
} as const;

// =====================================================
// Shadows & Effects
// =====================================================

export const AUREV_SHADOWS = {
  sm: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
  md: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
  lg: "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
  xl: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
  glow: "0 0 20px rgba(255, 215, 0, 0.3)", // Gold glow
} as const;

// =====================================================
// Border Radius
// =====================================================

export const AUREV_RADIUS = {
  sm: "0.25rem",  // 4px
  md: "0.5rem",   // 8px
  lg: "0.75rem",  // 12px
  xl: "1rem",     // 16px
  full: "9999px",
} as const;

// =====================================================
// Animations
// =====================================================

export const AUREV_ANIMATIONS = {
  duration: {
    fast: "150ms",
    normal: "300ms",
    slow: "500ms",
  },
  
  easing: {
    easeIn: "cubic-bezier(0.4, 0, 1, 1)",
    easeOut: "cubic-bezier(0, 0, 0.2, 1)",
    easeInOut: "cubic-bezier(0.4, 0, 0.2, 1)",
  },
} as const;

// =====================================================
// Helper Functions
// =====================================================

/**
 * Get module-specific branding
 */
export function getModuleBranding(
  module: "smartsend" | "opsgrid" | "agentcloud"
) {
  return MODULE_BRANDING[module];
}

/**
 * Get brand gradient classes for Tailwind
 */
export function getBrandGradient(module?: "smartsend" | "opsgrid" | "agentcloud"): string {
  if (module && module in MODULE_BRANDING) {
    return MODULE_BRANDING[module].gradient;
  }
  return "from-yellow-400 to-yellow-600"; // Default AUREV gradient
}

/**
 * Get brand color by key
 */
export function getBrandColor(
  key: keyof typeof AUREV_COLORS
): string {
  return AUREV_COLORS[key] as string;
}

/**
 * Core brand tagline
 */
export const AUREV_TAGLINE = "The AI Operating System for Builders";

/**
 * Core brand mission
 */
export const AUREV_MISSION = 
  "Empowering SMBs with unified AI tools for growth, automation, and intelligence.";

// =====================================================
// Tailwind Config Overrides (for reference)
// =====================================================

export const TAILWIND_OVERRIDES = {
  colors: {
    aurev: {
      primary: AUREV_COLORS.primary,
      primaryDark: AUREV_COLORS.primaryDark,
      primaryLight: AUREV_COLORS.primaryLight,
      accent: AUREV_COLORS.accent,
      accentLight: AUREV_COLORS.accentLight,
    },
    modules: {
      smartsend: MODULE_BRANDING.smartsend.color,
      opsgrid: MODULE_BRANDING.opsgrid.color,
      agentcloud: MODULE_BRANDING.agentcloud.color,
    },
  },
} as const;

