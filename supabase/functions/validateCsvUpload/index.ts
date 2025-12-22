import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Papa from "https://esm.sh/papaparse@5.4.1";

Deno.serve(async (req) => {
  try {
    const form = await req.formData();
    const teamId = form.get("teamId") as string;
    const campaignId = form.get("campaignId") as string | null;
    const file = form.get("file") as File;

    if (!teamId || !file) {
      return new Response(
        JSON.stringify({ error: "Missing teamId or file" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const csv = await file.text();

    const { data, errors } = Papa.parse(csv, { 
      header: true, 
      skipEmptyLines: true,
      transformHeader: (header) => header.trim()
    });

    if (errors && errors.length > 0) {
      console.error("CSV parsing errors:", errors);
    }

    if (!data || data.length === 0) {
      return new Response(
        JSON.stringify({ error: "No data found in CSV" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get all emails from CSV
    const csvEmails = data
      .map((r: any) => {
        const email = (r.email || r.Email || r.EMAIL || "").toString().trim();
        return email ? email.toLowerCase() : null;
      })
      .filter(Boolean) as string[];

    // Check for duplicates within CSV file
    const csvEmailCounts = new Map<string, number>();
    csvEmails.forEach((email) => {
      csvEmailCounts.set(email, (csvEmailCounts.get(email) || 0) + 1);
    });
    const csvDupSet = new Set<string>();
    csvEmailCounts.forEach((count, email) => {
      if (count > 1) csvDupSet.add(email);
    });

    // Check for duplicates in existing leads
    const { data: dupEmails } = await supabase
      .from("leads")
      .select("email")
      .in("email", csvEmails);

    const existingDupSet = new Set((dupEmails || []).map((d) => d.email.toLowerCase()));
    
    // Combine both duplicate sets
    const dupSet = new Set([...csvDupSet, ...existingDupSet]);

    // Process each row
    const rows = (data as any[]).map((r, i) => {
      const emailRaw = (r.email || r.Email || r.EMAIL || "").toString().trim();
      const email = emailRaw.toLowerCase();
      
      // Email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const invalid = !email || !emailRegex.test(email);
      
      // Check if duplicate (in CSV or existing leads)
      const dupInCsv = csvDupSet.has(email);
      const dupInExisting = existingDupSet.has(email);
      const dup = dupInCsv || dupInExisting;

      // Extract fields with case-insensitive matching
      const firstName = r.first_name || r.FirstName || r.firstName || r["First Name"] || null;
      const lastName = r.last_name || r.LastName || r.lastName || r["Last Name"] || null;
      const company = r.company || r.Company || r["Company"] || null;

      // Store all original fields in custom
      const custom: Record<string, any> = {};
      for (const key in r) {
        if (!["email", "Email", "EMAIL", "first_name", "FirstName", "firstName", "First Name", 
              "last_name", "LastName", "lastName", "Last Name", "company", "Company"].includes(key)) {
          custom[key] = r[key];
        }
      }

      return {
        row_number: i + 1,
        email,
        first_name: firstName || null,
        last_name: lastName || null,
        company: company || null,
        custom: Object.keys(custom).length > 0 ? custom : null,
        is_duplicate: dup,
        is_invalid: invalid,
        reason: dupInCsv ? "duplicate in file" : dupInExisting ? "duplicate in existing leads" : invalid ? "invalid email" : null,
      };
    });

    // Create import record
    const { data: importRec, error: importError } = await supabase
      .from("lead_imports")
      .insert({
        team_id: teamId,
        campaign_id: campaignId || null,
        filename: file.name,
        total_rows: rows.length,
        status: "validating",
      })
      .select("id")
      .single();

    if (importError || !importRec) {
      console.error("Error creating import record:", importError);
      return new Response(
        JSON.stringify({ error: importError?.message || "Failed to create import record" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Insert rows in chunks of 1000
    const chunks = [];
    for (let i = 0; i < rows.length; i += 1000) {
      chunks.push(rows.slice(i, i + 1000));
    }

    for (const chunk of chunks) {
      const { error: insertError } = await supabase
        .from("lead_import_rows")
        .insert(
          chunk.map((r) => ({
            ...r,
            import_id: importRec.id,
          }))
        );

      if (insertError) {
        console.error("Error inserting rows:", insertError);
        await supabase
          .from("lead_imports")
          .update({ status: "error", errors: { error: insertError.message } })
          .eq("id", importRec.id);

        return new Response(
          JSON.stringify({ error: insertError.message }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // Update import status
    const validRows = rows.filter((r) => !r.is_duplicate && !r.is_invalid).length;
    await supabase
      .from("lead_imports")
      .update({ 
        status: "imported", 
        imported_rows: validRows 
      })
      .eq("id", importRec.id);

    return new Response(
      JSON.stringify({ 
        ok: true, 
        importId: importRec.id,
        totalRows: rows.length,
        validRows,
        duplicateRows: rows.filter((r) => r.is_duplicate).length,
        invalidRows: rows.filter((r) => r.is_invalid).length,
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (e) {
    console.error("Error in validateCsvUpload:", e);
    return new Response(
      JSON.stringify({ error: String(e) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

