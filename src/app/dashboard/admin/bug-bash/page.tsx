import "server-only";

import { notFound } from "next/navigation";
import { getServerSupabase } from "@/lib/supabase/server";
import BugBashClient from "./BugBashClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAdminEmail(email?: string | null): boolean {
  const list = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return !!(email && list.includes(email.toLowerCase()));
}

export default async function RevenueBugBashAdminPage() {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isAdminEmail(user?.email)) notFound();

  return <BugBashClient />;
}









