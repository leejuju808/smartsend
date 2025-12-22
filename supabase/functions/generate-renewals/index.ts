// Block 26720 — SmartSend Roofing Renewal & Maintenance Route Engine v1
// Edge Function: Generate Renewal Opportunities
// Triggered monthly or on job completion to create renewal opportunities

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req: Request) => {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Parse request body (optional workspace_id filter)
    let workspaceId: string | null = null;
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      workspaceId = body.workspace_id || null;
    }
    
    // 1) Generate renewal opportunities for roofs that are due
    const { data: renewalData, error: renewalError } = await supabase.rpc(
      "generate_renewal_opportunities",
      {
        p_workspace_id: workspaceId,
        p_lookback_years: 2 // Look back 2 years past due date
      }
    );
    
    if (renewalError) {
      console.error("Error generating renewal opportunities:", renewalError);
      return new Response(
        JSON.stringify({ error: renewalError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
    
    // 2) Generate seasonal maintenance opportunities
    const currentMonth = new Date().getMonth() + 1; // 1-12
    let season: string | null = null;
    
    // March = spring, September = fall
    if (currentMonth >= 1 && currentMonth <= 5) {
      season = "spring";
    } else if (currentMonth >= 6 && currentMonth <= 12) {
      season = "fall";
    }
    
    let maintenanceCount = 0;
    if (season) {
      const { data: maintenanceData, error: maintenanceError } = await supabase.rpc(
        "generate_seasonal_maintenance_opportunities",
        {
          p_workspace_id: workspaceId,
          p_season: season
        }
      );
      
      if (maintenanceError) {
        console.error("Error generating maintenance opportunities:", maintenanceError);
      } else {
        maintenanceCount = maintenanceData || 0;
      }
    }
    
    const renewalCount = renewalData || 0;
    
    return new Response(
      JSON.stringify({
        success: true,
        message: "Renewal opportunities generated",
        renewal_opportunities_created: renewalCount,
        maintenance_opportunities_created: maintenanceCount,
        season: season || "none"
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Unknown error",
        success: false
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
});



































