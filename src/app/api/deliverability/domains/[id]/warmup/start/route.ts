// Block 76000 — Start Domain Warm-Up
// Initializes warm-up schedule and begins sending warm-up emails

import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get domain
    const { data: domain, error: domainError } = await supabase
      .from("sending_domains")
      .select("*")
      .eq("id", params.id)
      .single();

    if (domainError || !domain) {
      return NextResponse.json(
        { error: "Domain not found" },
        { status: 404 }
      );
    }

    // Check if DNS is at least partially connected
    if (domain.dns_status === "not_connected") {
      return NextResponse.json(
        { error: "DNS records must be configured before starting warm-up" },
        { status: 400 }
      );
    }

    // Initialize warm-up schedule using database function
    const { error: scheduleError } = await supabase.rpc(
      "initialize_warmup_schedule",
      { p_domain_id: params.id }
    );

    if (scheduleError) throw scheduleError;

    // Get the schedule
    const { data: schedule } = await supabase
      .from("warmup_schedule")
      .select("*")
      .eq("domain_id", params.id)
      .order("day", { ascending: true });

    return NextResponse.json({
      success: true,
      message: "Warm-up started successfully",
      schedule,
    });
  } catch (error: any) {
    console.error("Warm-up start error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to start warm-up" },
      { status: 500 }
    );
  }
}



























