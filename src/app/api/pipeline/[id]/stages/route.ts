import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { data: stages, error } = await sb
      .from("pipeline_stages")
      .select(`
        *,
        contacts (
          id,
          email,
          first_name,
          last_name,
          company,
          created_at
        )
      `)
      .eq("pipeline_id", params.id)
      .order("order_index");

    if (error) {
      console.error("Error fetching pipeline stages:", error);
      return NextResponse.json(
        { error: "Failed to fetch pipeline stages" },
        { status: 500 }
      );
    }

    // Block 269300 — SmartSend Standardization Sprint
    // If a pipeline has no stages yet, seed the only supported stages.
    if (!stages || stages.length === 0) {
      const seed = [
        { pipeline_id: params.id, name: "Hot", order_index: 1 },
        { pipeline_id: params.id, name: "Booked", order_index: 2 },
        { pipeline_id: params.id, name: "Closed", order_index: 3 },
      ];

      const { data: seeded, error: seedError } = await sb
        .from("pipeline_stages")
        .insert(seed)
        .select(`
          *,
          contacts (
            id,
            email,
            first_name,
            last_name,
            company,
            created_at
          )
        `)
        .order("order_index");

      if (seedError) {
        console.error("Error seeding pipeline stages:", seedError);
        return NextResponse.json(
          { error: "Failed to initialize pipeline stages" },
          { status: 500 }
        );
      }

      return NextResponse.json(seeded || []);
    }

    return NextResponse.json(stages || []);
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(
  _req: NextRequest,
  _ctx: { params: { id: string } }
) {
  try {
    // Block 269300 — SmartSend Standardization Sprint
    // Stages are standardized. No custom stages allowed.
    return NextResponse.json(
      { error: "Pipeline stages are standardized (Hot → Booked → Closed)." },
      { status: 405 }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
} 