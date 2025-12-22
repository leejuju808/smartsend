/**
 * Storm Event Sync
 * POST /api/storm/sync
 * Syncs storm events from external weather APIs (NOAA, hail maps, etc.)
 * This is a placeholder - integrate with actual weather APIs
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspaces/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * POST /api/storm/sync
 * Sync storm events from external APIs
 * Body: { source (noaa|hail_map|wind_alert), zip_codes (optional array) }
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    const body = await req.json();
    const { source = "noaa", zip_codes } = body;

    // Get workspace operating ZIP codes
    let operatingZips: string[] = [];

    if (zip_codes && Array.isArray(zip_codes)) {
      operatingZips = zip_codes;
    } else {
      // Get from contractor_territory or service_areas
      const { data: territory } = await supabaseAdmin
        .from("contractor_territory")
        .select("zip_codes")
        .eq("workspace_id", workspaceId)
        .single();

      if (territory?.zip_codes) {
        operatingZips = territory.zip_codes;
      } else {
        const { data: serviceArea } = await supabaseAdmin
          .from("service_areas")
          .select("zip_codes_served")
          .eq("workspace_id", workspaceId)
          .single();

        if (serviceArea?.zip_codes_served) {
          operatingZips = serviceArea.zip_codes_served;
        }
      }
    }

    if (operatingZips.length === 0) {
      return NextResponse.json(
        { error: "No operating ZIP codes found. Please configure service area first." },
        { status: 400 }
      );
    }

    // TODO: Integrate with actual weather APIs
    // For now, this is a placeholder that shows the structure
    
    const syncedEvents: any[] = [];
    const errors: string[] = [];

    // Example: Sync from NOAA API
    if (source === "noaa" || source === "all") {
      // TODO: Call NOAA API
      // const noaaEvents = await fetchNOAAAlerts(operatingZips);
      // Process and insert events
      console.log(`Would sync NOAA events for ZIPs: ${operatingZips.join(", ")}`);
    }

    // Example: Sync from Hail Map API
    if (source === "hail_map" || source === "all") {
      // TODO: Call Hail Map API
      // const hailEvents = await fetchHailMapEvents(operatingZips);
      // Process and insert events
      console.log(`Would sync Hail Map events for ZIPs: ${operatingZips.join(", ")}`);
    }

    // Example: Sync from Wind Alert API
    if (source === "wind_alert" || source === "all") {
      // TODO: Call Wind Alert API
      // const windEvents = await fetchWindAlerts(operatingZips);
      // Process and insert events
      console.log(`Would sync Wind Alert events for ZIPs: ${operatingZips.join(", ")}`);
    }

    return NextResponse.json({
      message: "Storm sync completed (placeholder - integrate with actual APIs)",
      source,
      zip_codes_checked: operatingZips.length,
      events_synced: syncedEvents.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("Error in /api/storm/sync:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * Helper function to fetch NOAA alerts (placeholder)
 * TODO: Implement actual NOAA API integration
 */
async function fetchNOAAAlerts(zipCodes: string[]): Promise<any[]> {
  // TODO: Implement NOAA API call
  // Example structure:
  // const response = await fetch(`https://api.weather.gov/alerts/active?zone=${zone}`);
  // Parse response and return events
  return [];
}

/**
 * Helper function to fetch Hail Map events (placeholder)
 * TODO: Implement actual Hail Map API integration
 */
async function fetchHailMapEvents(zipCodes: string[]): Promise<any[]> {
  // TODO: Implement Hail Map API call
  return [];
}

/**
 * Helper function to fetch Wind Alert events (placeholder)
 * TODO: Implement actual Wind Alert API integration
 */
async function fetchWindAlerts(zipCodes: string[]): Promise<any[]> {
  // TODO: Implement Wind Alert API call
  return [];
}



















































