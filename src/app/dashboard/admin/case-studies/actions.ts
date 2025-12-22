"use server";

import { revalidatePath } from "next/cache";
import { getServerSupabase, supabaseAdmin } from "@/lib/supabase/server";

function isAdminEmail(email?: string | null): boolean {
  const list = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return !!(email && list.includes(email.toLowerCase()));
}

export async function setCaseStudyApproval(formData: FormData) {
  const id = String(formData.get("id") || "").trim();
  const approved = String(formData.get("approved") || "").trim() === "true";
  if (!id) return;

  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isAdminEmail(user?.email)) return;

  const sb = supabaseAdmin();
  await sb.from("case_studies").update({ approved_for_use: approved }).eq("id", id);

  revalidatePath("/dashboard/admin/case-studies");
  revalidatePath(`/dashboard/admin/case-studies/${id}`);
}









