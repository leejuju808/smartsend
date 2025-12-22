import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * POST /api/marketplace/agents/deploy
 * Deploy a marketplace agent to user's SmartSend account
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { agent_id, user_id, org_id } = body;

    if (!agent_id || !user_id) {
      return NextResponse.json(
        { error: "Missing required fields: agent_id, user_id" },
        { status: 400 }
      );
    }

    // Get agent details
    const { data: agent, error: agentError } = await sb
      .from("marketplace_agents")
      .select("*")
      .eq("id", agent_id)
      .single();

    if (agentError || !agent) {
      return NextResponse.json(
        { error: "Agent not found" },
        { status: 404 }
      );
    }

    // Get user's org if not provided
    let final_org_id = org_id;
    if (!final_org_id) {
      const { data: profile } = await sb
        .from("profiles")
        .select("org_id")
        .eq("id", user_id)
        .single();
      
      final_org_id = profile?.org_id;
    }

    // Create AI template from agent
    const { data: aiTemplate, error: templateError } = await sb
      .from("ai_templates")
      .insert({
        org_id: final_org_id,
        name: agent.name,
        body: agent.template_body,
        subject: `${agent.name} - AgentCloud Template`,
        template_type: "winback", // Default type
      })
      .select()
      .single();

    if (templateError) {
      console.error("Error creating AI template:", templateError);
      return NextResponse.json(
        { error: "Failed to deploy agent", details: templateError.message },
        { status: 500 }
      );
    }

    // Record deployment (this will also update download count via trigger)
    const { error: deployError } = await sb
      .from("marketplace_agent_deployments")
      .insert({
        agent_id: agent.id,
        deployed_by: user_id,
        org_id: final_org_id,
        ai_template_id: aiTemplate.id,
      });

    if (deployError) {
      console.error("Error recording deployment:", deployError);
      // Don't fail the deployment if we can't record it
    }

    return NextResponse.json({ 
      success: true,
      deployed_template: aiTemplate,
      message: "Agent deployed to your SmartSend account!"
    });
  } catch (error: any) {
    console.error("Deploy agent error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

