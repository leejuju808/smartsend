import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { createClient } from "@supabase/supabase-js";
import { stripe } from "@/lib/stripe";

export const runtime = "nodejs";

function isAdminEmail(email?: string | null): boolean {
  const list = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return !!(email && list.includes(email.toLowerCase()));
}

function emailProviderOk(): { ok: boolean; message: string } {
  const provider = (process.env.MAIL_PROVIDER || "smtp").toLowerCase();

  if (provider === "resend") {
    return process.env.RESEND_API_KEY
      ? { ok: true, message: "Resend configured" }
      : { ok: false, message: "RESEND_API_KEY missing" };
  }

  if (provider === "gmail") {
    // Sending uses per-user OAuth tokens; env validation isn’t meaningful here.
    return { ok: true, message: "Gmail provider enabled" };
  }

  // SMTP (default)
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  return host && user && pass
    ? { ok: true, message: "SMTP configured" }
    : { ok: false, message: "SMTP_* envs missing" };
}

export async function GET() {
  try {
    // Auth + admin gate
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!isAdminEmail(user.email)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // 1) Payments work (Stripe reachable)
    let paymentsOk = false;
    let paymentsMessage = "Unknown";
    try {
      await stripe.customers.list({ limit: 1 });
      paymentsOk = true;
      paymentsMessage = "Stripe reachable";
    } catch (e: any) {
      paymentsOk = false;
      paymentsMessage = e?.message || "Stripe check failed";
    }

    // 2) Emails send (provider config present)
    const emailCheck = emailProviderOk();

    // 3) Estimates approve (DB reachable + core estimate tables accessible)
    let estimatesOk = false;
    let estimatesMessage = "Unknown";
    try {
      const [{ error: estErr }, { error: eventsErr }] = await Promise.all([
        admin.from("estimates").select("id", { head: true, count: "exact" }).limit(1),
        admin.from("estimate_events").select("id", { head: true, count: "exact" }).limit(1),
      ]);
      if (estErr) throw estErr;
      if (eventsErr) throw eventsErr;
      estimatesOk = true;
      estimatesMessage = "Estimates + events tables reachable";
    } catch (e: any) {
      estimatesOk = false;
      estimatesMessage = e?.message || "Estimate checks failed";
    }

    // 4) Dashboard loads (Revenue Proof query path should work)
    let dashboardOk = false;
    let dashboardMessage = "Unknown";
    try {
      // Minimal version of /api/revenue-proof: validate estimates table is queryable with key fields.
      const { error } = await admin
        .from("estimates")
        .select("id, created_at, sent_at, approved_at, status, total")
        .limit(1);
      if (error) throw error;
      dashboardOk = true;
      dashboardMessage = "Revenue Proof query path OK";
    } catch (e: any) {
      dashboardOk = false;
      dashboardMessage = e?.message || "Dashboard check failed";
    }

    const ready = paymentsOk && emailCheck.ok && estimatesOk && dashboardOk;

    return NextResponse.json({
      ready,
      checks: {
        payments_work: { ok: paymentsOk, message: paymentsMessage },
        emails_send: { ok: emailCheck.ok, message: emailCheck.message },
        estimates_approve: { ok: estimatesOk, message: estimatesMessage },
        dashboard_loads: { ok: dashboardOk, message: dashboardMessage },
      },
    });
  } catch (error: any) {
    console.error("Error in /api/admin/sales-readiness:", error);
    return NextResponse.json({ error: error?.message || "Internal server error" }, { status: 500 });
  }
}









