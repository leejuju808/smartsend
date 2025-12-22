import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace/withWorkspace";
import { getServerSupabase } from "@/lib/supabase/server";
import { looksLikeRoleAccount } from "@/lib/hygiene";

function validateEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).toLowerCase());
}

type Mapping = Record<string, string>;
type Row = Record<string, any>;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireWorkspace(req);
  if ("error" in gate) return gate.error;

  const { mapping, rows }: { mapping: Mapping; rows: Row[] } = await req.json();
  
  if (!mapping?.email) {
    return NextResponse.json({ error: "Email column is required" }, { status: 400 });
  }
  
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "No rows" }, { status: 400 });
  }

  const supabase = getServerSupabase();

  // Fetch campaign to ensure workspace match
  const { data: campaign, error: cErr } = await supabase
    .from("campaigns")
    .select("id, workspace_id, user_id")
    .eq("id", params.id)
    .single();
    
  if (cErr || !campaign || campaign.workspace_id !== gate.workspace_id) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  // Get user_id for suppression checks (use campaign owner)
  const userId = campaign.user_id;

  // Prepare lead payloads
  const toUpsert: any[] = [];
  const skippedEmails = new Set<string>();
  const suppressedEmails: string[] = [];
  const roleEmails: string[] = [];
  const seen = new Set<string>();

  // Check suppression for all emails (Block 445)
  const emails = rows.map(r => {
    const emailRaw = r[mapping.email];
    return typeof emailRaw === "string" ? emailRaw.trim().toLowerCase() : "";
  }).filter(e => e && validateEmail(e));
  
  // Use Block 445 suppression check
  const suppressedSet = new Set<string>();
  if (emails.length > 0 && gate.workspace_id) {
    // Check each email against Block 445 suppression
    for (const email of emails) {
      const { data: isSuppressed } = await supabase.rpc('is_email_suppressed', {
        p_workspace_id: gate.workspace_id,
        p_email: email
      });
      if (isSuppressed) {
        suppressedSet.add(email);
      }
    }
  }

  // Auto-suppress role addresses
  if (userId) {
    const { suppressEmail } = await import("@/lib/hygiene/suppression");
    for (const email of emails) {
      if (looksLikeRoleAccount(email)) {
        await suppressEmail(userId, email, "role", "import");
        suppressedSet.add(email);
        roleEmails.push(email);
      }
    }
  }

  for (const r of rows) {
    const emailRaw = r[mapping.email];
    const email = typeof emailRaw === "string" ? emailRaw.trim().toLowerCase() : "";
    
    if (!email || !validateEmail(email) || seen.has(email)) {
      skippedEmails.add(email);
      continue;
    }
    
    // Check if suppressed (from bounce/complaint or role account)
    if (suppressedSet.has(email)) {
      suppressedEmails.push(email);
      skippedEmails.add(email);
      continue; // Exclude suppressed by default
    }
    
    seen.add(email);

    const item: any = {
      workspace_id: gate.workspace_id,
      email,
      first_name: mapping.first_name ? String(r[mapping.first_name] || "").trim() : null,
      last_name: mapping.last_name ? String(r[mapping.last_name] || "").trim() : null,
      company: mapping.company ? String(r[mapping.company] || "").trim() : null,
      title: mapping.title ? String(r[mapping.title] || "").trim() : null,
    };

    if (mapping.custom && r[mapping.custom]) {
      try {
        item.custom = typeof r[mapping.custom] === "string" 
          ? JSON.parse(r[mapping.custom]) 
          : r[mapping.custom];
      } catch {
        item.custom = { raw: String(r[mapping.custom]) };
      }
    }

    toUpsert.push(item);
  }

  if (toUpsert.length === 0) {
    return NextResponse.json({ error: "No valid rows after validation" }, { status: 400 });
  }

  // Upsert leads by (workspace_id, email)
  const emails = toUpsert.map(l => l.email);
  const { data: existing } = await supabase
    .from("leads")
    .select("id, email")
    .eq("workspace_id", gate.workspace_id)
    .in("email", emails);

  const existingMap = new Map((existing || []).map((e: any) => [e.email, e.id]));
  const toInsert = toUpsert.filter(l => !existingMap.has(l.email));
  const toUpdate = toUpsert
    .filter(l => existingMap.has(l.email))
    .map(l => ({ id: existingMap.get(l.email), ...l }));

  let inserted = 0;
  let upserted = 0;

  // Insert new leads
  if (toInsert.length) {
    const { data: ins, error: insErr } = await supabase
      .from("leads")
      .insert(toInsert)
      .select("id, email");
      
    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }
    
    inserted = ins?.length || 0;
    for (const r of ins || []) {
      existingMap.set(r.email, r.id);
    }
  }

  // Update existing leads (only non-null fields)
  if (toUpdate.length) {
    for (const l of toUpdate) {
      const { id, email, workspace_id, ...rest } = l;
      const patch: any = {};
      for (const k of Object.keys(rest)) {
        if (rest[k] != null && String(rest[k]).trim() !== "") {
          patch[k] = rest[k];
        }
      }
      if (Object.keys(patch).length) {
        const { error: updErr } = await supabase
          .from("leads")
          .update(patch)
          .eq("id", id as string);
          
        if (updErr) {
          return NextResponse.json({ error: updErr.message }, { status: 500 });
        }
        upserted++;
      }
    }
  }

  // Build campaign_targets (or campaign_contacts depending on your schema)
  const toTarget: { campaign_id: string; lead_id: string }[] = [];
  for (const email of emails) {
    const lead_id = existingMap.get(email);
    if (lead_id) {
      toTarget.push({ campaign_id: params.id, lead_id });
    }
  }

  // Insert targets (ignore conflicts)
  if (toTarget.length) {
    const { error: tgtErr } = await supabase
      .from("campaign_contacts")
      .insert(toTarget);
      
    if (tgtErr && !/duplicate key/i.test(tgtErr.message)) {
      return NextResponse.json({ error: tgtErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({
    inserted,
    upserted,
    skipped: skippedEmails.size,
    suppressed: suppressedEmails.length,
    suppressed_emails: suppressedEmails, // Include for UI display
    role_suppressed: roleEmails.length, // Count of role addresses auto-suppressed
    total_processed: toUpsert.length
  });
} 