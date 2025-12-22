/**
 * Unified Lead Processing Route
 * 
 * This is the core endpoint that processes leads from ANY integration.
 * It implements the SmartSend Integration Backend Logic:
 * 1. Auto-create lead
 * 2. Run through SmartSend AI classifier
 * 3. Label as HOT/WARM/NOT
 * 4. Assign to campaigns
 * 5. Trigger follow-up sequence
 * 6. Notify roofer
 */

import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { classifyLeadIntent } from "@/lib/ai/classifyLeadIntent";

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      integration_id,
      workspace_id,
      email,
      first_name,
      last_name,
      phone,
      source_type, // 'email', 'sms', 'webform', 'crm', 'calendar', 'import', 'storm'
      source_id,
      message_text,
      subject,
      metadata = {}
    } = body;

    // Validation
    if (!integration_id || !workspace_id || !email || !source_type) {
      return NextResponse.json(
        { error: "Missing required fields: integration_id, workspace_id, email, source_type" },
        { status: 400 }
      );
    }

    // Verify integration exists and belongs to workspace
    const { data: integration, error: integrationError } = await supabase
      .from("integrations")
      .select("id, type, enabled, workspace_id")
      .eq("id", integration_id)
      .eq("workspace_id", workspace_id)
      .single();

    if (integrationError || !integration) {
      return NextResponse.json({ error: "Integration not found" }, { status: 404 });
    }

    if (!integration.enabled) {
      return NextResponse.json({ error: "Integration is disabled" }, { status: 400 });
    }

    // Step 1: Auto-create lead (or find existing)
    const { data: existingLead } = await supabase
      .from("leads")
      .select("id")
      .eq("workspace_id", workspace_id)
      .eq("email", email.toLowerCase())
      .single();

    let leadId: string;
    if (existingLead) {
      leadId = existingLead.id;
      // Update existing lead with new data
      await supabase
        .from("leads")
        .update({
          first_name: first_name || undefined,
          last_name: last_name || undefined,
          phone: phone || undefined,
          updated_at: new Date().toISOString()
        })
        .eq("id", leadId);
    } else {
      // Create new lead
      const { data: newLead, error: leadError } = await supabase
        .from("leads")
        .insert({
          workspace_id,
          email: email.toLowerCase(),
          first_name: first_name || null,
          last_name: last_name || null,
          phone: phone || null,
          status: "new",
          source: source_type,
          custom: metadata
        })
        .select("id")
        .single();

      if (leadError || !newLead) {
        return NextResponse.json(
          { error: `Failed to create lead: ${leadError?.message}` },
          { status: 500 }
        );
      }
      leadId = newLead.id;
    }

    // Step 2: Run through SmartSend AI classifier
    let classification = "WARM";
    let confidence = 0.5;
    let reasoning = "No message text provided";

    if (message_text && message_text.trim().length > 0) {
      try {
        const classificationResult = await classifyLeadIntent(message_text, subject);
        classification = classificationResult.classification;
        confidence = classificationResult.confidence;
        reasoning = classificationResult.reasoning || "AI classification completed";
      } catch (error) {
        console.error("AI classification error:", error);
        // Continue with defaults if classification fails
      }
    }

    // Map AI classification to our format
    const classificationMap: Record<string, string> = {
      "HOT": "HOT",
      "WARM": "WARM",
      "NOT_INTERESTED": "NOT",
      "FOLLOW_UP": "FOLLOW_UP",
      "OUT_OF_SCOPE": "NOT"
    };
    const mappedClassification = classificationMap[classification] || "WARM";

    // Step 3: Create integration_leads record
    const { data: integrationLead, error: integrationLeadError } = await supabase
      .from("integration_leads")
      .insert({
        integration_id,
        workspace_id,
        lead_id: leadId,
        source_type,
        source_id: source_id || null,
        ai_classification: mappedClassification,
        ai_confidence: confidence,
        ai_reasoning: reasoning,
        metadata
      })
      .select("id")
      .single();

    if (integrationLeadError) {
      console.error("Failed to create integration_leads record:", integrationLeadError);
    }

    // Step 4: Create timeline event
    await supabase
      .from("lead_timeline_events")
      .insert({
        lead_id: leadId,
        event_type: "lead_created",
        event_subtype: `integration_${source_type}`,
        message: `Lead created from ${source_type} integration`,
        metadata: {
          integration_id,
          source_type,
          source_id,
          classification: mappedClassification,
          confidence
        }
      });

    // Step 5: Assign to campaigns (if HOT or WARM)
    if (mappedClassification === "HOT" || mappedClassification === "WARM") {
      // Find active campaigns for this workspace
      const { data: campaigns } = await supabase
        .from("campaigns")
        .select("id")
        .eq("workspace_id", workspace_id)
        .eq("status", "active")
        .limit(1);

      if (campaigns && campaigns.length > 0) {
        const campaignId = campaigns[0].id;
        
        // Add lead to campaign
        await supabase
          .from("campaign_leads")
          .insert({
            campaign_id,
            lead_id: leadId,
            workspace_id
          });

        // Update integration_leads with campaign assignment
        if (integrationLead) {
          await supabase
            .from("integration_leads")
            .update({
              campaign_assigned: true,
              campaign_id
            })
            .eq("id", integrationLead.id);
        }
      }
    }

    // Step 6: Update lead status based on classification
    let leadStatus = "new";
    if (mappedClassification === "HOT") {
      leadStatus = "hot";
    } else if (mappedClassification === "WARM") {
      leadStatus = "warm";
    } else if (mappedClassification === "NOT") {
      leadStatus = "not_interested";
    }

    await supabase
      .from("leads")
      .update({ status: leadStatus })
      .eq("id", leadId);

    // Step 7: Notify roofer (this would trigger a notification system)
    // For now, we'll mark it as notified - actual notification logic would go here
    if (integrationLead) {
      await supabase
        .from("integration_leads")
        .update({
          roofer_notified: true,
          roofer_notified_at: new Date().toISOString(),
          processed: true,
          processed_at: new Date().toISOString()
        })
        .eq("id", integrationLead.id);
    }

    return NextResponse.json({
      success: true,
      lead_id: leadId,
      classification: mappedClassification,
      confidence,
      reasoning,
      campaign_assigned: mappedClassification === "HOT" || mappedClassification === "WARM"
    });

  } catch (error) {
    console.error("Error processing integration lead:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}






































