import { cookies } from "next/headers";

/**
 * Server-side guard to prevent write actions in demo mode
 * Use this in API routes and server actions
 */
export async function preventDemoModeWrites(): Promise<{ blocked: boolean; reason?: string }> {
  const cookieStore = await cookies();
  const demoSession = cookieStore.get("demo_session");
  
  if (!demoSession) {
    return { blocked: false };
  }
  
  try {
    const sessionData = JSON.parse(demoSession.value);
    if (sessionData?.user?.id === "demo-user") {
      return { blocked: true, reason: "Demo mode: write actions are disabled" };
    }
  } catch {
    // Invalid demo session, allow through
  }
  
  return { blocked: false };
}

/**
 * Throw an error if in demo mode (for use in server actions)
 */
export async function throwIfDemoMode() {
  const guard = await preventDemoModeWrites();
  if (guard.blocked) {
    throw new Error(guard.reason || "Write actions are disabled in demo mode");
  }
}

