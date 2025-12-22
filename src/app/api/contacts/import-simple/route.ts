// app/api/contacts/import/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createBrowserClient } from "@supabase/ssr";

function parseCSV(text: string) {
  // simple CSV (comma, quoted values) for MVP
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return { headers: [], rows: [] };
  const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
  const rows = lines.slice(1).map(line => {
    const parts: string[] = [];
    let cur = "", q = false;
    for (let i=0;i<line.length;i++){
      const ch = line[i];
      if (ch === '"' ) { q = !q; continue; }
      if (ch === "," && !q) { parts.push(cur); cur=""; continue; }
      cur += ch;
    }
    parts.push(cur);
    const obj: Record<string,string> = {};
    headers.forEach((h, idx) => obj[h] = (parts[idx] ?? "").trim());
    return obj;
  });
  return { headers, rows };
}

export async function POST(req: NextRequest) {
  const { listName, csv } = await req.json(); // csv is a string
  if (!csv) return NextResponse.json({ error: "Missing CSV" }, { status: 400 });

  const cookieStore = cookies();
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (k: string) => cookieStore.get(k)?.value } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { rows } = parseCSV(csv);
  if (!rows.length) return NextResponse.json({ error: "No rows" }, { status: 400 });

  // ensure list
  const { data: list } = await supabase.from("lists").upsert({
    user_id: user.id, name: listName || "Imported List"
  }, { onConflict: "user_id,name" }).select().single();

  // upsert contacts in chunks of 500
  const chunks: any[][] = [];
  for (let i=0; i<rows.length; i+=500) chunks.push(rows.slice(i,i+500));
  let upsertedIds: string[] = [];

  for (const chunk of chunks) {
    const toUpsert = chunk
      .map(r => ({
        user_id: user.id,
        email: r.email || r.e || r["email address"],
        first_name: r.first_name || r.firstname || r.first || "",
        last_name: r.last_name || r.lastname || r.last || "",
        company: r.company || "",
        custom: { ...r }
      }))
      .filter(x => x.email);
    if (!toUpsert.length) continue;

    const { data: up } = await supabase
      .from("contacts")
      .upsert(toUpsert, { onConflict: "user_id,email" })
      .select("id");
    upsertedIds.push(...(up?.map(d => d.id) ?? []));
  }

  // add to list_members (ignore duplicates via PK)
  const memberRows = upsertedIds.map(id => ({ list_id: list!.id, contact_id: id }));
  for (let i=0; i<memberRows.length; i+=1000) {
    await supabase.from("list_members").upsert(memberRows.slice(i,i+1000));
  }

  return NextResponse.json({ ok: true, listId: list!.id, imported: upsertedIds.length });
}