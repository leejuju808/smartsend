import { cookies } from "next/headers";

// Server-side demo mode detection
export async function isDemoModeServer(): Promise<boolean> {
  const cookieStore = await cookies();
  const demoSession = cookieStore.get("demo_session");
  
  if (!demoSession) return false;
  
  try {
    const sessionData = JSON.parse(demoSession.value);
    return sessionData?.user?.id === "demo-user";
  } catch {
    return false;
  }
}

export async function getDemoOrgIdServer(): Promise<string | null> {
  const cookieStore = await cookies();
  const demoSession = cookieStore.get("demo_session");
  
  if (!demoSession) return null;
  
  try {
    const sessionData = JSON.parse(demoSession.value);
    return sessionData?.user?.org_id || null;
  } catch {
    return null;
  }
}

