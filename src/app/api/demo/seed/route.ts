import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase';

export async function POST() {
  try {
    const supabase = createServerComponentClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Not authed" }, { status: 401 });
    }

    const admin = createAdminClient();

    // Insert demo contact
    const { data: contact, error: contactError } = await admin
      .from("contacts")
      .upsert({
        user_id: user.id,
        email: "demo@example.com",
        first_name: "Demo",
        last_name: "Lead",
        company: "Acme Corp"
      }, { onConflict: "user_id,email" })
      .select()
      .single();

    if (contactError) {
      console.error('Contact insert error:', contactError);
      return NextResponse.json({ error: "Failed to create contact" }, { status: 500 });
    }

    // Insert demo campaign
    const { data: campaign, error: campaignError } = await admin
      .from("campaigns")
      .upsert({
        user_id: user.id,
        title: "Demo Campaign",
        subject: "SmartSendAI Demo",
        body: "Hi {{first_name}},\n\nThis is how SmartSendAI automates replies.\n\n– Demo",
        status: "draft"
      })
      .select()
      .single();

    if (campaignError) {
      console.error('Campaign insert error:', campaignError);
      return NextResponse.json({ error: "Failed to create campaign" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, campaign });
  } catch (error) {
    console.error('Demo seed error:', error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

