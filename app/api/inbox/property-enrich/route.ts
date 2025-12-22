// Block 20300 — Property Enrichment & Roof Age Guess API

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// ======== Provider Stub (swap this for real provider) =========

type EnrichedProperty = {
  sqft?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  year_built?: number | null;
  estimated_value?: number | null;
  roof_last_replacement_year?: number | null;
};

async function fetchPropertyEnrichmentFromProvider(args: {
  address_line?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}): Promise<{ provider: string; data: EnrichedProperty; raw?: any; error?: string }> {
  const { address_line, city, state, zip } = args;

  // TODO: Replace this mock with a real provider call
  // Example integration:
  // const resp = await fetch("https://api.estated.com/... ", { ... });
  // parse resp into EnrichedProperty shape.

  if (!address_line && !city && !state && !zip) {
    return {
      provider: "mock",
      data: {},
      error: "Missing address fields for enrichment",
    };
  }

  // Simple mock to keep the wiring complete
  return {
    provider: "mock",
    data: {
      sqft: 2200,
      bedrooms: 3,
      bathrooms: 2,
      year_built: 1998,
      estimated_value: 475000,
      roof_last_replacement_year: 2010,
    },
    raw: {
      note: "Mock enrichment. Plug in real provider later.",
    },
  };
}

// ===============================================================

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
    const { conversation_id } = body;

    if (!conversation_id) {
      return NextResponse.json(
        { error: "conversation_id required" },
        { status: 400 }
      );
    }

    // 1) Load conversation address
    const { data: convo, error: convoErr } = await supabase
      .from("inbox_threads")
      .select(
        `
        id,
        property_address,
        city,
        state,
        zip,
        property_sqft,
        property_bedrooms,
        property_bathrooms,
        property_year_built,
        property_estimated_value,
        roof_last_replacement_year,
        roof_age_estimated
      `
      )
      .eq("id", conversation_id)
      .single();

    if (convoErr || !convo) {
      console.error("Property enrich convo error", convoErr);
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    // 2) Call provider stub
    const result = await fetchPropertyEnrichmentFromProvider({
      address_line: convo.property_address,
      city: convo.city,
      state: convo.state,
      zip: convo.zip,
    });

    const { provider, data, raw, error: providerError } = result;

    // 3) Compute updated roof age
    const nowYear = new Date().getFullYear();
    let roofAgeEstimated: number | null = convo.roof_age_estimated ?? null;

    if (data.roof_last_replacement_year) {
      roofAgeEstimated = Math.max(
        0,
        nowYear - Number(data.roof_last_replacement_year)
      );
    } else if (!roofAgeEstimated && data.year_built) {
      // fallback guess: roof is same age as house if nothing better
      roofAgeEstimated = Math.max(0, nowYear - Number(data.year_built));
    }

    const updatePayload: any = {};
    if (data.sqft != null) updatePayload.property_sqft = data.sqft;
    if (data.bedrooms != null) updatePayload.property_bedrooms = data.bedrooms;
    if (data.bathrooms != null)
      updatePayload.property_bathrooms = data.bathrooms;
    if (data.year_built != null)
      updatePayload.property_year_built = data.year_built;
    if (data.estimated_value != null)
      updatePayload.property_estimated_value = data.estimated_value;
    if (data.roof_last_replacement_year != null)
      updatePayload.roof_last_replacement_year = data.roof_last_replacement_year;
    if (roofAgeEstimated != null)
      updatePayload.roof_age_estimated = roofAgeEstimated;

    let updatedConvo = convo;

    if (Object.keys(updatePayload).length > 0) {
      const { data: updated, error: updateErr } = await supabase
        .from("inbox_threads")
        .update(updatePayload)
        .eq("id", conversation_id)
        .select()
        .single();

      if (updateErr) {
        console.error("Property enrich update error", updateErr);
        return NextResponse.json(
          { error: "Failed to update property profile with enrichment" },
          { status: 500 }
        );
      }
      updatedConvo = updated;
    }

    // 4) Log enrichment event
    const { error: logErr } = await supabase
      .from("property_enrichment_events")
      .insert({
        conversation_id,
        provider,
        status: providerError ? "error" : "success",
        message: providerError || null,
        raw_payload: raw ? raw : null,
      });

    if (logErr) {
      console.error("Property enrichment log error", logErr);
    }

    return NextResponse.json({
      conversation: updatedConvo,
      provider,
      error: providerError || null,
    });
  } catch (error: any) {
    console.error("Error in property-enrich route:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

















































