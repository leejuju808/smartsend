"use client";

import { useState, useEffect } from "react";
import { isDemoMode } from "@/lib/demo-mode";

/**
 * Hook to check if user is in demo mode
 * Use this in client components to conditionally disable write actions
 */
export function useDemoMode() {
  const [isDemo, setIsDemo] = useState(false);

  useEffect(() => {
    setIsDemo(isDemoMode());
  }, []);

  return isDemo;
}

/**
 * Higher-order component props for disabling buttons/actions in demo mode
 */
export function useDemoModeGuard() {
  const isDemo = useDemoMode();
  
  return {
    isDemo,
    disabled: isDemo,
    title: isDemo ? "Demo mode: This action is disabled (read-only)" : undefined,
  };
}

