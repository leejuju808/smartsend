// app/api/import/stream/route.ts
export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { parse } from "csv-parse/sync";

type Row = Record<string, string | undefined>;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });

  const { data: auth, error: userErr } = await supabase.auth.getUser();
  if (userErr || !auth?.user) {
    return new Response('{"error":"Unauthorized"}\n', { status: 401 });
  }
  const user = auth.user;

  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) return new Response('{"error":"Missing file"}\n', { status: 400 });

  // Optional header mapping provided by the client
  const emailKeyIn  = (form.get("emailKey")   as string | null)?.toLowerCase() ?? null;
  const firstKeyIn  = (form.get("firstKey")   as string | null)?.toLowerCase() ?? null;
  const lastKeyIn   = (form.get("lastKey")    as string | null)?.toLowerCase() ?? null;
  const companyKeyIn= (form.get("companyKey") as string | null)?.toLowerCase() ?? null;

  const filename = file.name || "upload.csv";
  const buf = Buffer.from(await file.arrayBuffer());

  let rows: Row[];
  try {
    rows = parse(buf, { columns: true, skip_empty_lines: true, trim: true }) as Row[];
  } catch {
    return new Response('{"error":"CSV parse failed"}\n', { status: 400 });
  }

  const enc = new TextEncoder();

  return new Response(
    new ReadableStream({
      async start(controller) {
        const write = (obj: unknown) => controller.enqueue(enc.encode(JSON.stringify(obj) + "\n"));

        try {
          const total = rows.length;
          if (!total) {
            write({ type: "error", message: "Empty CSV" });
            controller.close();
            return;
          }

          // Normalize headers
          const normalizeKey = (k: string) => k.trim().toLowerCase();
          const normed = rows.map((r) => {
            const out: Row = {};
            for (const k of Object.keys(r)) out[normalizeKey(k)] = r[k];
            return out;
          });

          // Auto-detect keys if not provided
          const sample = normed[0] || {};
          const pick = (cands: string[], fallback: string) =>
            cands.find((k) => k in sample) || fallback;

          const emailKey   = emailKeyIn   || pick(["email", "e-mail", "work email", "business email"], "email");
          const firstKey   = firstKeyIn   || pick(["first_name", "firstname", "first"], "first_name");
          const lastKey    = lastKeyIn    || pick(["last_name", "lastname", "last"], "last_name");
          const companyKey = companyKeyIn || pick(["company", "org", "organization"], "company");

          if (!(emailKey in sample)) {
            write({ type: "error", message: "No 'email' column found in header" });
            controller.close();
            return;
          }

          // Load suppression set
          const { data: suppressed, error: supErr } = await supabase
            .from("suppression_list")
            .select("email")
            .eq("user_id", user.id);

          if (supErr) throw new Error("Failed to load suppression list");

          const suppressedSet = new Set((suppressed || []).map((r) => String(r.email).toLowerCase()));

          // Create an imports row first to attach rejects to
          const { data: impIns, error: impErr } = await supabase
            .from("imports")
            .insert({ user_id: user.id, filename, total_rows: total })
            .select("id")
            .single();

          if (impErr || !impIns?.id) throw new Error("Failed to create import record");
          const importId = impIns.id as string;

          write({ type: "start", filename, total, import_id: importId, mapping: { emailKey, firstKey, lastKey, companyKey } });

          const seenInFile = new Set<string>();
          const accepted: Array<{ user_id: string; email: string; first_name?: string; last_name?: string; company?: string }> = [];
          const rejects: Array<{ email: string; reason: string }> = [];

          let processed = 0, invalid = 0, inFileDup = 0, skippedSuppressed = 0;

          for (const r of normed) {
            processed++;
            const rawEmail = String(r[emailKey] || "").trim();
            const email = rawEmail.toLowerCase();

            if (!EMAIL_RE.test(email)) {
              invalid++; rejects.push({ email: rawEmail, reason: "invalid email" });
            } else if (suppressedSet.has(email)) {
              skippedSuppressed++; rejects.push({ email, reason: "suppressed" });
            } else if (seenInFile.has(email)) {
              inFileDup++; rejects.push({ email, reason: "duplicate in file" });
            } else {
              seenInFile.add(email);
              const first_name = (r[firstKey] || "")?.toString().trim() || undefined;
              const last_name  = (r[lastKey] || "")?.toString().trim() || undefined;
              const company    = (r[companyKey] || "")?.toString().trim() || undefined;
              accepted.push({ user_id: user.id, email, first_name, last_name, company });
            }

            // stream progress every ~2% or every 200 rows on large files
            if (processed % Math.max(1, Math.floor(total / 50)) === 0) {
              write({ type: "progress", processed, total });
            }
          }

          write({ type: "log", message: `Validated ${processed}/${total}. Upserting contacts…` });

          // Upsert in chunks
          const chunkSize = 1000;
          let insertedOrUpdated = 0;
          for (let i = 0; i < accepted.length; i += chunkSize) {
            const chunk = accepted.slice(i, i + chunkSize);
            const { data, error } = await supabase
              .from("contacts")
              .upsert(chunk, { onConflict: "user_id,email", ignoreDuplicates: false })
              .select("id");

            if (error) throw new Error(`Upsert failed at chunk ${i / chunkSize + 1}`);
            insertedOrUpdated += data?.length || 0;
            write({ type: "log", message: `Upserted chunk ${i / chunkSize + 1} (${chunk.length} rows)…` });
          }

          // Store rejects
          write({ type: "log", message: `Saving ${rejects.length} rejects…` });
          for (let i = 0; i < rejects.length; i += 1000) {
            const chunk = rejects.slice(i, i + 1000).map((r) => ({ import_id: importId, email: r.email, reason: r.reason }));
            const { error } = await supabase.from("import_rejects").insert(chunk);
            if (error) throw new Error("Failed saving rejects");
          }

          // Update import summary
          const { error: updErr } = await supabase
            .from("imports")
            .update({
              inserted: insertedOrUpdated,
              skipped_duplicate: inFileDup,
              skipped_suppressed: skippedSuppressed,
              invalid,
            })
            .eq("id", importId);

          if (updErr) throw new Error("Failed updating import summary");

          const summary = {
            filename,
            import_id: importId,
            stats: {
              total,
              processed,
              accepted: accepted.length,
              inserted_or_updated: insertedOrUpdated,
              in_file_duplicates: inFileDup,
              suppressed: skippedSuppressed,
              invalid,
              rejects: rejects.length,
            },
          };

          write({ type: "summary", ...summary });
          controller.close();
        } catch (e: any) {
          const msg = e?.message || "Import failed";
          controller.enqueue(enc.encode(JSON.stringify({ type: "error", message: msg }) + "\n"));
          controller.close();
        }
      },
    }),
    {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    }
  );
} 