/**
 * POST /api/geo/updateNeighborhoods
 * Block 18000 — Update neighborhood intelligence data
 * Worker function to update neighborhood-level metrics and scores
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get workspace_id from request body or query params
    const body = await req.json().catch(() => ({}));
    const workspaceId = body.workspace_id || req.nextUrl.searchParams.get("workspace_id");

    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspace_id is required" },
        { status: 400 }
      );
    }

    // Get all unique neighborhoods from contacts
    const { data: contacts } = await supabase
      .from("contacts")
      .select("neighborhood_name, postal_code, zip, city, state, home_value_estimate, roof_age_estimate")
      .eq("workspace_id", workspaceId)
      .not("neighborhood_name", "is", null);

    if (!contacts || contacts.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No neighborhoods found in contacts",
        updated: 0,
      });
    }

    // Group by neighborhood and ZIP
    const neighborhoodMap = new Map<string, any>();

    for (const contact of contacts) {
      const key = `${contact.neighborhood_name}|${contact.postal_code || contact.zip}`;
      if (!neighborhoodMap.has(key)) {
        neighborhoodMap.set(key, {
          neighborhood_name: contact.neighborhood_name,
          zip: contact.postal_code || contact.zip,
          city: contact.city,
          state: contact.state,
          home_values: [] as number[],
          roof_ages: [] as number[],
        });
      }

      const neighborhood = neighborhoodMap.get(key);
      if (contact.home_value_estimate) {
        neighborhood.home_values.push(contact.home_value_estimate);
      }
      if (contact.roof_age_estimate) {
        neighborhood.roof_ages.push(contact.roof_age_estimate);
      }
    }

    // Calculate averages and update database
    let updated = 0;
    for (const [key, data] of neighborhoodMap.entries()) {
      const avgHomeValue = data.home_values.length > 0
        ? data.home_values.reduce((a: number, b: number) => a + b, 0) / data.home_values.length
        : null;
      const medianHomeValue = data.home_values.length > 0
        ? [...data.home_values].sort((a, b) => a - b)[Math.floor(data.home_values.length / 2)]
        : null;
      const avgRoofAge = data.roof_ages.length > 0
        ? data.roof_ages.reduce((a: number, b: number) => a + b, 0) / data.roof_ages.length
        : null;
      const oldRoofPct = data.roof_ages.length > 0
        ? (data.roof_ages.filter((age: number) => age >= 16).length / data.roof_ages.length) * 100
        : 0;

      // Upsert neighborhood data
      const { error } = await supabase
        .from("geo_neighborhood_data")
        .upsert({
          workspace_id: workspaceId,
          neighborhood_name: data.neighborhood_name,
          zip: data.zip,
          city: data.city,
          state: data.state,
          avg_home_value: avgHomeValue,
          median_home_value: medianHomeValue,
          avg_roof_age: avgRoofAge,
          old_roof_pct: oldRoofPct,
          last_updated_at: new Date().toISOString(),
        }, {
          onConflict: "workspace_id,neighborhood_name,zip",
        });

      if (!error) {
        updated++;
      } else {
        console.error(`Error updating neighborhood ${data.neighborhood_name}:`, error);
      }
    }

    return NextResponse.json({
      success: true,
      message: "Neighborhood data updated successfully",
      updated,
      total: neighborhoodMap.size,
    });
  } catch (error: any) {
    console.error("Error in POST /api/geo/updateNeighborhoods:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















































