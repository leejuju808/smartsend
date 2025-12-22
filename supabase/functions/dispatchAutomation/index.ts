// =========================================================
// Block 160000 — Automation Trigger Dispatcher
// This runs whenever an event happens in the system
// =========================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface AutomationEvent {
  type: string; // e.g. "lead.created", "lead.hot", "call.missed"
  data: Record<string, any>; // Event-specific data
  company_id?: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const event: AutomationEvent = await req.json();

    if (!event.type) {
      return new Response(
        JSON.stringify({ error: "Missing event.type" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[dispatchAutomation] Processing event: ${event.type}`);

    // Find all automations with matching triggers
    const { data: triggers, error: triggerError } = await supabase
      .from("automation_triggers")
      .select(`
        automation_id,
        automations!inner (
          id,
          company_id,
          is_active,
          automation_conditions (
            id,
            field,
            operator,
            value
          ),
          automation_actions (
            id,
            action_key,
            payload,
            action_order
          )
        )
      `)
      .eq("event_key", event.type);

    if (triggerError) {
      console.error("[dispatchAutomation] Error fetching triggers:", triggerError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch triggers", details: triggerError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!triggers || triggers.length === 0) {
      console.log(`[dispatchAutomation] No automations found for event: ${event.type}`);
      return new Response(
        JSON.stringify({ message: "No matching automations", processed: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Filter by company_id if provided
    let matchingAutomations = triggers.map((t) => t.automations).filter(Boolean);
    if (event.company_id) {
      matchingAutomations = matchingAutomations.filter(
        (a: any) => a.company_id === event.company_id && a.is_active
      );
    } else {
      matchingAutomations = matchingAutomations.filter((a: any) => a.is_active);
    }

    console.log(
      `[dispatchAutomation] Found ${matchingAutomations.length} active automations for event: ${event.type}`
    );

    const executionResults = [];

    // Process each matching automation
    for (const automation of matchingAutomations) {
      try {
        // Evaluate conditions
        const conditions = automation.automation_conditions || [];
        let passesConditions = true;

        if (conditions.length > 0) {
          passesConditions = evaluateConditions(conditions, event.data);
          console.log(
            `[dispatchAutomation] Automation ${automation.id} conditions: ${passesConditions ? "PASSED" : "FAILED"}`
          );
        }

        if (!passesConditions) {
          // Log skipped execution
          await supabase.from("automation_execution_logs").insert({
            automation_id: automation.id,
            event_key: event.type,
            event_data: event.data,
            execution_status: "skipped",
            error_message: "Conditions not met",
          });
          continue;
        }

        // Execute actions in order
        const actions = (automation.automation_actions || []).sort(
          (a: any, b: any) => (a.action_order || 0) - (b.action_order || 0)
        );

        const actionResults = [];

        for (const action of actions) {
          try {
            const result = await executeAction(action, event.data, automation.company_id);
            actionResults.push({
              action_id: action.id,
              action_key: action.action_key,
              status: result.success ? "success" : "failed",
              error: result.error,
            });
          } catch (error: any) {
            actionResults.push({
              action_id: action.id,
              action_key: action.action_key,
              status: "failed",
              error: error.message,
            });
          }
        }

        // Log successful execution
        await supabase.from("automation_execution_logs").insert({
          automation_id: automation.id,
          event_key: event.type,
          event_data: event.data,
          execution_status: "success",
          executed_actions: actionResults,
        });

        executionResults.push({
          automation_id: automation.id,
          status: "executed",
          actions_executed: actionResults.length,
        });
      } catch (error: any) {
        console.error(
          `[dispatchAutomation] Error processing automation ${automation.id}:`,
          error
        );

        // Log failed execution
        await supabase.from("automation_execution_logs").insert({
          automation_id: automation.id,
          event_key: event.type,
          event_data: event.data,
          execution_status: "failed",
          error_message: error.message,
        });

        executionResults.push({
          automation_id: automation.id,
          status: "failed",
          error: error.message,
        });
      }
    }

    return new Response(
      JSON.stringify({
        message: "Automations processed",
        event_type: event.type,
        processed: executionResults.length,
        results: executionResults,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[dispatchAutomation] Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ============================================================================
// Condition Evaluation Engine
// ============================================================================

function evaluateConditions(
  conditions: Array<{ field: string; operator: string; value: string }>,
  eventData: Record<string, any>
): boolean {
  for (const condition of conditions) {
    const fieldValue = getNestedValue(eventData, condition.field);
    const conditionValue = condition.value;

    let passes = false;

    switch (condition.operator) {
      case "=":
        passes = String(fieldValue) === String(conditionValue);
        break;
      case "!=":
        passes = String(fieldValue) !== String(conditionValue);
        break;
      case ">":
        passes = Number(fieldValue) > Number(conditionValue);
        break;
      case "<":
        passes = Number(fieldValue) < Number(conditionValue);
        break;
      case ">=":
        passes = Number(fieldValue) >= Number(conditionValue);
        break;
      case "<=":
        passes = Number(fieldValue) <= Number(conditionValue);
        break;
      case "contains":
        passes = String(fieldValue || "").toLowerCase().includes(String(conditionValue).toLowerCase());
        break;
      case "not_contains":
        passes = !String(fieldValue || "").toLowerCase().includes(String(conditionValue).toLowerCase());
        break;
      default:
        console.warn(`[dispatchAutomation] Unknown operator: ${condition.operator}`);
        passes = false;
    }

    if (!passes) {
      return false; // All conditions must pass (AND logic)
    }
  }

  return true;
}

// Helper to get nested values from object (e.g. "lead.heat_score" or "source")
function getNestedValue(obj: any, path: string): any {
  const parts = path.split(".");
  let value = obj;
  for (const part of parts) {
    if (value === null || value === undefined) {
      return null;
    }
    value = value[part];
  }
  return value;
}

// ============================================================================
// Action Executor
// ============================================================================

async function executeAction(
  action: { action_key: string; payload: any },
  eventData: Record<string, any>,
  companyId: string
): Promise<{ success: boolean; error?: string }> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    switch (action.action_key) {
      case "send_sms": {
        const message = action.payload.message || "";
        const phone = eventData.phone || eventData.homeowner_phone || eventData.lead_phone;

        if (!phone) {
          return { success: false, error: "No phone number in event data" };
        }

        // Call Next.js API route for SMS (adjust URL based on your deployment)
        const apiUrl = Deno.env.get("NEXT_PUBLIC_SITE_URL") || "http://localhost:3000";
        const response = await fetch(`${apiUrl}/api/sms/send`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            to: phone,
            message: message,
            company_id: companyId,
          }),
        });

        if (!response.ok) {
          const error = await response.text();
          return { success: false, error: `SMS send failed: ${error}` };
        }

        return { success: true };
      }

      case "send_email": {
        const subject = action.payload.subject || "";
        const body = action.payload.body || "";
        const to = eventData.email || eventData.homeowner_email || eventData.lead_email;

        if (!to) {
          return { success: false, error: "No email address in event data" };
        }

        // Call internal email API (you'll need to implement this or use existing)
        // For now, we'll log it
        console.log(`[dispatchAutomation] Would send email to ${to}: ${subject}`);

        // TODO: Implement actual email sending via your email service
        return { success: true };
      }

      case "assign_to_user": {
        const userId = action.payload.user_id;
        const leadId = eventData.lead_id || eventData.id;

        if (!userId || !leadId) {
          return { success: false, error: "Missing user_id or lead_id" };
        }

        // Update lead assignment
        const { error } = await supabase
          .from("leads")
          .update({ assigned_to_user_id: userId })
          .eq("id", leadId);

        if (error) {
          return { success: false, error: error.message };
        }

        return { success: true };
      }

      case "schedule_followup": {
        const hours = action.payload.hours || 24;
        const leadId = eventData.lead_id || eventData.id;

        if (!leadId) {
          return { success: false, error: "Missing lead_id" };
        }

        const followupDate = new Date();
        followupDate.setHours(followupDate.getHours() + hours);

        // Create followup task or scheduled action
        // This depends on your followup system structure
        const { error } = await supabase.from("tasks").insert({
          lead_id: leadId,
          type: "followup",
          due_at: followupDate.toISOString(),
          company_id: companyId,
        });

        if (error) {
          return { success: false, error: error.message };
        }

        return { success: true };
      }

      case "auto_book_appointment": {
        const leadId = eventData.lead_id || eventData.id;
        const homeownerName = eventData.name || eventData.homeowner_name || "Homeowner";
        const homeownerEmail = eventData.email || eventData.homeowner_email;
        const homeownerPhone = eventData.phone || eventData.homeowner_phone;
        const propertyAddress = eventData.address || eventData.property_address;

        if (!homeownerEmail || !propertyAddress) {
          return { success: false, error: "Missing required fields for appointment booking" };
        }

        // Call Next.js API route for booking (adjust URL based on your deployment)
        const apiUrl = Deno.env.get("NEXT_PUBLIC_SITE_URL") || "http://localhost:3000";
        const response = await fetch(`${apiUrl}/api/scheduler/book`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-workspace-id": companyId, // Adjust based on your auth structure
          },
          body: JSON.stringify({
            appointment_type: action.payload.appointment_type || "roof_inspection",
            start_time: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Tomorrow
            homeowner_name: homeownerName,
            homeowner_email: homeownerEmail,
            homeowner_phone: homeownerPhone,
            property_address: propertyAddress,
          }),
        });

        if (!response.ok) {
          const error = await response.text();
          return { success: false, error: `Appointment booking failed: ${error}` };
        }

        return { success: true };
      }

      case "notify_owner": {
        // Get company owner
        const { data: company } = await supabase
          .from("roofing_companies")
          .select("owner_id")
          .eq("id", companyId)
          .single();

        if (!company) {
          return { success: false, error: "Company not found" };
        }

        const message = action.payload.message || "Automation triggered";
        const notification = {
          user_id: company.owner_id,
          type: "automation_triggered",
          title: action.payload.title || "Automation Alert",
          message: message,
          metadata: eventData,
        };

        // Create notification (depends on your notification system)
        const { error } = await supabase.from("notifications").insert(notification);

        if (error) {
          return { success: false, error: error.message };
        }

        return { success: true };
      }

      case "move_to_stage": {
        const leadId = eventData.lead_id || eventData.id;
        const stageName = action.payload.stage_name;

        if (!leadId || !stageName) {
          return { success: false, error: "Missing lead_id or stage_name" };
        }

        // Update lead status/stage
        const { error } = await supabase
          .from("leads")
          .update({ status: stageName })
          .eq("id", leadId);

        if (error) {
          return { success: false, error: error.message };
        }

        return { success: true };
      }

      default:
        return { success: false, error: `Unknown action: ${action.action_key}` };
    }
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}


























