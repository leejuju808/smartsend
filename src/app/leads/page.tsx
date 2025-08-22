"use client";
import LeadTable from "./ui/LeadTable";
import Link from "next/link";
import { useSubscription } from "@/lib/useSubscription";

export default function LeadsPage() {
  const { status, loading } = useSubscription();
  const userId = "REPLACE_WITH_AUTHED_USER_ID";

  if (loading) return <p className="p-6">Loading...</p>;

  if (status !== "pro") {
    return (
      <main className="p-6 max-w-3xl">
        <h1 className="text-2xl font-semibold">Upgrade Required 🚀</h1>
        <p className="mt-3 text-gray-600">
          Contacts management is a Pro feature. Upgrade to unlock importing and organizing leads.
        </p>
        <Link
          href="/dashboard/billing"
          className="mt-5 inline-block px-5 py-2.5 rounded-xl bg-black text-white font-medium hover:opacity-90"
        >
          Upgrade to Pro
        </Link>
      </main>
    );
  }

  return (
    <div className="p-6 grid gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Leads</h1>
        <a href="/leads/import" className="rounded-xl bg-black text-white px-4 py-2">Import CSV</a>
      </div>
      <LeadTable userId={userId} />
    </div>
  );
}
