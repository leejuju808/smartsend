import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PROTECTED_PREFIXES = ["/dashboard", "/settings", "/sequences"];
const FOUNDER_EMAIL = "julian@smartsendhq.com";
const SALES_ALLOWED_PREFIXES = ["/admin", "/dashboard/admin", "/login", "/onboarding", "/auth", "/api"];
// BLOCK 274300 — Ruthless Simplicity Sprint
// One truth screen + action-only surfaces.
// Everything else is noise.
//
// NOTE: This codebase’s primary dashboard entrypoint is `/dashboard/daily`.
// `/dashboard` is an alias that server-redirects to `/dashboard/daily`.
const REALITY_LOCK_ALLOWLIST = [
  "/dashboard",
  "/dashboard/daily",
];

export async function middleware(req: NextRequest) {
  const { nextUrl, cookies } = req;
  const res = NextResponse.next();

  // Admin routes require founder access
  if (nextUrl.pathname.startsWith("/admin")) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get: (name: string) => cookies.get(name)?.value,
          set: (name: string, value: string, options: any) => { res.cookies.set({ name, value, ...options }); },
          remove: (name: string, options: any) => { res.cookies.set({ name, value: "", ...options }); },
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.redirect(new URL("/login", nextUrl.origin));
    }

    // Get user email from profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", user.id)
      .single();

    if (profile?.email !== FOUNDER_EMAIL) {
      return NextResponse.redirect(new URL("/dashboard", nextUrl.origin));
    }

    return res;
  }

  // public routes pass-through
  const isProtected = PROTECTED_PREFIXES.some((p) => nextUrl.pathname.startsWith(p));
  if (!isProtected) return res;

  // Sales Session + No-Excuse Builder Lock (founder-only, cookie-driven)
  const salesSessionCookie = cookies.get("sales_session")?.value ?? null;
  const builderLockUntil = cookies.get("builder_lock_until")?.value ?? null;
  const nowMs = Date.now();
  const salesActive = (() => {
    if (!salesSessionCookie) return false;
    try {
      const s = JSON.parse(salesSessionCookie);
      const ends = Date.parse(s?.endsAt);
      return isFinite(ends) && ends > nowMs;
    } catch {
      return false;
    }
  })();
  const builderLocked = (() => {
    if (!builderLockUntil) return false;
    const until = Date.parse(builderLockUntil);
    return isFinite(until) && until > nowMs;
  })();

  // Check for demo session first
  const demoSession = cookies.get("demo_session");
  if (demoSession) {
    try {
      const sessionData = JSON.parse(demoSession.value);
      if (sessionData?.user?.id === "demo-user") {
        // Allow demo user through
        return res;
      }
    } catch {
      // Invalid demo session, continue to auth check
    }
  }

  // check session
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name: string) => cookies.get(name)?.value,
        set: (name: string, value: string, options: any) => { res.cookies.set({ name, value, ...options }); },
        remove: (name: string, options: any) => { res.cookies.set({ name, value: "", ...options }); },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    const url = new URL("/login", nextUrl.origin);
    url.searchParams.set("redirect", nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  // BLOCK 274300 — Ruthless Simplicity Sprint
  // Roofers don't "browse features". They execute.
  // Anything under /dashboard/* (except explicit allowlist) is forced back to the one truth screen.
  if (
    nextUrl.pathname.startsWith("/dashboard") &&
    !REALITY_LOCK_ALLOWLIST.some((p) => nextUrl.pathname === p || nextUrl.pathname.startsWith(`${p}/`))
  ) {
    return NextResponse.redirect(new URL("/dashboard/daily", nextUrl.origin));
  }

  // Also lock traditional settings/sequence surfaces (no tabs, no debates).
  if (nextUrl.pathname.startsWith("/settings") || nextUrl.pathname.startsWith("/sequences")) {
    return NextResponse.redirect(new URL("/dashboard/daily", nextUrl.origin));
  }

  if ((salesActive || builderLocked) && !SALES_ALLOWED_PREFIXES.some((p) => nextUrl.pathname.startsWith(p))) {
    // Founder-only lock: resolve email from profile (RLS-safe; profiles is readable by authenticated)
    const { data: profile } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.email === FOUNDER_EMAIL) {
      return NextResponse.redirect(new URL("/admin/status", nextUrl.origin));
    }
  }

  // Block 20870: Check session context (organization + role)
  try {
    const { data: sessionContext, error: sessionError } = await supabase.rpc("get_session_context");
    
    if (sessionError || !sessionContext || sessionContext.length === 0) {
      // User is authenticated but has no organization/role
      // Redirect to a setup page or show error
      console.warn("User authenticated but missing organization/role context:", sessionError);
      // Allow through for now - API routes will enforce this
    } else {
      const context = sessionContext[0];
      if (!context.organization_id || !context.role) {
        console.warn("User missing organization_id or role in session context");
        // Allow through for now - API routes will enforce this
      }
    }
  } catch (error) {
    // If session context check fails, log but don't block
    // This could mean the function doesn't exist yet or there's a temporary issue
    console.warn("Error checking session context:", error);
  }

  // Block 95000: Check first_login and onboarding progress
  // Skip check if already on onboarding pages, login, or API routes
  if (
    !nextUrl.pathname.startsWith("/onboarding") &&
    !nextUrl.pathname.startsWith("/login") &&
    !nextUrl.pathname.startsWith("/api") &&
    !nextUrl.pathname.startsWith("/auth")
  ) {
    try {
      // Check first_login flag on profiles
      const { data: profile } = await supabase
        .from("profiles")
        .select("first_login")
        .eq("id", user.id)
        .maybeSingle();

      // If first_login is true, check if onboarding is incomplete
      if (profile?.first_login) {
        // Get user onboarding progress
        const { data: progress } = await supabase
          .rpc("get_user_onboarding_status", { p_user_id: user.id });

        if (progress && Array.isArray(progress)) {
          // Check if all required tasks are completed
          const requiredTasks = progress.filter((t: any) => t.required);
          const incompleteRequired = requiredTasks.some((t: any) => !t.completed);

          if (incompleteRequired) {
            // Find first incomplete task and redirect to it
            const firstIncomplete = progress.find((t: any) => !t.completed && t.required);
            if (firstIncomplete?.cta_url) {
              return NextResponse.redirect(new URL(firstIncomplete.cta_url, nextUrl.origin));
            }
            // Fallback to main onboarding tasks page
            return NextResponse.redirect(new URL("/onboarding/tasks", nextUrl.origin));
          }
        } else {
          // No progress found, redirect to onboarding tasks page
          return NextResponse.redirect(new URL("/onboarding/tasks", nextUrl.origin));
        }
      }

      // Block 21675: Legacy onboarding_state check (keep for backward compatibility)
      const { data: onboardingState } = await supabase
        .from("onboarding_state")
        .select("current_step, completed")
        .eq("user_id", user.id)
        .maybeSingle();

      if (onboardingState && !onboardingState.completed) {
        const stepRoutes: Record<string, string> = {
          welcome: "/onboarding/welcome",
          "connect-email": "/onboarding/connect-email",
          "add-leads": "/onboarding/add-leads",
          "choose-template": "/onboarding/choose-template",
          "ai-personalize": "/onboarding/ai-personalize",
          review: "/onboarding/review",
          finish: "/onboarding/finish",
        };
        
        const redirectPath = stepRoutes[onboardingState.current_step] || "/onboarding/welcome";
        return NextResponse.redirect(new URL(redirectPath, nextUrl.origin));
      }
    } catch (error) {
      // If status check fails, continue (don't block access)
      console.warn("Error checking onboarding status:", error);
    }
  }

  return res;
}

export const config = {
  matcher: ["/dashboard/:path*", "/settings/:path*", "/sequences/:path*", "/admin/:path*", "/onboarding/:path*"],
};
