// API route to seed automation templates for a company
// POST /api/automations/templates

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const body = await req.json();

    const { company_id } = body;

    if (!company_id) {
      return NextResponse.json(
        { error: "company_id is required" },
        { status: 400 }
      );
    }

    // Call the database function to seed templates
    const { data, error } = await supabase.rpc(
      "seed_automation_templates_for_company",
      { p_company_id: company_id }
    );

    if (error) {
      console.error("Error seeding templates:", error);
      return NextResponse.json(
        { error: "Failed to seed templates", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: "Automation templates seeded successfully",
    });
  } catch (error: any) {
    console.error("Unexpected error in POST /api/automations/templates:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}


























