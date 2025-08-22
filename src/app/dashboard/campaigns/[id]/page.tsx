"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { createClientComponentClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function CampaignPage({ params }: { params: { id: string } }) {
  const id = params.id;
  const supabase = createClientComponentClient();
  const router = useRouter();
  const [sum, setSum] = useState<any>(null);
  const [auto, setAuto] = useState(true);
  const [running, setRunning] = useState(false);
  const [campaign, setCampaign] = useState<any>(null);
  const [contacts, setContacts] = useState<any[]>([]);
  const [assigned, setAssigned] = useState<any[]>([]);
  const [subject2, setSubject2] = useState("");
  const [body2, setBody2] = useState("");
  const [delay, setDelay] = useState(3);

  async function load() {
    const r = await fetch(`/api/campaigns/${id}/summary`);
    setSum(await r.json());
  }
  async function start() {
    await fetch(`/api/campaigns/${id}/start`, { method: "POST" });
    setRunning(true);
    await run();
  }
  async function pause() {
    await fetch(`/api/campaigns/${id}/pause`, { method: "POST" });
    setRunning(false);
  }
  async function run() {
    const r = await fetch(`/api/campaigns/${id}/run`, { method: "POST" });
    const j = await r.json();
    if (j?.done) setRunning(false);
    await load();
  }

  async function handleAddStep(e: React.FormEvent) {
    e.preventDefault();
    await supabase.from("sequence_steps").insert([
      { campaign_id: id, step_number: 2, subject: subject2, body: body2, delay_days: delay }
    ]);
    setSubject2("");
    setBody2("");
    setDelay(3);
    router.refresh();
  }

  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!auto) return;
    const t = setInterval(() => { if (sum?.status === "running") run(); }, 1200);
    return () => clearInterval(t);
  }, [auto, sum?.status]);

  useEffect(() => {
    let cancelled = false;
    const fetchAll = async () => {
      const { data: camp } = await supabase
        .from("campaigns")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (!cancelled) setCampaign(camp || null);

      const { data: authUser } = await supabase.auth.getUser();
      const userId = (authUser as any)?.user?.id;
      if (userId) {
        const { data: myContacts } = await supabase
          .from("contacts")
          .select("*")
          .eq("user_id", userId);
        if (!cancelled) setContacts(myContacts || []);
      }

      const { data: assignedRows } = await supabase
        .from("campaign_contacts")
        .select("contact_id, contacts(*)")
        .eq("campaign_id", id);
      if (!cancelled) setAssigned((assignedRows || []).map((r: any) => r.contacts));
    };
    fetchAll();
    return () => { cancelled = true; };
  }, [id, supabase]);

  async function handleAssign(contactId: string) {
    await supabase.from("campaign_contacts").insert([{ campaign_id: id, contact_id: contactId }]);
    const { data: assignedRows } = await supabase
      .from("campaign_contacts")
      .select("contact_id, contacts(*)")
      .eq("campaign_id", id);
    setAssigned((assignedRows || []).map((r: any) => r.contacts));
  }

  const pct = sum?.total ? Math.round(((sum?.sent || 0) / sum.total) * 100) : 0;
  const opens = (sum?.opens ?? 0);
  const clicks = (sum?.clicks ?? 0);
  const openRate = sum?.total ? Math.round((opens / sum.total) * 100) : 0;
  const clickRate = sum?.total ? Math.round((clicks / sum.total) * 100) : 0;

  return (
    <div className="p-6 max-w-3xl space-y-4">
      <Link href="/dashboard/campaigns" className="text-sm text-gray-600 underline">← Back to Campaigns</Link>
      <h1 className="text-2xl font-semibold">{campaign?.name || "Campaign"}</h1>
      <div className="rounded-2xl border p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm">Status: <b>{sum?.status || campaign?.status || "draft"}</b></div>
          <label className="text-xs flex items-center gap-2">
            <input type="checkbox" checked={auto} onChange={e=>setAuto(e.target.checked)} /> Auto-run
          </label>
        </div>
        <div className="mt-2 text-sm">{sum?.sent || 0} / {sum?.total || 0} sent ({pct}%) • failed {sum?.failed || 0}</div>
        <div className="mt-2 h-2 w-full rounded-full bg-gray-100"><div className="h-2 bg-black rounded-full" style={{width:`${pct}%`}}/></div>
        <div className="mt-3 flex gap-2">
          <button onClick={start} className="rounded-xl bg-black px-4 py-2 text-white">Start</button>
          <button onClick={pause} className="rounded-xl border px-4 py-2">Pause</button>
          <button onClick={run} className="rounded-xl border px-4 py-2">Run batch</button>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
          <div className="rounded-xl border p-3">Opens: <b>{opens}</b> ({openRate}%)</div>
          <div className="rounded-xl border p-3">Clicks: <b>{clicks}</b> ({clickRate}%)</div>
          <div className="rounded-xl border p-3">Failed: <b>{sum?.failed || 0}</b></div>
        </div>
        {/* Funnel */}
        <div className="mt-4">
          <div className="text-sm font-medium mb-2">Engagement funnel</div>
          <div className="space-y-2">
            <div>
              <div className="text-xs text-gray-600 mb-1">Sent ({sum?.sent || 0})</div>
              <div className="h-2 bg-gray-100 rounded-full">
                <div className="h-2 bg-gray-800 rounded-full" style={{ width: `${pct}%` }} />
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-600 mb-1">Opened ({opens})</div>
              <div className="h-2 bg-gray-100 rounded-full">
                <div className="h-2 bg-blue-600 rounded-full" style={{ width: `${sum?.total ? Math.min(100, Math.round((opens / sum.total) * 100)) : 0}%` }} />
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-600 mb-1">Clicked ({clicks})</div>
              <div className="h-2 bg-gray-100 rounded-full">
                <div className="h-2 bg-green-600 rounded-full" style={{ width: `${sum?.total ? Math.min(100, Math.round((clicks / sum.total) * 100)) : 0}%` }} />
              </div>
            </div>
          </div>
        </div>
        {/* Follow-Up Form */}
        <form onSubmit={handleAddStep} className="mt-8 p-6 bg-white rounded-2xl shadow space-y-4">
          <h2 className="text-xl font-semibold">➕ Add Follow-Up Step</h2>
          <input
            type="text"
            placeholder="Follow-up subject"
            value={subject2}
            onChange={(e) => setSubject2(e.target.value)}
            className="w-full px-4 py-3 border rounded-xl"
            required
          />
          <textarea
            placeholder="Follow-up body"
            value={body2}
            onChange={(e) => setBody2(e.target.value)}
            rows={4}
            className="w-full px-4 py-3 border rounded-xl"
            required
          />
          <input
            type="number"
            placeholder="Delay in days (default 3)"
            value={delay}
            onChange={(e) => setDelay(Number(e.target.value))}
            className="w-full px-4 py-3 border rounded-xl"
            required
          />
          <button type="submit" className="px-6 py-3 rounded-xl bg-black text-white font-semibold hover:opacity-90">
            Save Follow-Up
          </button>
        </form>
      </div>

      <div className="mt-6">
        <h2 className="text-xl font-semibold">Assign Contacts</h2>
        <p className="text-gray-600 mb-4">Choose leads to include in this campaign.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {contacts.map((c) => (
            <div key={c.id} className="p-4 bg-white border rounded-2xl flex items-center justify-between">
              <div>
                <div className="font-medium">{c.name || "Unnamed"}</div>
                <div className="text-gray-600 text-sm">{c.email}</div>
              </div>
              <button onClick={() => handleAssign(c.id)} className="px-3 py-1 rounded-xl bg-black text-white text-sm hover:opacity-90">Add</button>
            </div>
          ))}
        </div>
      </div>

      {assigned.length > 0 && (
        <div className="mt-6">
          <h2 className="text-xl font-semibold mb-4">Assigned Contacts</h2>
          <div className="overflow-x-auto rounded-2xl border">
            <table className="min-w-full text-left">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-4 py-2 border">Name</th>
                  <th className="px-4 py-2 border">Email</th>
                </tr>
              </thead>
              <tbody>
                {assigned.map((c: any) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 border text-sm">{c.name || "-"}</td>
                    <td className="px-4 py-2 border text-sm">{c.email}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

