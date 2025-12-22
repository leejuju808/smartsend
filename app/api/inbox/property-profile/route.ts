// Block 20260 — Property & Roof Profile API

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      conversation_id,
      property_sqft,
      property_bedrooms,
      property_bathrooms,
      property_year_built,
      property_estimated_value,
      roof_material,
      roof_last_replacement_year,
      roof_age_estimated,
    } = body;

    if (!conversation_id) {
      return NextResponse.json(
        { error: "conversation_id required" },
        { status: 400 }
      );
    }

    // 1) Load current thread to get campaign_id
    const { data: thread, error: threadError } = await supabase
      .from("inbox_threads")
      .select("id, campaign_id")
      .eq("id", conversation_id)
      .single();

    if (threadError || !thread) {
      console.error("Property profile thread error", threadError);
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    // 2) Build update payload (only include fields that are provided)
    const updatePayload: any = {};

    if (property_sqft !== undefined) {
      updatePayload.property_sqft =
        property_sqft !== null ? Number(property_sqft) : null;
    }
    if (property_bedrooms !== undefined) {
      updatePayload.property_bedrooms =
        property_bedrooms !== null ? Number(property_bedrooms) : null;
    }
    if (property_bathrooms !== undefined) {
      updatePayload.property_bathrooms =
        property_bathrooms !== null ? Number(property_bathrooms) : null;
    }
    if (property_year_built !== undefined) {
      updatePayload.property_year_built =
        property_year_built !== null ? Number(property_year_built) : null;
    }
    if (property_estimated_value !== undefined) {
      updatePayload.property_estimated_value =
        property_estimated_value !== null
          ? Number(property_estimated_value)
          : null;
    }

    if (roof_material !== undefined) {
      updatePayload.roof_material = roof_material || null;
    }
    if (roof_last_replacement_year !== undefined) {
      updatePayload.roof_last_replacement_year =
        roof_last_replacement_year !== null
          ? Number(roof_last_replacement_year)
          : null;
    }
    if (roof_age_estimated !== undefined) {
      updatePayload.roof_age_estimated =
        roof_age_estimated !== null ? Number(roof_age_estimated) : null;
    }

    // 3) Update conversation with property & roof data
    const { data: updatedThread, error: updateError } = await supabase
      .from("inbox_threads")
      .update(updatePayload)
      .eq("id", conversation_id)
      .select()
      .single();

    if (updateError) {
      console.error("Property profile update error", updateError);
      return NextResponse.json(
        { error: "Failed to update property & roof profile" },
        { status: 500 }
      );
    }

    // 4) Log activity (simple)
    const { error: logError } = await supabase.from("inbox_activity_log").insert({
      thread_id: conversation_id,
      campaign_id: thread.campaign_id,
      user_id: user.id,
      type: "property",
      title: "Property & roof info updated",
      body: null,
      meta: {
        property_sqft: updatePayload.property_sqft ?? null,
        property_year_built: updatePayload.property_year_built ?? null,
        roof_material: updatePayload.roof_material ?? null,
        roof_age_estimated: updatePayload.roof_age_estimated ?? null,
      },
    });

    if (logError) {
      console.error("Property profile activity error", logError);
      // not fatal for API consumer
    }

    return NextResponse.json({ conversation: updatedThread });
  } catch (error: any) {
    console.error("Error in property-profile route:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

















































