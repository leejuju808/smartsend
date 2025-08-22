export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { parse } from "csv-parse/sync";
import { emailDomain, isLikelyEmail, normalizeEmail } from "@/lib/email";

type Row = Record<string, string>;

function guess(headers: string[]) {
  const H = headers.map(h => h.toLowerCase());
  const find = (...alts: string[]) => {
    const idx = H.findIndex(h => alts.some(a => h === a || h.includes(a)));
    return idx >= 0 ? headers[idx] : "";
  };
  const email = find("email","e-mail","mail","email_address");
  const name = find("name","full name","full_name");
  const first = find("first","first_name","given");
  const last = find("last","last_name","family","surname");
  const company = find("company","org","organization");
  const tags = find("tags","tag");
  return { email, name, first, last, company, tags };
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const form = await req.formData();
    const file = form.get("file") as unknown as File | null;
    const addTag = String(form.get("addTag") || "").trim();

    if (!file) return NextResponse.json({ error: "file required (CSV)" }, { status: 400 });

    const buf = Buffer.from(await file.arrayBuffer());
    const rows: Row[] = parse(buf, { columns: true, skip_empty_lines: true, bom: true });

    if (!rows.length) return NextResponse.json({ inserted: 0, skipped: 0, suppressed: 0, invalid: 0, rejectsBase64: null });

    const headers = Object.keys(rows[0]);
    const map = guess(headers);

    // Preload suppression set (email + domain)
    const allEmails = new Set<string>();
    const allDomains = new Set<string>();
    for (const r of rows) {
      const raw = r[map.email] || r["email"] || r["Email"] || "";
      const e = normalizeEmail(raw);
      if (e) {
        allEmails.add(e);
        const d = emailDomain(e);
        if (d) allDomains.add(d);
      }
    }
    const { data: suppressed } = await supabase
      .from("suppressions")
      .select("kind, value_lower")
      .eq("user_id", user.id)
      .in("value_lower", [...allEmails, ...allDomains]);

    const supEmails = new Set((suppressed || []).filter(s => s.kind === "email").map(s => s.value_lower));
    const supDomains = new Set((suppressed || []).filter(s => s.kind === "domain").map(s => s.value_lower));

    // Preload existing contacts to dedupe against DB
    const { data: existing } = await supabase
      .from("contacts")
      .select("email_lower")
      .eq("user_id", user.id);
    const existingSet = new Set((existing || []).map(x => String(x.email_lower).toLowerCase()));

    const toInsert: any[] = [];
    const seenInFile = new Set<string>();
    const rejects: any[] = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];

      // Build candidate
      const rawEmail = normalizeEmail(r[map.email] || r["email"] || r["Email"] || "");
      const okEmail = isLikelyEmail(rawEmail);
      if (!okEmail) {
        rejects.push({ row: i + 2, reason: "invalid_email", email: rawEmail }); // +2 accounts for header + 1-indexed
        continue;
      }

      // dedupe within file
      if (seenInFile.has(rawEmail)) {
        rejects.push({ row: i + 2, reason: "duplicate_in_file", email: rawEmail });
        continue;
      }

      // suppression check
      const dom = emailDomain(rawEmail);
      if (supEmails.has(rawEmail) || (dom && supDomains.has(dom))) {
        rejects.push({ row: i + 2, reason: "suppressed", email: rawEmail });
        continue;
      }

      // dedupe against DB
      if (existingSet.has(rawEmail)) {
        rejects.push({ row: i + 2, reason: "already_exists", email: rawEmail });
        continue;
      }

      seenInFile.add(rawEmail);

      // name resolution
      let name = (r[map.name] || "").toString().trim();
      const first = (r[map.first] || "").toString().trim();
      const last = (r[map.last] || "").toString().trim();
      if (!name && (first || last)) name = `${first} ${last}`.trim();

      // company/tags
      const company = (r[map.company] || "").toString().trim() || null;
      const tags = new Set<string>();
      if (r[map.tags]) {
        String(r[map.tags]).split(/[;,]/).map(s => s.trim()).filter(Boolean).forEach(t => tags.add(t));
      }
      if (addTag) tags.add(addTag);

      // gather custom extra fields
      const reserved = new Set([map.email, map.name, map.first, map.last, map.company, map.tags].filter(Boolean));
      const custom: Record<string, string> = {};
      for (const k of Object.keys(r)) {
        if (!reserved.has(k)) {
          const v = r[k];
          if (v !== undefined && v !== null && String(v).trim() !== "") custom[k] = String(v);
        }
      }

      toInsert.push({
        user_id: user.id,
        email: rawEmail,
        name: name || null,
        company,
        tags: Array.from(tags),
        custom: Object.keys(custom).length ? custom : null,
      });
    }

    // Insert
    let inserted = 0;
    if (toInsert.length) {
      const { error } = await supabase.from("contacts").insert(toInsert);
      if (error) {
        // If something fails catastrophically, mark all pending as rejects
        for (const c of toInsert) rejects.push({ row: null, reason: "insert_failed", email: c.email });
      } else {
        inserted = toInsert.length;
      }
    }

    // Build a CSV of rejects
    let rejectsBase64: string | null = null;
    if (rejects.length) {
      const header = "row,email,reason\n";
      const body = rejects.map(x => `${x.row ?? ""},${x.email ?? ""},${x.reason}`).join("\n");
      rejectsBase64 = Buffer.from(header + body, "utf8").toString("base64");
    }

    const invalid = rejects.filter(r => r.reason === "invalid_email").length;
    const suppressedCnt = rejects.filter(r => r.reason === "suppressed").length;
    const skipped = rejects.length - invalid - suppressedCnt; // dupes/existing/insert_failed

    return NextResponse.json({
      inserted,
      skipped,
      suppressed: suppressedCnt,
      invalid,
      total_in_file: rows.length,
      rejectsBase64,
      rejectsFilename: "rejected.csv",
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e?.message || "Import failed" }, { status: 500 });
  }
}

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { parse } from "csv-parse/sync";
import { emailDomain, isLikelyEmail, normalizeEmail } from "@/lib/email";

type Row = Record<string, string>;

function guess(headers: string[]) {
  const H = headers.map(h => h.toLowerCase());
  const find = (...alts: string[]) => {
    const idx = H.findIndex(h => alts.some(a => h === a || h.includes(a)));
    return idx >= 0 ? headers[idx] : "";
  };
  const email = find("email","e-mail","mail","email_address");
  const name = find("name","full name","full_name");
  const first = find("first","first_name","given");
  const last = find("last","last_name","family","surname");
  const company = find("company","org","organization");
  const tags = find("tags","tag");
  return { email, name, first, last, company, tags };
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const form = await req.formData();
    const file = form.get("file") as unknown as File | null;
    const addTag = String(form.get("addTag") || "").trim();

    if (!file) return NextResponse.json({ error: "file required (CSV)" }, { status: 400 });

    const buf = Buffer.from(await file.arrayBuffer());
    const rows: Row[] = parse(buf, { columns: true, skip_empty_lines: true, bom: true });

    if (!rows.length) return NextResponse.json({ inserted: 0, skipped: 0, suppressed: 0, invalid: 0, rejectsBase64: null });

    const headers = Object.keys(rows[0]);
    const map = guess(headers);

    // Preload suppression set (email + domain)
    const allEmails = new Set<string>();
    const allDomains = new Set<string>();
    for (const r of rows) {
      const raw = r[map.email] || r["email"] || r["Email"] || "";
      const e = normalizeEmail(raw);
      if (e) {
        allEmails.add(e);
        const d = emailDomain(e);
        if (d) allDomains.add(d);
      }
    }
    const { data: suppressed } = await supabase
      .from("suppressions")
      .select("kind, value_lower")
      .eq("user_id", user.id)
      .in("value_lower", [...allEmails, ...allDomains]);

    const supEmails = new Set((suppressed || []).filter(s => s.kind === "email").map(s => s.value_lower));
    const supDomains = new Set((suppressed || []).filter(s => s.kind === "domain").map(s => s.value_lower));

    // Preload existing contacts to dedupe against DB
    const { data: existing } = await supabase
      .from("contacts")
      .select("email_lower")
      .eq("user_id", user.id);
    const existingSet = new Set((existing || []).map(x => String(x.email_lower).toLowerCase()));

    const toInsert: any[] = [];
    const seenInFile = new Set<string>();
    const rejects: any[] = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];

      // Build candidate
      const rawEmail = normalizeEmail(r[map.email] || r["email"] || r["Email"] || "");
      const okEmail = isLikelyEmail(rawEmail);
      if (!okEmail) {
        rejects.push({ row: i + 2, reason: "invalid_email", email: rawEmail }); // +2 accounts for header + 1-indexed
        continue;
      }

      // dedupe within file
      if (seenInFile.has(rawEmail)) {
        rejects.push({ row: i + 2, reason: "duplicate_in_file", email: rawEmail });
        continue;
      }

      // suppression check
      const dom = emailDomain(rawEmail);
      if (supEmails.has(rawEmail) || (dom && supDomains.has(dom))) {
        rejects.push({ row: i + 2, reason: "suppressed", email: rawEmail });
        continue;
      }

      // dedupe against DB
      if (existingSet.has(rawEmail)) {
        rejects.push({ row: i + 2, reason: "already_exists", email: rawEmail });
        continue;
      }

      seenInFile.add(rawEmail);

      // name resolution
      let name = (r[map.name] || "").toString().trim();
      const first = (r[map.first] || "").toString().trim();
      const last = (r[map.last] || "").toString().trim();
      if (!name && (first || last)) name = `${first} ${last}`.trim();

      // company/tags
      const company = (r[map.company] || "").toString().trim() || null;
      const tags = new Set<string>();
      if (r[map.tags]) {
        String(r[map.tags]).split(/[;,]/).map(s => s.trim()).filter(Boolean).forEach(t => tags.add(t));
      }
      if (addTag) tags.add(addTag);

      // gather custom extra fields
      const reserved = new Set([map.email, map.name, map.first, map.last, map.company, map.tags].filter(Boolean));
      const custom: Record<string, string> = {};
      for (const k of Object.keys(r)) {
        if (!reserved.has(k)) {
          const v = r[k];
          if (v !== undefined && v !== null && String(v).trim() !== "") custom[k] = String(v);
        }
      }

      toInsert.push({
        user_id: user.id,
        email: rawEmail,
        name: name || null,
        company,
        tags: Array.from(tags),
        custom: Object.keys(custom).length ? custom : null,
      });
    }

    // Insert
    let inserted = 0;
    if (toInsert.length) {
      const { error } = await supabase.from("contacts").insert(toInsert);
      if (error) {
        // If something fails catastrophically, mark all pending as rejects
        for (const c of toInsert) rejects.push({ row: null, reason: "insert_failed", email: c.email });
      } else {
        inserted = toInsert.length;
      }
    }

    // Build a CSV of rejects
    let rejectsBase64: string | null = null;
    if (rejects.length) {
      const header = "row,email,reason\n";
      const body = rejects.map(x => `${x.row ?? ""},${x.email ?? ""},${x.reason}`).join("\n");
      rejectsBase64 = Buffer.from(header + body, "utf8").toString("base64");
    }

    const invalid = rejects.filter(r => r.reason === "invalid_email").length;
    const suppressedCnt = rejects.filter(r => r.reason === "suppressed").length;
    const skipped = rejects.length - invalid - suppressedCnt; // dupes/existing/insert_failed

    return NextResponse.json({
      inserted,
      skipped,
      suppressed: suppressedCnt,
      invalid,
      total_in_file: rows.length,
      rejectsBase64,
      rejectsFilename: "rejected.csv",
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e?.message || "Import failed" }, { status: 500 });
  }
}

