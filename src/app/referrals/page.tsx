import Link from "next/link";
import { supabaseAdmin } from "@/server/supabase";

export default async function ReferralsPage() {
  const userId = process.env.DEMO_USER_ID || "REPLACE_WITH_AUTHED_USER_ID";
  const { data: prof } = await supabaseAdmin
    .from("profiles")
    .select("referral_code, credit_months")
    .eq("id", userId)
    .single();
  const code = (prof as any)?.referral_code ?? "…";
  const linkBase = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const link = `${linkBase}/signup?ref=${code}`;

  const { data: stats } = await supabaseAdmin.rpc("referral_stats", { p_inviter: userId });

  return (
    <div className="p-6 max-w-2xl mx-auto grid gap-6">
      <h1 className="text-2xl font-semibold">Invite friends</h1>
      <div className="rounded-2xl border p-4">
        <div className="text-sm text-gray-600 mb-2">Your link</div>
        <div className="flex items-center gap-3">
          <code className="px-3 py-2 bg-gray-100 rounded">{link}</code>
        </div>
        <div className="mt-3 text-sm text-gray-600">
          Free months available: <b>{(prof as any)?.credit_months ?? 0}</b>
        </div>
      </div>
      <div className="rounded-2xl border p-4">
        <div className="font-medium mb-2">Stats</div>
        <div className="text-sm text-gray-700">
          Invited: <b>{(stats as any)?.invited ?? 0}</b> • Joined: <b>{(stats as any)?.joined ?? 0}</b> • Converted: <b>{(stats as any)?.converted ?? 0}</b>
        </div>
      </div>
      <Link href="/dashboard" className="text-sm underline text-gray-700">Back to dashboard</Link>
    </div>
  );
}

