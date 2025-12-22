import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { recordEvent } from '@/lib/events'
import { autoJoinByDomain } from '@/lib/autoJoinByDomain'
import { ensureProfile } from '@/lib/profile-helper'
import { syncProfileEmailAndInvites } from '@/lib/auth/syncProfileEmailAndInvites'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const refParam = requestUrl.searchParams.get('ref')

  if (code) {
    const supabase = createRouteHandlerClient({ cookies })
    await supabase.auth.exchangeCodeForSession(code)
    // Ensure personal workspace exists and membership is created
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user?.id) {
        const admin = createAdminClient()
        // If user not a member anywhere, create a personal workspace and add as owner
        const { count } = await admin.from('workspace_members').select('*', { count: 'exact', head: true }).eq('user_id', user.id)
        if (!count || count === 0) {
          // Ensure profile exists before creating workspace
          await ensureProfile(user.id, user.email || undefined);

          // Block 268400: persist optional "referred by" free-text (best-effort)
          try {
            const referredBy =
              typeof (user.user_metadata as any)?.referred_by === "string"
                ? String((user.user_metadata as any).referred_by).trim()
                : "";
            if (referredBy) {
              await admin
                .from("profiles")
                .update({ referred_by: referredBy } as any)
                .eq("id", user.id)
                .is("referred_by", null);
            }
          } catch {}
          
          const { data: ws } = await admin
            .from('workspaces')
            .insert({ name: `${user.email ?? 'Personal'} Workspace`, owner_id: user.id })
            .select('*')
            .single()
          if ((ws as any)?.id) {
            await admin
              .from('workspace_members')
              .insert({ workspace_id: (ws as any).id, user_id: user.id, role: 'owner' })
          }
          // Record signup event
          await recordEvent(user.id, "signup", { email: user.email });
          
          // Check if beta user (from user metadata)
          const isBeta = user.user_metadata?.beta === true || user.user_metadata?.beta === 'true';
          const signupSource = user.user_metadata?.signup_source || 'direct';
          
          // Track in public_signups if beta or has source
          if ((isBeta || signupSource !== 'direct') && user.email) {
            try {
              await admin.from('public_signups').upsert({
                email: user.email.toLowerCase(),
                source: signupSource,
                beta: isBeta,
              }, { onConflict: 'email', ignoreDuplicates: false });
            } catch (err) {
              console.error('Failed to track public signup:', err);
            }
          }
          
          // Auto-assign free tier for beta users
          if (isBeta) {
            try {
              await admin
                .from('profiles')
                .update({ plan: 'free' })
                .eq('id', user.id);
              
              // Send onboarding email
              if (user.email) {
                try {
                  await fetch(`${process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/onboarding/email`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: user.email }),
                  });
                } catch (emailErr) {
                  console.error('Failed to send onboarding email:', emailErr);
                }
              }
            } catch (err) {
              console.error('Failed to set beta user plan:', err);
            }
          }
          
          // Try auto-join by domain
          if (user.email) {
            await autoJoinByDomain(user.id, user.email);
          }
        } else {
          // Ensure profile exists for existing users too
          await ensureProfile(user.id, user.email || undefined);

          // Block 268400: persist optional "referred by" free-text (best-effort)
          try {
            const referredBy =
              typeof (user.user_metadata as any)?.referred_by === "string"
                ? String((user.user_metadata as any).referred_by).trim()
                : "";
            if (referredBy) {
              await admin
                .from("profiles")
                .update({ referred_by: referredBy } as any)
                .eq("id", user.id)
                .is("referred_by", null);
            }
          } catch {}
        }

        if (user.email) {
          await syncProfileEmailAndInvites(user.id, user.email);
        }
      }
    } catch {}
    // Associate referral if cookie (ss_ref) or ref param present
    try {
      const jar = cookies()
      const ref = refParam || jar.get('ss_ref_code')?.value || jar.get('ss_ref')?.value
      const { data: { user } } = await supabase.auth.getUser()
      if (ref && user?.id) {
        const admin = createAdminClient()
        // ref may be code or user id; try code first
        const { data: inviter } = await admin.from('profiles').select('id').eq('referral_code', ref).maybeSingle()
        const inviterId = (inviter as any)?.id || (ref !== user.id ? ref : null)
        if (inviterId && inviterId !== user.id) {
          // Try update by email first
          const { data: existing } = await admin
            .from('referrals')
            .select('id')
            .eq('inviter', inviterId)
            .eq('email', (user.email || '').toLowerCase())
            .maybeSingle()
          if (existing) {
            await admin.from('referrals').update({ invitee: user.id, status: 'joined' }).eq('id', (existing as any).id)
          } else {
            await admin.from('referrals').upsert({ inviter: inviterId, invitee: user.id, email: (user.email || '').toLowerCase(), status: 'joined' })
          }
        }
        
        // Try auto-join by domain for existing users too
        if (user?.email) {
          await syncProfileEmailAndInvites(user.id, user.email);
          await autoJoinByDomain(user.id, user.email);
        }
      }
    } catch {}
  }

  // Check for upgrade intent cookie
  try {
    const jar = cookies()
    const intentCookie = jar.get('upgrade_intent')?.value
    
    if (intentCookie) {
      const { priceId, plan } = JSON.parse(intentCookie)
      
      // Clear cookie so it doesn't loop
      jar.set('upgrade_intent', '', {
        path: '/',
        expires: new Date(0),
      })
      
      // Redirect into checkout initializer route
      return NextResponse.redirect(
        new URL(
          `/billing/checkout?priceId=${encodeURIComponent(priceId)}&plan=${encodeURIComponent(plan)}`,
          request.url
        )
      )
    }
  } catch {}

  // URL to redirect to after sign in process completes
  return NextResponse.redirect(new URL('/dashboard', request.url))
} 