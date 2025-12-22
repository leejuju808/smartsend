import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type Row = {
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  company?: string | null;
  title?: string | null;
  phone?: string | null;
};

function isEmail(x: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x);
}

export async function POST(req: Request) {
  try {
    const { rows } = await req.json();
    if (!Array.isArray(rows)) {
      return NextResponse.json({ error: "rows must be array" }, { status: 400 });
    }

    const normalized: Row[] = [];
    const invalid: number[] = [];
    const seen = new Map<string, number[]>();

    rows.forEach((r: Row, idx: number) => {
      const email = (r.email || "").toLowerCase().trim();
      if (!isEmail(email)) {
        invalid.push(idx);
      } else {
        normalized.push({
          email,
          first_name: r.first_name?.trim() || null,
          last_name: r.last_name?.trim() || null,
          company: r.company?.trim() || null,
          title: r.title?.trim() || null,
          phone: r.phone?.trim() || null,
        });
        const arr = seen.get(email) || [];
        arr.push(idx);
        seen.set(email, arr);
      }
    });

    // duplicates in file
    const dupesInFile: number[] = [];
    for (const [, idxs] of seen.entries()) {
      if (idxs.length > 1) dupesInFile.push(...idxs.slice(1));
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const emails = normalized.map((r) => r.email);

    // suppression check
    const { data: suppr, error: e1 } = await supabase
      .from("suppressions")
      .select("email")
      .in("email", emails);
    if (e1) throw e1;
    const suppressedSet = new Set((suppr ?? []).map((s) => s.email.toLowerCase()));

    // existing contacts
    const { data: existing, error: e2 } = await supabase
      .from("contacts")
      .select("email, first_name, last_name, company, title, phone")
      .in("email", emails);
    if (e2) throw e2;

    const existingMap = new Map(
      (existing ?? []).map((c) => [c.email.toLowerCase(), c])
    );

    const suppressed: number[] = [];
    const existingIdx: number[] = [];
    const toInsert: number[] = [];
    const toUpdate: number[] = [];

    normalized.forEach((r, idx) => {
      if (suppressedSet.has(r.email)) {
        suppressed.push(idx);
        return;
      }
      const ex = existingMap.get(r.email);
      if (!ex) {
        toInsert.push(idx);
      } else {
        existingIdx.push(idx);
        // differentiate updates vs identical
        const changed =
          (r.first_name ?? null) !== (ex.first_name ?? null) ||
          (r.last_name ?? null) !== (ex.last_name ?? null) ||
          (r.company ?? null) !== (ex.company ?? null) ||
          (r.title ?? null) !== (ex.title ?? null) ||
          (r.phone ?? null) !== (ex.phone ?? null);
        if (changed) toUpdate.push(idx);
      }
    });

    const result = {
      stats: {
        total_rows: rows.length,
        invalid_email: invalid.length,
        duplicates_in_file: dupesInFile.length,
        suppressed: suppressed.length,
        existing_contacts: existingIdx.length,
        to_insert: toInsert.length,
        to_update: toUpdate.length,
      },
      normalized,
      classified: {
        invalid,
        dupesInFile,
        suppressed,
        existing: existingIdx,
        toInsert,
        toUpdate,
      },
    };

    return NextResponse.json(result);
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}