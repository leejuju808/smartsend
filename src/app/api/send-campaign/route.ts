import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const { campaignId } = await req.json() as { campaignId?: string };

    if (!campaignId) {
      return NextResponse.json({ error: "campaignId is required" }, { status: 400 });
    }

    // Fetch campaign details
    const { data: campaign, error: cError } = await supabase
      .from("campaigns")
      .select("*")
      .eq("id", campaignId)
      .single();

    if (cError || !campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    // Fetch assigned contacts
    const { data: assigned, error: aError } = await supabase
      .from("campaign_contacts")
      .select("id, contact_id, contacts(email, name)")
      .eq("campaign_id", campaignId);

    if (aError) {
      return NextResponse.json({ error: "Error fetching contacts" }, { status: 500 });
    }

    // Setup Nodemailer transport (SMTP)
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST!,
      port: parseInt(process.env.SMTP_PORT!),
      secure: false,
      auth: {
        user: process.env.SMTP_USER!,
        pass: process.env.SMTP_PASS!,
      },
    });

    // Send emails one by one
    for (const a of assigned || []) {
      // @ts-ignore - depending on Supabase relational setup
      const email = a.contacts?.email as string | undefined;
      // @ts-ignore
      const name = (a.contacts?.name as string | undefined) || undefined;
      if (!email) continue;

      await transporter.sendMail({
        from: `"SmartSendAI" <${process.env.SMTP_USER!}>`,
        to: email,
        subject: campaign.subject,
        text: campaign.body,
      });

      await supabase
        .from("campaign_contacts")
        .update({ sent_at: new Date().toISOString(), last_step_sent: 1 })
        .eq("id", a.id as string);
    }

    await supabase.from("campaigns").update({ status: "sent" }).eq("id", campaignId);

    // Mark onboarding step as complete
    try {
      await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/onboarding/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 'send_campaign' })
      });
    } catch (e) {
      // Don't fail the campaign send if onboarding update fails
      console.warn('Failed to update onboarding step:', e);
    }

    return NextResponse.json({ success: true, message: "Campaign sent!" });
  } catch (err: any) {
    console.error("Send error:", err?.message || err);
    return NextResponse.json({ error: err?.message || "Unknown error" }, { status: 500 });
  }
} 