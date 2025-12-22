// Block 96000 — Auto-Personalization Engine v1: Home Data Enrichment
// Enriches homeowner addresses with year built, roof type, home age, and neighborhood cues

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4.56.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const openaiApiKey = Deno.env.get("OPENAI_API_KEY")!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const openai = new OpenAI({ apiKey: openaiApiKey });

serve(async (req) => {
  try {
    const { address, city, state, zip } = await req.json();

    if (!address) {
      return new Response(
        JSON.stringify({ error: "address is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // 1. Check cache first
    const normalizedAddress = address.trim().toLowerCase();
    const normalizedCity = city?.trim() || null;
    const normalizedState = state?.trim() || null;
    const normalizedZip = zip?.trim() || null;
    
    // Build query with conditional filters
    let cacheQuery = supabase
      .from("home_data_cache")
      .select("*")
      .eq("address", normalizedAddress);
    
    if (normalizedCity) {
      cacheQuery = cacheQuery.eq("city", normalizedCity);
    } else {
      cacheQuery = cacheQuery.is("city", null);
    }
    
    if (normalizedState) {
      cacheQuery = cacheQuery.eq("state", normalizedState);
    } else {
      cacheQuery = cacheQuery.is("state", null);
    }
    
    if (normalizedZip) {
      cacheQuery = cacheQuery.eq("zip", normalizedZip);
    } else {
      cacheQuery = cacheQuery.is("zip", null);
    }
    
    const { data: cached, error: cacheError } = await cacheQuery.maybeSingle();

    if (cached && !cacheError) {
      return new Response(
        JSON.stringify(cached),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // 2. AI Extraction (year built + roof type from public context)
    const currentYear = new Date().getFullYear();
    
    const prompt = `You are a real estate + roofing data assistant.

Estimate the following for a home at:
Address: ${address}
City: ${city || "Unknown"}
State: ${state || "Unknown"}
ZIP: ${zip || "Unknown"}

Provide realistic estimates based on:
- Typical construction patterns for ${state || "this region"}
- Common roof types in ${city || "this area"}, ${state || ""}
- Neighborhood characteristics
- Typical home ages in similar areas

IMPORTANT RULES:
- Do NOT make up impossible data
- If you cannot determine, use null
- Keep estimates realistic for the region
- For year_built, use a reasonable range (e.g., 1980-2000 for older neighborhoods, 2000-2015 for newer)
- For roof_type, use common types: "asphalt shingle", "tile", "metal", "flat", "slate", "wood shake"
- For neighborhood, provide 1-2 local cues (street names, landmarks, area names)

Return ONLY valid JSON in this exact format:
{
  "year_built": 1998,
  "roof_type": "asphalt shingle",
  "last_sale_year": null,
  "neighborhood": "near 4th Ave NE, residential area"
}

If you cannot determine a value, use null.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3, // Lower temperature for more consistent data
      max_tokens: 300,
      response_format: { type: "json_object" },
    });

    const responseText = completion.choices[0]?.message?.content;
    if (!responseText) {
      // Fallback: return minimal data
      return new Response(
        JSON.stringify({
          address: normalizedAddress,
          city: city || null,
          state: state || null,
          zip: zip || null,
          year_built: null,
          roof_type: null,
          last_sale_year: null,
          est_home_age: null,
          neighborhood: null,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    let parsed;
    try {
      parsed = JSON.parse(responseText);
    } catch (e) {
      console.error("Failed to parse AI response:", responseText);
      // Fallback
      parsed = {
        year_built: null,
        roof_type: null,
        last_sale_year: null,
        neighborhood: null,
      };
    }

    const year_built = parsed.year_built ? parseInt(parsed.year_built) : null;
    const est_home_age = year_built ? currentYear - year_built : null;

    // 3. Insert into cache
    const { data: saved, error: insertError } = await supabase
      .from("home_data_cache")
      .insert({
        address: normalizedAddress,
        city: city || null,
        state: state || null,
        zip: zip || null,
        year_built,
        roof_type: parsed.roof_type || null,
        last_sale_year: parsed.last_sale_year ? parseInt(parsed.last_sale_year) : null,
        est_home_age,
        neighborhood: parsed.neighborhood || null,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error inserting into cache:", insertError);
      // Return the data even if cache insert fails
      return new Response(
        JSON.stringify({
          address: normalizedAddress,
          city: city || null,
          state: state || null,
          zip: zip || null,
          year_built,
          roof_type: parsed.roof_type || null,
          last_sale_year: parsed.last_sale_year ? parseInt(parsed.last_sale_year) : null,
          est_home_age,
          neighborhood: parsed.neighborhood || null,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify(saved),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in enrichHomeData:", error);
    return new Response(
      JSON.stringify({
        error: error.message || "Internal server error",
        stack: error.stack,
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});


























