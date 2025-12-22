/**
 * CRM Integration Sync Route
 * 
 * Handles syncing leads from:
 * - JobNimbus
 * - AccuLynx
 * - Roofr
 * - GoHighLevel
 * 
 * Sync leads → sync homeowner contacts → update job stages.
 * Campaigns trigger from new leads automatically.
 */

import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { integration_id, workspace_id, crm_leads } = body;

    if (!integration_id || !workspace_id || !crm_leads || !Array.isArray(crm_leads)) {
      return NextResponse.json(
        { error: "Missing required fields: integration_id, workspace_id, crm_leads (array)" },
        { status: 400 }
      );
    }

    // Get integration details
    const { data: integration, error: integrationError } = await supabase
      .from("integrations")
      .select("id, type, config")
      .eq("id", integration_id)
      .eq("workspace_id", workspace_id)
      .single();

    if (integrationError || !integration) {
      return NextResponse.json({ error: "Integration not found" }, { status: 404 });
    }

    const crmType = integration.type; // 'crm_jobnimbus', 'crm_acculynx', etc.

    // Update sync status
    await supabase
      .from("integrations")
      .update({
        sync_status: "syncing",
        last_sync_at: new Date().toISOString()
      })
      .eq("id", integration_id);

    let processedCount = 0;
    let errorCount = 0;
    const errors: any[] = [];

    // Process each CRM lead
    for (const crmLead of crm_leads) {
      try {
        // Extract lead data (normalize across different CRM formats)
        const email = crmLead.email || crmLead.Email || crmLead.email_address;
        const first_name = crmLead.first_name || crmLead.firstName || crmLead.FirstName;
        const last_name = crmLead.last_name || crmLead.lastName || crmLead.LastName;
        const phone = crmLead.phone || crmLead.Phone || crmLead.phone_number;
        const job_stage = crmLead.job_stage || crmLead.stage || crmLead.status;
        const job_id = crmLead.job_id || crmLead.JobId || crmLead.id;
        const crm_lead_id = crmLead.lead_id || crmLead.LeadId || crmLead.leadId;

        if (!email) {
          errorCount++;
          errors.push({ crm_lead_id, error: "Missing email" });
          continue;
        }

        // Process lead through unified processing
        const processResponse = await fetch(
          `${req.nextUrl.origin}/api/integrations/roofing/process-lead`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Cookie": req.headers.get("cookie") || ""
            },
            body: JSON.stringify({
              integration_id,
              workspace_id,
              email,
              first_name,
              last_name,
              phone,
              source_type: "crm",
              message_text: crmLead.notes || crmLead.description || null,
              metadata: {
                crm_type: crmType,
                crm_lead_id,
                job_id,
                job_stage,
                raw_data: crmLead
              }
            })
          }
        );

        if (!processResponse.ok) {
          errorCount++;
          const error = await processResponse.json();
          errors.push({ crm_lead_id, error: error.message || "Processing failed" });
        } else {
          processedCount++;
          
          // Update CRM sync status
          const { data: processResult } = await processResponse.json();
          if (processResult.lead_id) {
            await supabase
              .from("crm_sync_status")
              .upsert({
                integration_id,
                workspace_id,
                crm_lead_id: String(crm_lead_id),
                last_sync_at: new Date().toISOString(),
                last_successful_sync_at: new Date().toISOString(),
                sync_count: 1,
                metadata: {
                  job_id,
                  job_stage,
                  lead_id: processResult.lead_id
                }
              }, {
                onConflict: "integration_id,workspace_id"
              });
          }
        }
      } catch (error) {
        errorCount++;
        errors.push({
          crm_lead_id: crmLead.id || crmLead.lead_id,
          error: error instanceof Error ? error.message : "Unknown error"
        });
      }
    }

    // Update sync status
    await supabase
      .from("integrations")
      .update({
        sync_status: errorCount === 0 ? "success" : "error",
        error_message: errorCount > 0 ? `${errorCount} errors during sync` : null
      })
      .eq("id", integration_id);

    return NextResponse.json({
      success: true,
      processed: processedCount,
      errors: errorCount,
      error_details: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    console.error("Error syncing CRM leads:", error);
    
    // Update sync status to error
    const supabase = createRouteHandlerClient({ cookies });
    const body = await req.json().catch(() => ({}));
    if (body.integration_id) {
      await supabase
        .from("integrations")
        .update({
          sync_status: "error",
          error_message: error instanceof Error ? error.message : "Unknown error"
        })
        .eq("id", body.integration_id);
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}






































