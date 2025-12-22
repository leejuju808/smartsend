import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/server/supabase";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, data, id, domain, daily_cap } = body;
    const userId = body.user_id || "demo-user"; // In production, get from auth

    switch (type) {
      case "mailbox":
        const { data: mailbox, error: mailboxError } = await supabaseAdmin
          .from("mailboxes")
          .insert({
            user_id: userId,
            name: data.name,
            from_email: data.from_email,
            from_name: data.from_name || null,
            daily_cap: data.daily_cap,
            is_active: true
          })
          .select()
          .single();

        if (mailboxError) {
          console.error("Error creating mailbox:", mailboxError);
          return NextResponse.json({ error: "Failed to create mailbox" }, { status: 500 });
        }

        return NextResponse.json({ mailbox });

      case "mailbox_update":
        const { data: updatedMailbox, error: updateError } = await supabaseAdmin
          .from("mailboxes")
          .update(data)
          .eq("id", id)
          .eq("user_id", userId)
          .select()
          .single();

        if (updateError) {
          console.error("Error updating mailbox:", updateError);
          return NextResponse.json({ error: "Failed to update mailbox" }, { status: 500 });
        }

        return NextResponse.json({ mailbox: updatedMailbox });

      case "mailbox_delete":
        const { error: deleteError } = await supabaseAdmin
          .from("mailboxes")
          .delete()
          .eq("id", id)
          .eq("user_id", userId);

        if (deleteError) {
          console.error("Error deleting mailbox:", deleteError);
          return NextResponse.json({ error: "Failed to delete mailbox" }, { status: 500 });
        }

        return NextResponse.json({ success: true });

      case "domain_cap":
        const { data: domainCap, error: domainCapError } = await supabaseAdmin
          .from("domain_daily_caps")
          .insert({
            user_id: userId,
            domain: data.domain,
            daily_cap: data.daily_cap
          })
          .select()
          .single();

        if (domainCapError) {
          console.error("Error creating domain cap:", domainCapError);
          return NextResponse.json({ error: "Failed to create domain cap" }, { status: 500 });
        }

        return NextResponse.json({ domain_cap: domainCap });

      case "domain_cap_update":
        const { data: updatedDomainCap, error: domainCapUpdateError } = await supabaseAdmin
          .from("domain_daily_caps")
          .update({ daily_cap })
          .eq("domain", domain)
          .eq("user_id", userId)
          .select()
          .single();

        if (domainCapUpdateError) {
          console.error("Error updating domain cap:", domainCapUpdateError);
          return NextResponse.json({ error: "Failed to update domain cap" }, { status: 500 });
        }

        return NextResponse.json({ domain_cap: updatedDomainCap });

      case "domain_cap_delete":
        const { error: domainCapDeleteError } = await supabaseAdmin
          .from("domain_daily_caps")
          .delete()
          .eq("domain", domain)
          .eq("user_id", userId);

        if (domainCapDeleteError) {
          console.error("Error deleting domain cap:", domainCapDeleteError);
          return NextResponse.json({ error: "Failed to delete domain cap" }, { status: 500 });
        }

        return NextResponse.json({ success: true });

      case "settings":
        // Upsert deliverability settings
        const { data: settings, error: settingsError } = await supabaseAdmin
          .from("deliverability_settings")
          .upsert({
            user_id: userId,
            default_domain_cap: data.default_domain_cap,
            send_window_start: data.send_window_start,
            send_window_end: data.send_window_end,
            timezone: data.timezone
          })
          .select()
          .single();

        if (settingsError) {
          console.error("Error updating deliverability settings:", settingsError);
          return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
        }

        return NextResponse.json({ settings });

      default:
        return NextResponse.json({ error: "Invalid type parameter" }, { status: 400 });
    }
  } catch (error) {
    console.error("Error in deliverability settings SET:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
} 