// supabase/functions/badleads-deduplicate/index.ts
// Block 17800 — Duplicate Lead Detection & Merging Worker

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface DeduplicateRequest {
  workspace_id: string;
  detection_method?: "email_match" | "phone_match" | "name_email_match" | "manual";
}

serve(async (req) => {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body: DeduplicateRequest = await req.json();

    const { workspace_id, detection_method = "email_match" } = body;

    if (!workspace_id) {
      return new Response(
        JSON.stringify({ error: "workspace_id is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    let duplicates: Array<{ primary_id: string; duplicate_id: string; email: string }> = [];

    // Find duplicates based on detection method
    if (detection_method === "email_match") {
      // Find leads with same email (case-insensitive)
      const { data: leads, error: leadsError } = await supabase
        .from("leads")
        .select("id, email, first_name, last_name")
        .eq("workspace_id", workspace_id)
        .not("email", "is", null);

      if (leadsError) {
        throw leadsError;
      }

      // Group by normalized email
      const emailMap = new Map<string, string[]>();
      leads?.forEach((lead) => {
        const normalizedEmail = lead.email?.toLowerCase().trim();
        if (normalizedEmail) {
          if (!emailMap.has(normalizedEmail)) {
            emailMap.set(normalizedEmail, []);
          }
          emailMap.get(normalizedEmail)!.push(lead.id);
        }
      });

      // Find duplicates (more than one lead per email)
      for (const [email, leadIds] of emailMap.entries()) {
        if (leadIds.length > 1) {
          // Use first as primary, rest as duplicates
          const primaryId = leadIds[0];
          for (let i = 1; i < leadIds.length; i++) {
            duplicates.push({
              primary_id: primaryId,
              duplicate_id: leadIds[i],
              email,
            });
          }
        }
      }
    } else if (detection_method === "phone_match") {
      // Find leads with same phone
      const { data: leads, error: leadsError } = await supabase
        .from("leads")
        .select("id, phone, email")
        .eq("workspace_id", workspace_id)
        .not("phone", "is", null);

      if (leadsError) {
        throw leadsError;
      }

      // Group by normalized phone
      const phoneMap = new Map<string, string[]>();
      leads?.forEach((lead) => {
        const normalizedPhone = lead.phone?.replace(/\D/g, ""); // Remove non-digits
        if (normalizedPhone && normalizedPhone.length >= 10) {
          if (!phoneMap.has(normalizedPhone)) {
            phoneMap.set(normalizedPhone, []);
          }
          phoneMap.get(normalizedPhone)!.push(lead.id);
        }
      });

      // Find duplicates
      for (const [phone, leadIds] of phoneMap.entries()) {
        if (leadIds.length > 1) {
          const primaryId = leadIds[0];
          for (let i = 1; i < leadIds.length; i++) {
            // Get email for reference
            const lead = leads?.find((l) => l.id === leadIds[i]);
            duplicates.push({
              primary_id: primaryId,
              duplicate_id: leadIds[i],
              email: lead?.email || "",
            });
          }
        }
      }
    }

    // Create duplicate link records (but don't auto-merge - let user review)
    const createdLinks = [];

    for (const dup of duplicates) {
      // Check if link already exists
      const { data: existing } = await supabase
        .from("duplicate_links")
        .select("id")
        .eq("workspace_id", workspace_id)
        .eq("primary_lead_id", dup.primary_id)
        .eq("duplicate_lead_id", dup.duplicate_id)
        .single();

      if (!existing) {
        const { data: primaryLead } = await supabase
          .from("leads")
          .select("email")
          .eq("id", dup.primary_id)
          .single();

        const { data: duplicateLead } = await supabase
          .from("leads")
          .select("email")
          .eq("id", dup.duplicate_id)
          .single();

        const { data: link, error: linkError } = await supabase
          .from("duplicate_links")
          .insert({
            workspace_id,
            primary_lead_id: dup.primary_id,
            primary_email: primaryLead?.email || dup.email,
            duplicate_lead_id: dup.duplicate_id,
            duplicate_email: duplicateLead?.email || dup.email,
            detection_method,
            merged: false,
          })
          .select()
          .single();

        if (!linkError && link) {
          createdLinks.push(link.id);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        duplicates_found: duplicates.length,
        duplicate_links_created: createdLinks.length,
        duplicates: duplicates.slice(0, 100), // Limit response size
        message: `Found ${duplicates.length} duplicate(s), created ${createdLinks.length} link(s)`,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Deduplicate error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});





















































