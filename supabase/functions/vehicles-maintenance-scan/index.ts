import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

/**
 * Block 55000 — SmartSend Roofing Vehicle Maintenance Scan Cron
 * 
 * Daily cron job that:
 * - Scans all vehicles for overdue maintenance
 * - Checks mileage thresholds
 * - Checks date-based maintenance
 * - Sends alerts for overdue items
 * 
 * Runs daily at 6 AM UTC
 */

serve(async (req) => {
  try {
    // Get all workspaces
    const { data: workspaces, error: workspacesError } = await supabase
      .from("workspaces")
      .select("id");

    if (workspacesError) {
      console.error("Error fetching workspaces:", workspacesError);
      return new Response(
        JSON.stringify({ error: workspacesError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const results = [];

    // Scan each workspace
    for (const workspace of workspaces || []) {
      try {
        // Get maintenance due for this workspace
        const { data: maintenanceDue, error: maintenanceError } = await supabase.rpc("check_maintenance_due");

        if (maintenanceError) {
          console.error(`Error checking maintenance for workspace ${workspace.id}:`, maintenanceError);
          continue;
        }

        // Filter by workspace
        const { data: vehicles } = await supabase
          .from("vehicles")
          .select("id, workspace_id")
          .eq("workspace_id", workspace.id);

        const vehicleIds = vehicles?.map(v => v.id) || [];
        const workspaceMaintenance = maintenanceDue?.filter((m: any) => 
          vehicleIds.includes(m.vehicle_id)
        ) || [];

        if (workspaceMaintenance.length > 0) {
          // Get workspace members who should be notified
          const { data: members } = await supabase
            .from("workspace_members")
            .select("user_id")
            .eq("workspace_id", workspace.id);

          // TODO: Send notifications/alerts to workspace owners
          // For now, just log the results
          results.push({
            workspace_id: workspace.id,
            maintenance_count: workspaceMaintenance.length,
            maintenance_items: workspaceMaintenance,
          });

          console.log(`Workspace ${workspace.id}: ${workspaceMaintenance.length} maintenance items due`);
        }
      } catch (error) {
        console.error(`Error processing workspace ${workspace.id}:`, error);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        scanned_workspaces: workspaces?.length || 0,
        results 
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Fatal error in maintenance scan:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
































