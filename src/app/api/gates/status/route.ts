import { NextResponse } from "next/server";
import { getSubscriptionStatus } from "@/lib/subscription";
import { supabaseAdmin } from "@/server/supabase";

export async function GET() {
  const { userId, status } = await getSubscriptionStatus();
  if (!userId) return NextResponse.json({ gated: false });

  if (status === "pro") return NextResponse.json({ gated: false });

  const { data: prof } = await supabaseAdmin
    .from("profiles")
    .select("trial_replies_sent, trial_contacts_imported, trial_extension_days")
    .eq("id", userId)
    .maybeSingle();

  const limits = { replies: 3, contacts: 50, extDays: 1 };
  const gated =
    (prof?.trial_replies_sent || 0) >= limits.replies ||
    (prof?.trial_contacts_imported || 0) >= limits.contacts ||
    (prof?.trial_extension_days || 0) >= limits.extDays;

  // Log upgrade wall shown event
  if (gated) {
    try {
      await supabaseAdmin.from("events").insert({ 
        user_id: userId, 
        event: "upgrade_wall_shown" 
      });
    } catch (error) {
      // Don't fail if event logging fails
      console.error('Event logging error:', error);
    }
  }

  return NextResponse.json({ gated });
} 