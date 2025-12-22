/**
 * SmartSend Color System
 * Roofing-friendly, professional, trustworthy palette
 */

export const colors = {
  // Primary Colors
  primary: "#1A73E8", // SmartSend Blue
  primaryHover: "#1557B0",
  primaryLight: "#E8F0FE",
  
  // Status Colors
  success: "#4CAF50",
  successLight: "#E8F5E9",
  warning: "#FFC107",
  warningLight: "#FFF8E1",
  danger: "#E53935",
  dangerLight: "#FFEBEE",
  
  // Neutral Colors
  neutral: "#9E9E9E",
  neutralLight: "#F5F5F5",
  ink: "#222222",
  inkSecondary: "#5F6368",
  
  // Background Colors
  panelBg: "#F8FAFC",
  white: "#FFFFFF",
  divider: "#ECEFF1",
  
  // Intent Colors (Lead Badges)
  intent: {
    hot: "#E53935", // Red
    warm: "#FFB300", // Amber
    followUp: "#1A73E8", // Blue
    dead: "#9E9E9E", // Gray
  },
  
  // Intent Background Colors
  intentBg: {
    hot: "#FFEBEE",
    warm: "#FFF8E1",
    followUp: "#E8F0FE",
    dead: "#F5F5F5",
  },
  
  // Action Button Colors
  actions: {
    call: "#4CAF50", // Green
    estimate: "#1A73E8", // Blue
    booked: "#9C27B0", // Purple
    task: "#9E9E9E", // Gray/Neutral
    crm: "#FFB300", // Gold/Amber
  },
} as const;

export type ColorKey = keyof typeof colors;
export type IntentType = keyof typeof colors.intent;



















































