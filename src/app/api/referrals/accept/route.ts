import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createAdminClient, createServerComponentClient } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supa = createServerComponentClient()
  const { data: { user } } = await supa.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const fromQuery = (url.searchParams.get('ref') || '').toString().trim()
  const jar = cookies()
  const fromCookie = jar.get('ss_ref_code')?.value
  const ref = fromQuery || fromCookie
  if (!ref) return NextResponse.json({ ok: false, error: 'missing_ref' }, { status: 400 })

  const admin = createAdminClient()
  // Resolve code -> inviter id
  const { data: inviter } = await admin
    .from('profiles')
    .select('id')
    .eq('referral_code', ref)
    .maybeSingle()
  const inviterId = (inviter as any)?.id
  if (!inviterId || inviterId === user.id) return NextResponse.json({ ok: true, skipped: true })

  // Try to update existing pending referral by email
  const { data: existing } = await admin
    .from('referrals')
    .select('id,status')
    .eq('inviter', inviterId)
    .eq('email', user.email?.toLowerCase() || '')
    .maybeSingle()

  if (existing) {
    await admin
      .from('referrals')
      .update({ invitee: user.id, status: 'joined' })
      .eq('id', (existing as any).id)
  } else {
    // Create referral association if none by email
    await admin
      .from('referrals')
      .upsert({ inviter: inviterId, invitee: user.id, email: (user.email || '').toLowerCase(), status: 'joined' })
  }

  return NextResponse.json({ ok: true })
}

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/server/supabase";

// TEMP: replace with real auth wiring
async function getInviteeId(req: Request): Promise<string | null> {
  try {
    const body = await req.json();
    return body?.inviteeId ?? null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({} as any));
  const { ref, email }: { ref?: string; email?: string } = body;
  const inviteeId = await getInviteeId(req);
  if (!ref || !inviteeId) {
    return NextResponse.json({ error: "Missing ref or inviteeId" }, { status: 400 });
  }

  // Find inviter by referral_code
  const { data: inviterRow, error: invErr } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("referral_code", ref)
    .single();
  if (invErr || !inviterRow) {
    return NextResponse.json({ error: "Invalid referral code" }, { status: 404 });
  }

  // If email was pre-invited, update that row; else insert a joined row
  if (email) {
    const { data: pre } = await supabaseAdmin
      .from("referrals")
      .select("id, status")
      .eq("user_id", inviterRow.id)
      .eq("email", email)
      .limit(1);

    if (pre && pre.length) {
      await supabaseAdmin
        .from("referrals")
        .update({ referred_id: inviteeId, status: "joined" })
        .eq("id", pre[0].id);
    } else {
      await supabaseAdmin.from("referrals").insert({
        user_id: inviterRow.id,
        referred_id: inviteeId,
        email,
        status: "joined",
      });
    }
  } else {
    await supabaseAdmin.from("referrals").insert({
      user_id: inviterRow.id,
      referred_id: inviteeId,
      status: "joined",
    });
  }

  return NextResponse.json({ ok: true });
}

