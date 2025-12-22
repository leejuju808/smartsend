/**
 * POST /api/weather/sync-service-zips
 * Block 15900 — Sync workspace service ZIPs from contacts
 * Populates workspace_service_zips table from existing contacts
 */

import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { getActiveWorkspaceId } from "@/lib/workspaces/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      );
    }

    // Get all unique ZIPs from contacts for this workspace
    const { data: contacts, error: contactsError } = await supabase
      .from("contacts")
      .select("postal_code, zip, city, state")
      .eq("workspace_id", workspaceId)
      .or("postal_code.not.is.null,zip.not.is.null");

    if (contactsError) {
      console.error("Error fetching contacts:", contactsError);
      return NextResponse.json(
        { error: contactsError.message },
        { status: 500 }
      );
    }

    // Extract unique ZIPs
    const zipMap = new Map<string, { city?: string; state?: string }>();

    for (const contact of contacts || []) {
      const zip = contact.postal_code || contact.zip;
      if (zip && zip.length >= 5) {
        const zip5 = zip.substring(0, 5);
        if (!zipMap.has(zip5)) {
          zipMap.set(zip5, {
            city: contact.city || undefined,
            state: contact.state || undefined,
          });
        }
      }
    }

    // Insert ZIPs into workspace_service_zips
    const zipsToInsert = Array.from(zipMap.entries()).map(([zip, data]) => ({
      workspace_id: workspaceId,
      zip,
      city: data.city,
      state: data.state,
      source: "contact_import",
    }));

    if (zipsToInsert.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No ZIPs found in contacts",
        zipsAdded: 0,
      });
    }

    // Use upsert to avoid duplicates
    const { data: inserted, error: insertError } = await supabase
      .from("workspace_service_zips")
      .upsert(zipsToInsert, {
        onConflict: "workspace_id,zip",
        ignoreDuplicates: false,
      })
      .select();

    if (insertError) {
      console.error("Error inserting service ZIPs:", insertError);
      return NextResponse.json(
        { error: insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Service ZIPs synced successfully",
      zipsAdded: inserted?.length || 0,
      totalZips: zipMap.size,
    });
  } catch (error: any) {
    console.error("Error in POST /api/weather/sync-service-zips:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















































