import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import Papa from "https://esm.sh/papaparse@5.4.1";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

serve(async (req) => {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const campaign_id = formData.get("campaign_id");

    if (!file || !campaign_id)
      return new Response("Missing file or campaign_id", { status: 400 });

    const csvText = await file.text();
    const { data, errors } = Papa.parse(csvText, { header: true, skipEmptyLines: true });

    if (errors.length) {
      console.error(errors);
      return new Response("CSV parse error", { status: 400 });
    }

    const required = ["email"];
    const validRows = data
      .map((r: any) => ({
        email: (r.email || "").trim().toLowerCase(),
        first_name: (r.first_name || "").trim() || null,
        last_name: (r.last_name || "").trim() || null,
        company: (r.company || "").trim() || null,
      }))
      .filter((r: any) => required.every((key) => r[key] && r[key] !== ""));

    // prevent duplicates - check in batches to avoid query size limits
    const existingEmails = new Set<string>();
    const emailList = validRows.map((r: any) => r.email);
    const BATCH_SIZE = 1000;
    
    for (let i = 0; i < emailList.length; i += BATCH_SIZE) {
      const batch = emailList.slice(i, i + BATCH_SIZE);
      const { data: existing } = await supabase
        .from("leads")
        .select("email")
        .in("email", batch);
      
      if (existing) {
        existing.forEach((r: any) => existingEmails.add(r.email.toLowerCase()));
      }
    }

    const newLeads = validRows.filter((r: any) => !existingEmails.has(r.email));

    const insertData = newLeads.map((r: any) => ({
      campaign_id,
      email: r.email,
      first_name: r.first_name,
      last_name: r.last_name,
      company: r.company,
      status: "queued",
    }));

    const { error } = await supabase.from("leads").insert(insertData);
    if (error) throw error;

    return new Response(JSON.stringify({ inserted: insertData.length }), { status: 200 });
  } catch (e) {
    console.error(e);
    return new Response("Server error", { status: 500 });
  }
});

