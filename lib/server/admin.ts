import { createClient } from "@/lib/supabase/server";

export async function getAdminUser() {
  const supabase = createClient();
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes?.user;

  if (!user) return null;

  const adminEnv = process.env.ADMIN_EMAILS || "";
  const allowed = adminEnv
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  const email = (user.email || "").toLowerCase();

  if (!allowed.includes(email)) return null;

  return { user, supabase };
}

export async function assertAdminOrThrow() {
  const ctx = await getAdminUser();
  if (!ctx) {
    const error: any = new Error("not_admin");
    error.code = "not_admin";
    throw error;
  }
  return ctx;
}




