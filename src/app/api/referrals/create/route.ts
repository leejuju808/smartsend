import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createServerComponentClient } from '@/lib/supabase'
import { ensureReferralCodeForUser } from '@/lib/referrals'
import { sendEmail } from '@/lib/notify/mailer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supa = createServerComponentClient()
  const { data: { user } } = await supa.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const email = (body?.email || '').toString().trim().toLowerCase()
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ ok: false, error: 'invalid_email' }, { status: 400 })
  }

  const admin = createAdminClient()
  const code = await ensureReferralCodeForUser(user.id)
  const origin = new URL(req.url).origin
  const signupUrl = `${origin}/signup?ref=${encodeURIComponent(code)}`

  // Insert or ensure referral row exists
  await admin
    .from('referrals')
    .upsert({ inviter: user.id, email, status: 'pending' }, { onConflict: 'inviter,email', ignoreDuplicates: true })

  // Send invite email
  await sendEmail({
    to: email,
    subject: 'You were invited to try Our App',
    text: `You've been invited to try Our App. Use this link to sign up: ${signupUrl}\n\nYou'll get 20% off your first month.`,
  })

  return NextResponse.json({ ok: true })
}

import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { supabaseAdmin } from "@/server/supabase";

// TEMP: replace with real auth integration
async function getUserIdFromAuth(req: Request): Promise<string | null> {
  const url = new URL(req.url);
  return url.searchParams.get("userId");
}

function makeShortCode() {
  return randomBytes(4).toString("hex");
}

export async function POST(req: Request) {
  const inviterId = await getUserIdFromAuth(req);
  if (!inviterId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { emails }: { emails?: string[] } = await req.json().catch(() => ({} as any));

  // Ensure inviter profile exists and has a referral_code
  const { data: prof, error: pErr } = await supabaseAdmin
    .from("profiles")
    .select("id, referral_code")
    .eq("id", inviterId)
    .single();

  if (pErr || !prof) return NextResponse.json({ error: "Profile not found" }, { status: 400 });

  let code = (prof as any).referral_code as string | null;
  if (!code) {
    for (let i = 0; i < 3 && !code; i++) {
      const candidate = makeShortCode();
      const { error } = await supabaseAdmin
        .from("profiles")
        .update({ referral_code: candidate })
        .eq("id", inviterId);
      if (!error) code = candidate;
    }
    if (!code) return NextResponse.json({ error: "Could not set referral code" }, { status: 500 });
  }

  // Optionally create email invite rows (schema augmented to support email + status)
  if (emails?.length) {
    const rows = emails.map((email) => ({
      user_id: inviterId, // inviter
      email,
      status: "pending" as const,
    }));
    await supabaseAdmin.from("referrals").insert(rows).catch(() => {});
  }

  const linkBase = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const link = `${linkBase}/signup?ref=${code}`;
  return NextResponse.json({ ok: true, link, code });
}

