// app/api/campaigns/enroll-contacts/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type IncomingContact = {
  email: string;
  firstName?: string;
  lastName?: string;
};

export async function POST(req: NextRequest) {
  const supabase = createClient();

  try {
    const body = (await req.json()) as {
      campaignId?: string;
      contacts?: IncomingContact[];
    };

    if (!body.campaignId) {
      return NextResponse.json(
        { error: "campaignId is required" },
        { status: 400 }
      );
    }

    if (!Array.isArray(body.contacts) || body.contacts.length === 0) {
      return NextResponse.json(
        { error: "contacts array is required" },
        { status: 400 }
      );
    }

    const results: { email: string; ok: boolean; error?: string }[] = [];

    for (const c of body.contacts) {
      if (!c.email || !c.email.trim()) {
        results.push({
          email: c.email ?? "",
          ok: false,
          error: "missing_email",
        });
        continue;
      }

      const { error } = await supabase.rpc("enroll_contact_in_campaign", {
        p_campaign_id: body.campaignId,
        p_email: c.email.trim(),
        p_first_name: c.firstName ?? null,
        p_last_name: c.lastName ?? null,
      });

      if (error) {
        console.error("enroll_contact_in_campaign error:", error);
        results.push({
          email: c.email,
          ok: false,
          error: error.message,
        });
      } else {
        results.push({ email: c.email, ok: true });
      }
    }

    return NextResponse.json({ ok: true, results }, { status: 200 });
  } catch (err: any) {
    console.error("POST /api/campaigns/enroll-contacts error:", err);
    return NextResponse.json(
      { error: "Internal server error", details: err?.message || String(err) },
      { status: 500 }
    );
  }
}


























































