/**
 * Block 93000 — QR Code Management API
 * Create, list, and manage QR codes for attribution tracking
 */

import { NextRequest, NextResponse } from "next/server";
import { getUserAndWorkspace } from "@/src/lib/api-helpers";
import { nanoid } from "nanoid";

// GET /api/attribution/qr-codes - List QR codes
export async function GET(req: NextRequest) {
  try {
    const { workspaceId, supabase } = await getUserAndWorkspace();
    const { searchParams } = new URL(req.url);
    const activeOnly = searchParams.get("active_only") === "true";

    let query = supabase
      .from("qr_codes")
      .select(`
        *,
        lead_sources (*),
        lead_campaigns (*)
      `)
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });

    if (activeOnly) {
      query = query.eq("is_active", true);
    }

    const { data, error } = await query;

    if (error) throw error;

    return NextResponse.json({ qr_codes: data || [] });
  } catch (error: any) {
    console.error("QR codes API error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch QR codes" },
      { status: 500 }
    );
  }
}

// POST /api/attribution/qr-codes - Create QR code
export async function POST(req: NextRequest) {
  try {
    const { workspaceId, supabase } = await getUserAndWorkspace();
    const body = await req.json();
    const { url, label, campaign_id, source_id } = body;

    if (!url || !label) {
      return NextResponse.json(
        { error: "url and label are required" },
        { status: 400 }
      );
    }

    // Generate short code
    const shortCode = nanoid(8);

    // Create QR code
    const { data, error } = await supabase
      .from("qr_codes")
      .insert({
        workspace_id: workspaceId,
        url,
        label,
        short_code: shortCode,
        campaign_id: campaign_id || null,
        source_id: source_id || null,
        is_active: true,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ qr_code: data });
  } catch (error: any) {
    console.error("QR code creation error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create QR code" },
      { status: 500 }
    );
  }
}

// PATCH /api/attribution/qr-codes - Update QR code
export async function PATCH(req: NextRequest) {
  try {
    const { workspaceId, supabase } = await getUserAndWorkspace();
    const body = await req.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("qr_codes")
      .update(updates)
      .eq("id", id)
      .eq("workspace_id", workspaceId)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ qr_code: data });
  } catch (error: any) {
    console.error("QR code update error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update QR code" },
      { status: 500 }
    );
  }
}



























