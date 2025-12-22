// app/api/unsubscribe/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export async function POST(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json(
      { error: "Missing Supabase configuration" },
      { status: 500 }
    );
  }

  const supabase = createClient<Database>(supabaseUrl, supabaseServiceKey);

  let body: { email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const rawEmail = body.email?.trim().toLowerCase();

  if (!rawEmail || !rawEmail.includes("@")) {
    return NextResponse.json(
      { error: "Valid email required" },
      { status: 400 }
    );
  }

  try {
    // 1) Insert into suppression_list_global (ignore if already there)
    // Use helper function for idempotent insert
    const { error: rpcError } = await supabase.rpc("add_to_suppression_list_global", {
      p_email: rawEmail,
      p_reason: "unsubscribe_link",
      p_created_by: "public_unsubscribe",
    });

    if (rpcError) {
      throw rpcError;
    }

    // 2) Mark any leads with this email as do_not_contact
    await supabase
      .from("leads")
      .update({ status: "do_not_contact" })
      .eq("email", rawEmail);

    // 3) Cancel any pending outbound emails to this address
    await supabase
      .from("outbound_emails")
      .update({ status: "canceled" })
      .eq("to_email", rawEmail)
      .eq("status", "pending");

    return NextResponse.json(
      { success: true },
      { status: 200 }
    );
  } catch (err) {
    console.error("Unsubscribe error:", err);
    return NextResponse.json(
      { error: "Failed to process unsubscribe" },
      { status: 500 }
    );
  }
}
