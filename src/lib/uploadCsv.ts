// src/lib/uploadCsv.ts

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Calls supabase edge function `importCsv` with multipart/form-data.
 * Accepts optional `mapping` object from your column-mapping modal:
 *   { email: "Email Address", first_name: "First Name", last_name: "Last Name", company: "Company" }
 */
export async function uploadCsvToSupabaseFn(params: {
  file: File;
  campaignId: string;
  mapping?: Record<string, string>;
}) {
  const { file, campaignId, mapping } = params;

  const form = new FormData();
  form.append("file", file);
  form.append("campaign_id", campaignId);
  if (mapping && Object.keys(mapping).length) {
    form.append("mapping", JSON.stringify(mapping));
  }

  const res = await fetch(`${SUPABASE_URL}/functions/v1/importCsv`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: form,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as any)?.error || "Import failed");
  }

  // Expected shape from function:
  // { message: "Import complete", imported: number, errors: Array<{row:number, error:string, raw?:any, email?:string}> }
  return data as {
    message: string;
    imported: number;
    errors: Array<Record<string, any>>;
    error_csv_url?: string | null;
    errors_preview?: Array<Record<string, any>>;
  };
}















