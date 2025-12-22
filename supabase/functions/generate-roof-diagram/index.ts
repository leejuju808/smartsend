// Block 41200 — SmartSend Roofing "AI Roof Measurement + Diagram Engine" v1
// Edge Function: Generate Roof Diagram (SVG)
// POST /functions/v1/generate-roof-diagram

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

serve(async (req) => {
  try {
    // CORS headers
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    }

    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { job_id, measurement_id } = await req.json();

    if (!job_id && !measurement_id) {
      return new Response(
        JSON.stringify({ error: "job_id or measurement_id is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get measurement data
    let measurement;
    if (measurement_id) {
      const { data, error } = await supabase
        .from("roof_measurements")
        .select("*")
        .eq("id", measurement_id)
        .single();

      if (error || !data) {
        return new Response(
          JSON.stringify({ error: "Measurement not found" }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        );
      }
      measurement = data;
    } else {
      const { data, error } = await supabase
        .from("roof_measurements")
        .select("*")
        .eq("job_id", job_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (error || !data) {
        return new Response(
          JSON.stringify({ error: "No measurement found for this job" }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        );
      }
      measurement = data;
    }

    // Generate SVG diagram
    // This is a simplified diagram - in production, you'd use more sophisticated geometry
    const width = 800;
    const height = 600;
    const padding = 50;

    // Calculate approximate roof dimensions based on squares
    // Assuming a rectangular roof for simplicity
    const totalSqFt = (measurement.squares || 0) * 100;
    const aspectRatio = 1.5; // width/height ratio
    const roofWidth = Math.sqrt(totalSqFt * aspectRatio);
    const roofHeight = totalSqFt / roofWidth;

    // Scale to fit in diagram
    const scale = Math.min(
      (width - padding * 2) / roofWidth,
      (height - padding * 2) / roofHeight
    ) * 0.8;

    const scaledWidth = roofWidth * scale;
    const scaledHeight = roofHeight * scale;
    const centerX = width / 2;
    const centerY = height / 2;

    // Generate SVG
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <!-- Background -->
  <rect width="${width}" height="${height}" fill="#f8f9fa"/>
  
  <!-- Title -->
  <text x="${width / 2}" y="30" font-family="Arial, sans-serif" font-size="20" font-weight="bold" text-anchor="middle" fill="#333">
    Roof Measurement Diagram
  </text>
  
  <!-- Roof outline -->
  <rect 
    x="${centerX - scaledWidth / 2}" 
    y="${centerY - scaledHeight / 2}" 
    width="${scaledWidth}" 
    height="${scaledHeight}" 
    fill="#e3f2fd" 
    stroke="#1976d2" 
    stroke-width="3"
    rx="5"
  />
  
  <!-- Ridge line (if present) -->
  ${measurement.ridge_length ? `
  <line 
    x1="${centerX - scaledWidth / 2}" 
    y1="${centerY - scaledHeight / 2 + scaledHeight * 0.3}" 
    x2="${centerX + scaledWidth / 2}" 
    y2="${centerY - scaledHeight / 2 + scaledHeight * 0.3}" 
    stroke="#d32f2f" 
    stroke-width="4"
    stroke-dasharray="5,5"
  />
  <text x="${centerX}" y="${centerY - scaledHeight / 2 + scaledHeight * 0.3 - 10}" font-family="Arial, sans-serif" font-size="12" text-anchor="middle" fill="#d32f2f" font-weight="bold">
    Ridge: ${measurement.ridge_length} ft
  </text>
  ` : ''}
  
  <!-- Eaves label -->
  <text x="${centerX}" y="${centerY + scaledHeight / 2 + 20}" font-family="Arial, sans-serif" font-size="12" text-anchor="middle" fill="#333">
    Eaves: ${measurement.eaves_length || 0} ft
  </text>
  
  <!-- Rakes labels -->
  <text x="${centerX - scaledWidth / 2 - 10}" y="${centerY}" font-family="Arial, sans-serif" font-size="12" text-anchor="end" fill="#333" transform="rotate(-90 ${centerX - scaledWidth / 2 - 10} ${centerY})">
    Rakes: ${measurement.rakes_length || 0} ft
  </text>
  
  <!-- Hips (if present) -->
  ${measurement.hips_length ? `
  <line 
    x1="${centerX - scaledWidth / 2 + scaledWidth * 0.2}" 
    y1="${centerY - scaledHeight / 2}" 
    x2="${centerX}" 
    y2="${centerY + scaledHeight / 2}" 
    stroke="#388e3c" 
    stroke-width="3"
    stroke-dasharray="3,3"
  />
  <text x="${centerX - scaledWidth / 2 + scaledWidth * 0.1}" y="${centerY + 5}" font-family="Arial, sans-serif" font-size="11" fill="#388e3c">
    Hips: ${measurement.hips_length} ft
  </text>
  ` : ''}
  
  <!-- Valleys (if present) -->
  ${measurement.valleys_length ? `
  <line 
    x1="${centerX + scaledWidth / 2 - scaledWidth * 0.2}" 
    y1="${centerY - scaledHeight / 2}" 
    x2="${centerX}" 
    y2="${centerY + scaledHeight / 2}" 
    stroke="#f57c00" 
    stroke-width="3"
    stroke-dasharray="3,3"
  />
  <text x="${centerX + scaledWidth / 2 - scaledWidth * 0.1}" y="${centerY + 5}" font-family="Arial, sans-serif" font-size="11" fill="#f57c00">
    Valleys: ${measurement.valleys_length} ft
  </text>
  ` : ''}
  
  <!-- Penetrations -->
  ${measurement.penetrations && Array.isArray(measurement.penetrations) ? measurement.penetrations.map((p: any, i: number) => `
  <circle 
    cx="${centerX - scaledWidth / 4 + (i * scaledWidth / 4)}" 
    cy="${centerY - scaledHeight / 4}" 
    r="8" 
    fill="#9c27b0" 
    stroke="#fff" 
    stroke-width="2"
  />
  <text x="${centerX - scaledWidth / 4 + (i * scaledWidth / 4)}" y="${centerY - scaledHeight / 4 + 25}" font-family="Arial, sans-serif" font-size="10" text-anchor="middle" fill="#9c27b0">
    ${p.type || 'penetration'}
  </text>
  `).join('') : ''}
  
  <!-- Measurements summary box -->
  <rect 
    x="${width - 250}" 
    y="${height - 200}" 
    width="220" 
    height="150" 
    fill="#fff" 
    stroke="#333" 
    stroke-width="2"
    rx="5"
  />
  <text x="${width - 240}" y="${height - 180}" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="#333">
    Measurements
  </text>
  <text x="${width - 240}" y="${height - 160}" font-family="Arial, sans-serif" font-size="11" fill="#666">
    Squares: ${measurement.squares || 0}
  </text>
  <text x="${width - 240}" y="${height - 145}" font-family="Arial, sans-serif" font-size="11" fill="#666">
    Pitch: ${measurement.pitch || 'N/A'}
  </text>
  <text x="${width - 240}" y="${height - 130}" font-family="Arial, sans-serif" font-size="11" fill="#666">
    Confidence: ${Math.round((measurement.confidence || 0) * 100)}%
  </text>
  <text x="${width - 240}" y="${height - 115}" font-family="Arial, sans-serif" font-size="11" fill="#666">
    Waste Factor: ${Math.round((measurement.waste_factor || 0.1) * 100)}%
  </text>
</svg>`;

    // Upload SVG to storage
    const fileName = `diagrams/${measurement.job_id || 'unknown'}/${measurement.id}.svg`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("roof-diagrams")
      .upload(fileName, svg, {
        contentType: "image/svg+xml",
        upsert: true,
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      return new Response(
        JSON.stringify({ error: "Failed to upload diagram", details: uploadError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from("roof-diagrams")
      .getPublicUrl(fileName);

    // Update measurement with diagram URL
    const { error: updateError } = await supabase
      .from("roof_measurements")
      .update({ diagram_url: urlData.publicUrl })
      .eq("id", measurement.id);

    if (updateError) {
      console.error("Update error:", updateError);
      // Don't fail, diagram was uploaded successfully
    }

    return new Response(
      JSON.stringify({
        ok: true,
        diagramUrl: urlData.publicUrl,
        measurement_id: measurement.id,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (error: any) {
    console.error("Error in generate-roof-diagram function:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});
































