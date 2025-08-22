"use client";
import Link from "next/link";
import { useSubscription } from "@/lib/useSubscription";
import { useEffect, useState } from "react";
import { createClientComponentClient } from "@/lib/supabase";

export default function CampaignsIndex() {
  const { status, loading } = useSubscription();
  const supabase = createClientComponentClient();
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [scheduledAt, setScheduledAt] = useState<string>("");
  const [error, setError] = useState("");
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const loadUser = async () => {
      const { data } = await supabase.auth.getUser();
      if (data?.user) {
        setUserId(data.user.id);
        fetchCampaigns(data.user.id);
      }
    };
    loadUser();
  }, [supabase]);

  const fetchCampaigns = async (uid: string) => {
    const { data, error } = await supabase
      .from("campaigns")
      .select("*")
      .eq("user_id", uid)
      .order("created_at", { ascending: false });

    if (!error && data) setCampaigns(data);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !subject || !body) {
      setError("All fields are required.");
      return;
    }
    if (!userId) return;

    const resp = await fetch("/api/campaigns/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId: null,
        name: title,
        subject,
        body,
        contactIds: [],
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
      }),
    });
    if (!resp.ok) {
      const j = await resp.json().catch(() => ({}));
      setError("Error saving campaign: " + (j?.error || resp.statusText));
      return;
    }
    setTitle("");
    setSubject("");
    setBody("");
    setScheduledAt("");
    fetchCampaigns(userId);
  };

  if (loading) return <p className="p-10">Loading...</p>;

  if (status !== "pro") {
    return (
      <main className="p-10">
        <h1 className="text-2xl font-bold">Upgrade Required 🚀</h1>
        <p className="mt-4 text-gray-600">
          Campaigns are a Pro feature. Upgrade to unlock email sending and tracking.
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
    <main className="p-10">
      <h1 className="text-3xl font-bold">✉️ Campaigns</h1>
      <p className="mt-4 text-gray-600">
        Create and track your cold email campaigns.
      </p>

      {/* New Campaign Form */}
      <form
        onSubmit={handleCreate}
        className="mt-6 p-6 bg-white rounded-2xl shadow space-y-4"
      >
        <input
          type="text"
          placeholder="Campaign title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full px-4 py-3 border rounded-xl"
          required
        />
        <input
          type="text"
          placeholder="Email subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="w-full px-4 py-3 border rounded-xl"
          required
        />
        <textarea
          placeholder="Email body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={5}
          className="w-full px-4 py-3 border rounded-xl"
          required
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Schedule (optional)</label>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="w-full px-4 py-3 border rounded-xl"
            />
          </div>
        </div>
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button
          type="submit"
          className="px-6 py-3 rounded-xl bg-black text-white font-semibold hover:opacity-90"
        >
          Save Campaign
        </button>
      </form>

      {/* Campaign List */}
      {campaigns.length > 0 && (
        <div className="mt-10 overflow-x-auto">
          <h2 className="text-xl font-semibold mb-4">Your Campaigns</h2>
          <table className="min-w-full border rounded-lg overflow-hidden">
            <thead className="bg-gray-100 text-left">
              <tr>
                <th className="px-4 py-2 border">Title</th>
                <th className="px-4 py-2 border">Subject</th>
                <th className="px-4 py-2 border">Status</th>
                <th className="px-4 py-2 border">Scheduled</th>
                <th className="px-4 py-2 border">Created</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 border text-sm">
                    <Link href={`/dashboard/campaigns/${c.id}`} className="text-black underline">
                      {c.title}
                    </Link>
                  </td>
                  <td className="px-4 py-2 border text-sm">{c.subject}</td>
                  <td className="px-4 py-2 border text-sm">{c.status}</td>
                  <td className="px-4 py-2 border text-sm">{c.scheduled_at ? new Date(c.scheduled_at).toLocaleString() : '-'}</td>
                  <td className="px-4 py-2 border text-sm">
                    {new Date(c.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

