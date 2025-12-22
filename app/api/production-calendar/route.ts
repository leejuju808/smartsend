// Block 25980 — SmartSend Roofing Production Calendar v1
// GET /api/production-calendar
// Returns production calendar data (jobs, crews, materials) for the current workspace

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace";

export type ProductionCalendarEvent = {
  id: string;
  type: "job" | "crew" | "material_delivery";
  slot_id?: string;
  job_id?: string;
  crew_id?: string;
  delivery_id?: string;
  
  // Common fields
  start_date: string; // ISO date
  end_date: string; // ISO date
  status: string;
  workspace_id: string;
  market_id?: string;
  market_name?: string;
  
  // Job fields
  job_title?: string;
  homeowner_name?: string;
  job_address?: string;
  roof_squares?: number;
  roof_pitch?: number;
  complexity_factor?: number;
  job_type?: string;
  material_status?: string;
  material_expected_date?: string;
  
  // Crew fields
  crew_name?: string;
  foreman_name?: string;
  foreman_phone?: string;
  capacity_squares_per_day?: number;
  crew_skill_tags?: string[];
  jobs_on_date?: number;
  total_squares_on_date?: number;
  total_hours_on_date?: number;
  
  // Weather fields
  weather_risk_score?: number;
  weather_risk_category?: string;
  weather_recommendation?: string;
  
  // Conflict fields
  has_conflicts?: boolean;
  conflicts?: Array<{
    type: string;
    message: string;
    severity: string;
  }>;
  
  // Readiness fields
  is_job_ready?: boolean;
  job_readiness_score?: number;
  readiness_missing_items?: string[];
  
  // Material delivery fields
  delivery_date?: string;
  delivery_window_start?: string;
  delivery_window_end?: string;
  delivery_type?: string;
  supplier_name?: string;
  po_status?: string;
  delivery_confirmed?: boolean;
  material_items?: Array<{
    description: string;
    quantity: number;
    unit: string;
  }>;
  
  // Visual fields
  color_code?: string;
  estimated_duration_hours?: number;
  travel_distance_miles?: number;
};

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Get workspace ID
    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      );
    }

    // Get query parameters
    const searchParams = req.nextUrl.searchParams;
    const startDate = searchParams.get("start_date") || new Date().toISOString().split("T")[0];
    const endDate = searchParams.get("end_date") || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const marketId = searchParams.get("market_id"); // Optional market filter
    const viewType = searchParams.get("view") || "job"; // "job", "crew", "material", or "all"
    const crewId = searchParams.get("crew_id"); // Optional crew filter
    
    const events: ProductionCalendarEvent[] = [];

    // Fetch Job Calendar events
    if (viewType === "job" || viewType === "all") {
      let jobQuery = supabase
        .from("v_job_calendar")
        .select("*")
        .eq("workspace_id", workspaceId)
        .gte("start_date", startDate)
        .lte("end_date", endDate)
        .order("start_date", { ascending: true });

      if (marketId) {
        jobQuery = jobQuery.eq("market_id", marketId);
      }

      if (crewId) {
        jobQuery = jobQuery.eq("crew_id", crewId);
      }

      const { data: jobEvents, error: jobError } = await jobQuery;

      if (jobError) {
        console.error("Error fetching job calendar:", jobError);
      } else if (jobEvents) {
        events.push(
          ...jobEvents.map((event: any) => ({
            id: event.slot_id,
            type: "job" as const,
            slot_id: event.slot_id,
            job_id: event.job_id,
            crew_id: event.crew_id,
            start_date: event.start_date,
            end_date: event.end_date,
            status: event.slot_status,
            workspace_id: event.workspace_id,
            market_id: event.market_id,
            market_name: event.market_name,
            job_title: event.job_title,
            homeowner_name: event.homeowner_name,
            job_address: event.job_address,
            roof_squares: event.roof_squares,
            roof_pitch: event.roof_pitch,
            complexity_factor: event.complexity_factor,
            job_type: event.job_type,
            material_status: event.material_status,
            material_expected_date: event.material_expected_date,
            crew_name: event.crew_name,
            foreman_name: event.foreman_name,
            foreman_phone: event.foreman_phone,
            capacity_squares_per_day: event.capacity_squares_per_day,
            crew_skill_tags: event.crew_skill_tags,
            weather_risk_score: event.weather_risk_score || event.latest_weather_risk_score,
            weather_risk_category: event.weather_risk_category || event.latest_weather_risk_category,
            weather_recommendation: event.weather_recommendation,
            has_conflicts: event.has_conflicts,
            is_job_ready: event.is_job_ready,
            job_readiness_score: event.job_readiness_score || event.readiness_score,
            readiness_missing_items: event.readiness_missing_items,
            color_code: event.color_code,
            estimated_duration_hours: event.estimated_duration_hours,
            travel_distance_miles: event.travel_distance_miles,
          }))
        );
      }
    }

    // Fetch Crew Calendar events
    if (viewType === "crew" || viewType === "all") {
      let crewQuery = supabase
        .from("v_crew_calendar")
        .select("*")
        .eq("workspace_id", workspaceId)
        .gte("start_date", startDate)
        .lte("end_date", endDate)
        .order("start_date", { ascending: true });

      if (marketId) {
        crewQuery = crewQuery.eq("market_id", marketId);
      }

      if (crewId) {
        crewQuery = crewQuery.eq("crew_id", crewId);
      }

      const { data: crewEvents, error: crewError } = await crewQuery;

      if (crewError) {
        console.error("Error fetching crew calendar:", crewError);
      } else if (crewEvents) {
        // Group by crew and date to avoid duplicates
        const crewMap = new Map<string, ProductionCalendarEvent>();
        
        crewEvents.forEach((event: any) => {
          const key = `${event.crew_id}-${event.start_date}`;
          if (!crewMap.has(key)) {
            crewMap.set(key, {
              id: `crew-${event.crew_id}-${event.start_date}`,
              type: "crew" as const,
              crew_id: event.crew_id,
              start_date: event.start_date,
              end_date: event.end_date,
              status: event.status,
              workspace_id: event.workspace_id,
              market_id: event.market_id,
              market_name: event.market_name,
              crew_name: event.crew_name,
              capacity_squares_per_day: event.capacity_squares_per_day,
              crew_skill_tags: event.skill_tags,
              jobs_on_date: event.jobs_on_date,
              total_squares_on_date: event.total_squares_on_date,
              total_hours_on_date: event.total_hours_on_date,
            });
          }
        });
        
        events.push(...Array.from(crewMap.values()));
      }
    }

    // Fetch Material Delivery Calendar events
    if (viewType === "material" || viewType === "all") {
      let materialQuery = supabase
        .from("v_material_delivery_calendar")
        .select("*")
        .eq("workspace_id", workspaceId)
        .gte("delivery_date", startDate)
        .lte("delivery_date", endDate)
        .order("delivery_date", { ascending: true });

      if (marketId) {
        // Note: material_deliveries might not have market_id directly
        // This would need to be joined through jobs if needed
      }

      const { data: materialEvents, error: materialError } = await materialQuery;

      if (materialError) {
        console.error("Error fetching material calendar:", materialError);
      } else if (materialEvents) {
        events.push(
          ...materialEvents.map((event: any) => ({
            id: event.delivery_id,
            type: "material_delivery" as const,
            delivery_id: event.delivery_id,
            job_id: event.job_id,
            start_date: event.delivery_date,
            end_date: event.delivery_date,
            status: event.delivery_status,
            workspace_id: event.workspace_id,
            delivery_date: event.delivery_date,
            delivery_window_start: event.delivery_window_start,
            delivery_window_end: event.delivery_window_end,
            delivery_type: event.delivery_type,
            supplier_name: event.supplier_name || event.supplier_full_name,
            po_status: event.po_status,
            delivery_confirmed: event.delivery_confirmed,
            has_conflicts: event.has_conflicts,
            conflict_message: event.conflict_message,
            job_title: event.job_title,
            homeowner_name: event.homeowner_name,
            job_address: event.job_address,
            material_items: event.material_items,
          }))
        );
      }
    }

    return NextResponse.json({
      events,
      date_range: {
        start_date: startDate,
        end_date: endDate,
      },
      filters: {
        market_id: marketId || null,
        view_type: viewType,
        crew_id: crewId || null,
      },
    });
  } catch (error: any) {
    console.error("Error in production calendar API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}




































