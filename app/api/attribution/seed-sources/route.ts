/**
 * Block 93000 — Seed Default Lead Sources
 * Creates default lead sources for a workspace
 */

import { NextRequest, NextResponse } from "next/server";
import { getUserAndWorkspace } from "@/src/lib/api-helpers";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  try {
    const { workspaceId, supabase } = await getUserAndWorkspace();

    // Check if sources already exist
    const { data: existing } = await supabase
      .from("lead_sources")
      .select("id")
      .eq("workspace_id", workspaceId)
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json({
        message: "Lead sources already exist for this workspace",
        seeded: false,
      });
    }

    // Seed default sources
    const defaultSources = [
      { name: "Cold Email", channel_type: "outbound" },
      { name: "Phone Call", channel_type: "inbound" },
      { name: "Website Form", channel_type: "inbound" },
      { name: "Referral", channel_type: "inbound" },
      { name: "QR Code", channel_type: "offline" },
      { name: "Yard Sign", channel_type: "offline" },
      { name: "Door Hanger", channel_type: "offline" },
      { name: "Google Business", channel_type: "online" },
      { name: "Social Media", channel_type: "online" },
      { name: "Direct Mail", channel_type: "offline" },
    ];

    const { data, error } = await supabase
      .from("lead_sources")
      .insert(
        defaultSources.map((source) => ({
          workspace_id: workspaceId,
          ...source,
        }))
      )
      .select();

    if (error) throw error;

    return NextResponse.json({
      message: "Default lead sources created",
      seeded: true,
      sources: data,
    });
  } catch (error: any) {
    console.error("Seed sources error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to seed default sources" },
      { status: 500 }
    );
  }
}



























