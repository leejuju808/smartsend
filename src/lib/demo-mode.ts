"use client";

// Client-side demo mode detection
export function isDemoMode(): boolean {
  if (typeof window === "undefined") return false;
  
  try {
    const demoSession = document.cookie
      .split("; ")
      .find((row) => row.startsWith("demo_session="));
    
    if (!demoSession) return false;
    
    const value = demoSession.split("=")[1];
    const sessionData = JSON.parse(decodeURIComponent(value));
    return sessionData?.user?.id === "demo-user";
  } catch {
    return false;
  }
}

export function getDemoOrgId(): string | null {
  if (typeof window === "undefined") return null;
  
  try {
    const demoSession = document.cookie
      .split("; ")
      .find((row) => row.startsWith("demo_session="));
    
    if (!demoSession) return null;
    
    const value = demoSession.split("=")[1];
    const sessionData = JSON.parse(decodeURIComponent(value));
    return sessionData?.user?.org_id || null;
  } catch {
    return null;
  }
}

