import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(url, service);

async function main() {
  const campaignName = process.env.CAMPAIGN_NAME || "Seed Campaign — Import Test";
  const csvPath = process.env.CSV_PATH || "seeds/sample_leads.csv";

  const { data: camp, error: campErr } = await supabase
    .from("campaigns")
    .insert({ name: campaignName, status: "draft" })
    .select("id")
    .single();
  if (campErr) throw campErr;
  const campaignId = camp.id as string;
  console.log("Campaign:", campaignId);

  const key = `imports/seed/${crypto.randomUUID()}.csv`;
  const file = readFileSync(csvPath);
  const { error: upErr } = await supabase.storage
    .from("app-uploads")
    .upload(key, file, { contentType: "text/csv", upsert: false });
  if (upErr) throw upErr;
  console.log("Uploaded:", key);

  const res = await fetch("http://localhost:3000/api/import-leads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      campaignId,
      fileKey: key,
      mapping: { email: "email", first_name: "first_name", last_name: "last_name", company: "company" },
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(json));
  console.log("Import result:", json);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

