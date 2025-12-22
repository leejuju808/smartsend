// Block 254300 — SmartSend Sales Acceleration Engine v1
// AI Roofing Estimator API
// POST /api/sales/estimator

import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

interface EstimateRequest {
  org_id: string;
  lead_id?: string;
  address?: string;
  squares: number;
  pitch: string; // e.g., "6/12", "8/12"
  layers: number;
  material_system: string; // "architectural_shingle", "metal", "tile", etc.
  region?: string;
  job_type?: string;
  created_by?: string; // sales_rep_id
  overhead_percent?: number;
  margin_percent?: number;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: EstimateRequest = await req.json();
    const {
      org_id,
      lead_id,
      address,
      squares,
      pitch,
      layers,
      material_system,
      region,
      job_type = "roof_replacement",
      created_by,
      overhead_percent = 15,
      margin_percent = 25,
    } = body;

    // Validate required fields
    if (!squares || !pitch || !material_system) {
      return NextResponse.json(
        { error: "Missing required fields: squares, pitch, material_system" },
        { status: 400 }
      );
    }

    // Parse pitch (e.g., "6/12" -> 6)
    const pitchValue = parseFloat(pitch.split("/")[0]) || 6;

    // Base pricing per square (varies by material and region)
    const basePricing: Record<string, { material: number; labor: number }> = {
      architectural_shingle: { material: 120, labor: 180 },
      three_tab_shingle: { material: 80, labor: 150 },
      metal: { material: 250, labor: 220 },
      tile: { material: 400, labor: 250 },
      slate: { material: 600, labor: 300 },
    };

    const pricing = basePricing[material_system] || basePricing.architectural_shingle;

    // Calculate base costs
    const materialCost = squares * pricing.material;
    const baseLaborCost = squares * pricing.labor;

    // Adjustments
    const pitchMultiplier = 1 + (pitchValue / 12) * 0.15; // 15% per pitch unit
    const layerMultiplier = layers > 1 ? 1.2 : 1.0; // 20% more for tear-off
    const laborCost = baseLaborCost * pitchMultiplier * layerMultiplier;

    // Overhead calculation
    const overhead = (materialCost + laborCost) * (overhead_percent / 100);

    // Subtotal before margin
    const subtotal = materialCost + laborCost + overhead;

    // Margin
    const margin = subtotal * (margin_percent / 100);

    // Total price
    const totalPrice = subtotal + margin;

    // AI Enhancement: Use AI to validate and suggest improvements
    let aiValidation: any = null;
    let aiBreakdown: any = null;

    try {
      const validationPrompt = `You are a roofing estimate expert. Analyze this estimate:

Job Details:
- Squares: ${squares}
- Pitch: ${pitch}
- Layers: ${layers}
- Material: ${material_system}
- Region: ${region || "unknown"}
- Job Type: ${job_type}

Cost Breakdown:
- Material Cost: $${materialCost.toFixed(2)}
- Labor Cost: $${laborCost.toFixed(2)}
- Overhead (${overhead_percent}%): $${overhead.toFixed(2)}
- Margin (${margin_percent}%): $${margin.toFixed(2)}
- Total: $${totalPrice.toFixed(2)}

Check for:
1. Price too low (material cost should be 50-70% of total)
2. Missing components (ridge vent, gutters, deck repairs)
3. Pitch mismatch warnings
4. Regional pricing adjustments needed

Return JSON:
{
  "warnings": ["warning1", "warning2"],
  "suggestions": ["suggestion1"],
  "recommended_price": ${totalPrice},
  "confidence": "high|medium|low"
}`;

      const aiResponse = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are a roofing estimate expert. Analyze estimates and provide validation warnings. Always return valid JSON.",
          },
          { role: "user", content: validationPrompt },
        ],
        temperature: 0.3,
        response_format: { type: "json_object" },
      });

      const aiContent = aiResponse.choices[0]?.message?.content;
      if (aiContent) {
        aiValidation = JSON.parse(aiContent);
      }
    } catch (aiError) {
      console.error("AI validation error:", aiError);
      // Continue without AI validation
    }

    // Create detailed breakdown
    const breakdown = {
      material_cost: materialCost,
      labor_cost: laborCost,
      overhead: overhead,
      margin: margin,
      subtotal: subtotal,
      total: totalPrice,
      line_items: [
        {
          description: `${material_system.replace(/_/g, " ")} - ${squares} squares`,
          quantity: squares,
          unit: "square",
          unit_cost: pricing.material,
          total: materialCost,
          category: "materials",
        },
        {
          description: `Labor - ${squares} squares @ ${pitch} pitch`,
          quantity: squares,
          unit: "square",
          unit_cost: pricing.labor * pitchMultiplier * layerMultiplier,
          total: laborCost,
          category: "labor",
        },
        {
          description: `Overhead (${overhead_percent}%)`,
          quantity: 1,
          unit: "each",
          unit_cost: overhead,
          total: overhead,
          category: "overhead",
        },
        {
          description: `Profit Margin (${margin_percent}%)`,
          quantity: 1,
          unit: "each",
          unit_cost: margin,
          total: margin,
          category: "margin",
        },
      ],
    };

    // Save estimate to database
    const { data: estimate, error: estimateError } = await supabase
      .from("estimates")
      .insert({
        org_id,
        lead_id: lead_id || null,
        job_type,
        squares,
        pitch,
        layers,
        material_system,
        region: region || null,
        price: totalPrice,
        breakdown,
        validation_warnings: aiValidation?.warnings || [],
        created_by: created_by || null,
      })
      .select()
      .single();

    if (estimateError) {
      console.error("Error saving estimate:", estimateError);
      return NextResponse.json(
        { error: "Failed to save estimate" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      estimate: {
        id: estimate.id,
        price: totalPrice,
        squares,
        pitch,
        layers,
        material_system,
        breakdown,
        validation: aiValidation,
        created_at: estimate.created_at,
      },
    });
  } catch (error: any) {
    console.error("Error in AI estimator:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}






















