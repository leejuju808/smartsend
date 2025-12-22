// Block 175: Auto-create company from lead domain
// Triggered on lead insert/update to automatically group leads under companies

// @ts-nocheck
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

Deno.serve(async (req) => {
  try {
    const { record } = await req.json();

    const lead = record;

    if (!lead.email) {
      return new Response(JSON.stringify({ ok: false, error: "no email" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const domain = lead.email.split("@")[1]?.toLowerCase();
    if (!domain) {
      return new Response(JSON.stringify({ ok: false, error: "no domain" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Get org_id from lead
    const orgId = lead.org_id;
    if (!orgId) {
      return new Response(JSON.stringify({ ok: false, error: "no org_id" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // 1) Find existing company
    let { data: company, error: findError } = await supabase
      .from("companies")
      .select("*")
      .eq("domain", domain)
      .eq("org_id", orgId)
      .maybeSingle();

    if (findError && findError.code !== "PGRST116") {
      console.error("Error finding company:", findError);
      return new Response(
        JSON.stringify({ ok: false, error: findError.message }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // 2) Create if missing
    if (!company) {
      const { data: newCompany, error: insertError } = await supabase
        .from("companies")
        .insert({
          domain,
          org_id: orgId,
          website: `https://${domain}`,
        })
        .select("*")
        .single();

      if (insertError) {
        console.error("Error creating company:", insertError);
        return new Response(
          JSON.stringify({ ok: false, error: insertError.message }),
          { headers: { "Content-Type": "application/json" } }
        );
      }

      company = newCompany;
    }

    // 3) Link lead → company
    const { error: updateError } = await supabase
      .from("leads")
      .update({ company_id: company.id })
      .eq("id", lead.id);

    if (updateError) {
      console.error("Error linking lead to company:", updateError);
      return new Response(
        JSON.stringify({ ok: false, error: updateError.message }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ ok: true, company_id: company.id }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ ok: false, error: String(error) }),
      { headers: { "Content-Type": "application/json" }, status: 500 }
    );
  }
});

