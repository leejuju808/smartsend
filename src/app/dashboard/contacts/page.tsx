"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import ContactsImporter from "@/components/ContactsImporter";
import { useSubscription } from "@/lib/useSubscription";

export default function Contacts() {
  const { status, loading } = useSubscription();
  const [items, setItems] = useState<any[]>([]);
  const [banner, setBanner] = useState<string>("");

  useEffect(() => {
    refresh();
  }, []);

  async function refresh() {
    const r = await fetch("/api/contacts/list");
    const j = await r.json();
    setItems(j.items || []);
  }

  if (loading) return <p className="p-10">Loading...</p>;

  if (status !== "pro" && status !== "active") {
    return (
      <main className="p-10">
        <h1 className="text-2xl font-bold">Upgrade Required 🚀</h1>
        <p className="mt-4 text-gray-600">
          Contacts management is a Pro feature. Upgrade to unlock importing and organizing leads.
        </p>
        <Link
          href="/dashboard/billing"
          className="mt-6 inline-block px-6 py-3 rounded-xl bg-black text-white font-semibold hover:opacity-90"
        >
          Upgrade to Pro
        </Link>
      </main>
    );
  }

  return (
    <main className="p-10 space-y-6">
      <h1 className="text-3xl font-bold">👥 Contacts</h1>
      {banner && (
        <div className="rounded-xl border p-3 text-sm bg-green-50 border-green-200 text-green-900">
          ⚡ {banner}
        </div>
      )}

      <ContactsImporter onImported={(r) => {
        setBanner(`${r.inserted} contacts uploaded.`);
        refresh();
        setTimeout(() => setBanner(""), 3000);
      }} />

      {items.length > 0 && (
        <div className="mt-2 overflow-x-auto">
          <h2 className="text-xl font-semibold mb-4">Your Contacts</h2>
          <table className="min-w-full border rounded-lg overflow-hidden">
            <thead className="bg-gray-100 text-left">
              <tr>
                <th className="px-4 py-2 border">Name</th>
                <th className="px-4 py-2 border">Email</th>
                <th className="px-4 py-2 border">Company</th>
                <th className="px-4 py-2 border">Score</th>
                <th className="px-4 py-2 border">Added</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row: any) => (
                <tr key={row.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 border text-sm">{row.name || "-"}</td>
                  <td className="px-4 py-2 border text-sm">{row.email}</td>
                  <td className="px-4 py-2 border text-sm">{row.company || "-"}</td>
                  <td className="px-4 py-2 border text-sm">{typeof row.lead_score === 'number' ? row.lead_score : '-'}</td>
                  <td className="px-4 py-2 border text-sm">{new Date(row.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
 

