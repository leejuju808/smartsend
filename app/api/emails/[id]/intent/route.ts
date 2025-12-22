// Block 14200 — Manual Re-Classify Intent Endpoint
// Allows users to manually override AI intent classification

import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { handleIntentSideEffects } from "@/lib/intent-side-effects";
import type { SupabaseClient } from "@supabase/supabase-js";

const validLabels = [
  "hot_lead",
  "warm_lead",
  "follow_up",
  "not_interested",
  "out_of_office",
  "wrong_contact",
  "unsubscribe",
  "other",
] as const;

type IntentLabel = typeof validLabels[number];

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { label } = await req.json();

    if (!label || !validLabels.includes(label)) {
      return NextResponse.json(
        { error: `Invalid label. Must be one of: ${validLabels.join(", ")}` },
        { status: 400 }
      );
    }

    // Get the message
    const { data: msg, error: msgError } = await supabase
      .from("email_messages")
      .select("id, contact_id, workspace_id, body_text")
      .eq("id", params.id)
      .single();

    if (msgError || !msg) {
      return NextResponse.json(
        { error: "Message not found" },
        { status: 404 }
      );
    }

    // Verify user has access to this workspace
    if (msg.workspace_id) {
      const { data: member } = await supabase
        .from("workspace_members")
        .select("user_id")
        .eq("workspace_id", msg.workspace_id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (!member) {
        return NextResponse.json(
          { error: "Access denied" },
          { status: 403 }
        );
      }
    }

    // Update the message with new intent
    const { error: updateError } = await supabase
      .from("email_messages")
      .update({
        intent_label: label,
        intent_confidence: 1.0, // Manual override = 100% confidence
        intent_raw: {
          label,
          confidence: 1.0,
          reason: "Manual override by user",
          overridden: true,
        },
      })
      .eq("id", params.id);

    if (updateError) {
      console.error("Failed to update intent:", updateError);
      return NextResponse.json(
        { error: "Failed to update intent" },
        { status: 500 }
      );
    }

    // Re-apply side effects with the new intent
    if (msg.contact_id && msg.workspace_id) {
      try {
        // Use service role client for side effects to ensure permissions
        const { createClient } = await import("@supabase/supabase-js");
        const serviceClient = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        ) as SupabaseClient;

        await handleIntentSideEffects(serviceClient, {
          messageId: msg.id,
          contactId: msg.contact_id,
          workspaceId: msg.workspace_id,
          label: label as IntentLabel,
          confidence: 1.0,
          replyText: msg.body_text || "",
        });
      } catch (sideEffectError) {
        console.error("Failed to apply side effects:", sideEffectError);
        // Don't fail the request if side effects fail
      }
    }

    return NextResponse.json({ ok: true, label });
  } catch (err: any) {
    console.error("Error in manual re-classify:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}

