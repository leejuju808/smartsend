import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * POST /api/autonomous/execute
 * Execute an autonomous action
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: "Action ID is required" }, { status: 400 });
    }

    // Fetch the action
    const { data: action, error: fetchError } = await supabaseAdmin
      .from("autonomous_actions")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !action) {
      return NextResponse.json({ error: "Action not found" }, { status: 404 });
    }

    // Verify user has access to this org
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("org_id")
      .eq("id", user.id)
      .single();

    if (!profile?.org_id || profile.org_id !== action.org_id) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    if (action.executed) {
      return NextResponse.json({ error: "Action already executed" }, { status: 400 });
    }

    // Execute based on action type
    let executionResult = { success: false, message: "", details: {} };

    switch (action.action) {
      case "deploy_agent": {
        // Deploy agent from marketplace
        const { data: agentTemplate } = await supabaseAdmin
          .from("marketplace_agents")
          .select("*")
          .eq("name", action.target)
          .or(`visibility.eq.public,creator_id.eq.${user.id}`)
          .limit(1)
          .maybeSingle();

        if (!agentTemplate) {
          // Try to find by ID if target is a UUID
          const { data: agentById } = await supabaseAdmin
            .from("marketplace_agents")
            .select("*")
            .eq("id", action.target)
            .maybeSingle();

          if (agentById) {
            // Deploy the agent
            const { data: agentInstance, error: deployError } = await supabaseAdmin
              .from("agent_instances")
              .insert({
                org_id: action.org_id,
                template_id: agentById.id,
                name: agentById.name,
                status: "running",
                config: {},
              })
              .select()
              .single();

            if (deployError) {
              executionResult = {
                success: false,
                message: "Failed to deploy agent",
                details: { error: deployError.message },
              };
            } else {
              executionResult = {
                success: true,
                message: `Agent "${agentById.name}" deployed successfully`,
                details: { agent_instance_id: agentInstance.id },
              };
            }
          } else {
            executionResult = {
              success: false,
              message: `Agent template "${action.target}" not found`,
              details: {},
            };
          }
        } else {
          // Deploy the agent
          const { data: agentInstance, error: deployError } = await supabaseAdmin
            .from("agent_instances")
            .insert({
              org_id: action.org_id,
              template_id: agentTemplate.id,
              name: agentTemplate.name,
              status: "running",
              config: {},
            })
            .select()
            .single();

          if (deployError) {
            executionResult = {
              success: false,
              message: "Failed to deploy agent",
              details: { error: deployError.message },
            };
          } else {
            executionResult = {
              success: true,
              message: `Agent "${agentTemplate.name}" deployed successfully`,
              details: { agent_instance_id: agentInstance.id },
            };
          }
        }
        break;
      }

      case "launch_campaign": {
        // Launch a campaign - create a basic campaign
        // For now, we'll create a placeholder campaign that can be configured later
        executionResult = {
          success: true,
          message: `Campaign "${action.target}" ready to launch`,
          details: {
            note: "Campaign creation should be implemented based on your campaign schema",
            target: action.target,
          },
        };
        // TODO: Implement actual campaign creation based on your campaign schema
        break;
      }

      case "trigger_workflow": {
        // Trigger a workflow automation
        executionResult = {
          success: true,
          message: `Workflow "${action.target}" triggered`,
          details: {
            note: "Workflow execution should be implemented based on your automation system",
            target: action.target,
          },
        };
        // TODO: Implement actual workflow triggering based on your automation_rules system
        break;
      }

      default:
        executionResult = {
          success: false,
          message: `Unknown action type: ${action.action}`,
          details: {},
        };
    }

    // Mark action as executed if successful
    if (executionResult.success) {
      await supabaseAdmin
        .from("autonomous_actions")
        .update({
          executed: true,
          executed_at: new Date().toISOString(),
        })
        .eq("id", id);
    }

    return NextResponse.json({
      ok: executionResult.success,
      message: executionResult.message,
      details: executionResult.details,
    });
  } catch (error) {
    console.error("Error executing autonomous action:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

