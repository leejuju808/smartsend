// app/api/leads/import/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

function detectColumn(header: string): string | null {
  const h = header.toLowerCase().trim();
  if (h.includes("email")) return "email";
  if (h.includes("first")) return "first_name";
  if (h.includes("last")) return "last_name";
  if (h.includes("name") && !h.includes("first") && !h.includes("last")) return "name";
  if (h.includes("phone")) return "phone";
  if (h.includes("address")) return "address";
  if (h === "city") return "city";
  if (h === "state") return "state";
  if (h.includes("zip")) return "zip";
  return null;
}

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const contentType = req.headers.get("content-type") || "";

  // Handle new JSON format (mapping + rows)
  if (contentType.includes("application/json")) {
    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const { mapping, rows } = body;
    if (!mapping || !rows) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const insertRows = [];

    for (const row of rows) {
      const lead: any = { owner_id: user.id, status: "active" };

      for (const [col, sys] of Object.entries(mapping)) {
        if (!sys) continue;
        lead[sys] = row[col] ?? null;
      }

      if (!lead.email) {
        // skip rows without email
        continue;
      }

      // Normalize email
      lead.email = lead.email.toLowerCase().trim();

      insertRows.push(lead);
    }

    if (insertRows.length === 0) {
      return NextResponse.json(
        { error: "No valid rows with email found" },
        { status: 400 }
      );
    }

    // Insert leads
    const { error } = await supabase.from("leads").insert(insertRows);

    if (error) {
      console.error("Lead import error:", error);
      return NextResponse.json(
        { error: "Failed to insert leads" },
        { status: 500 }
      );
    }

    // Flip onboarding flag
    await supabase
      .from("profiles")
      .update({ onboarding_leads_imported: true })
      .eq("id", user.id);

    return NextResponse.json(
      { inserted: insertRows.length },
      { status: 200 }
    );
  }

  // Handle legacy formData format (campaign_id + file)
  const formData = await req.formData();
  const campaign_id = formData.get("campaign_id") as string | null;
  const file = formData.get("file") as File | null;

  if (!campaign_id || !file) {
    return NextResponse.json(
      { error: "campaign_id and file required" },
      { status: 400 }
    );
  }

  const text = await file.text();
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);

  if (lines.length < 2) {
    return NextResponse.json(
      { error: "CSV must have at least 1 row of data" },
      { status: 400 }
    );
  }

  // Simple CSV parsing (handles quoted fields)
  function parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++; // Skip next quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  }

  const headers = parseCSVLine(lines[0]);
  const columnMap = headers.map((h) => detectColumn(h));

  const rows = lines.slice(1).map((line) => {
    const parts = parseCSVLine(line);
    const obj: any = {};
    parts.forEach((p, i) => {
      const col = columnMap[i];
      if (col) obj[col] = p.trim();
    });
    return obj;
  });

  // Email validation + dedupe
  const cleanRows = rows.filter(
    (r) =>
      r.email &&
      r.email.includes("@") &&
      r.email.includes(".") &&
      r.email.length >= 5
  );

  const unique = new Map<string, any>();
  for (const r of cleanRows) {
    const emailKey = r.email.toLowerCase().trim();
    if (!unique.has(emailKey)) unique.set(emailKey, r);
  }

  const finalList = Array.from(unique.values());

  if (!finalList.length) {
    return NextResponse.json(
      { error: "No valid rows with email found." },
      { status: 400 }
    );
  }

  // Verify campaign exists
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id")
    .eq("id", campaign_id)
    .single();

  if (!campaign) {
    return NextResponse.json(
      { error: "Campaign not found" },
      { status: 404 }
    );
  }

  const inserts = finalList.map((row) => ({
    owner_id: user.id,
    campaign_id,
    email: row.email.toLowerCase().trim(),
    first_name: row.first_name ?? null,
    last_name: row.last_name ?? null,
    name: row.name ?? null,
    phone: row.phone ?? null,
    address: row.address ?? null,
    city: row.city ?? null,
    state: row.state ?? null,
    zip: row.zip ?? null,
    status: "new",
  }));

  const { error } = await supabase.from("leads").insert(inserts);

  if (error) {
    console.error("Lead import error:", error);
    return NextResponse.json({ error: "Failed to import leads" }, { status: 500 });
  }

  // Mark leads as imported in onboarding
  await supabase
    .from("profiles")
    .update({ onboarding_leads_imported: true })
    .eq("id", user.id);

  return NextResponse.json(
    {
      imported: inserts.length,
      ignored: rows.length - inserts.length,
    },
    { status: 200 }
  );
}

