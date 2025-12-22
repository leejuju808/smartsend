// Block 267100 — Estimate View: Preview → Send → Track v1

"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, CheckCircle2, Printer, ArrowLeft } from "lucide-react";

function formatMoney(value: any) {
  const n = typeof value === "number" ? value : parseFloat(value ?? "0");
  if (Number.isNaN(n)) return "$0.00";
  return `$${n.toFixed(2)}`;
}

function isPendingMoneyLabel(estimate: any, days: number) {
  const status = String(estimate?.status || "");
  if (status !== "sent" && status !== "waiting") return false;
  if (estimate?.approved_at) return false;
  if (!estimate?.sent_at) return false;
  const sentAt = new Date(estimate.sent_at).getTime();
  if (!Number.isFinite(sentAt)) return false;
  const ageDays = (Date.now() - sentAt) / (1000 * 60 * 60 * 24);
  return ageDays >= days;
}

export default function EstimateViewPage() {
  const params = useParams();
  const router = useRouter();
  const estimateId = params.id as string;

  const [estimate, setEstimate] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [sendOpen, setSendOpen] = useState(false);
  const [toEmail, setToEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [approving, setApproving] = useState(false);
  const [togglingFollowups, setTogglingFollowups] = useState(false);

  const lineItems = useMemo(() => {
    const arr = estimate?.line_items;
    return Array.isArray(arr) ? arr : [];
  }, [estimate]);

  const loadEstimate = async () => {
    try {
      const res = await fetch(`/api/estimates/${estimateId}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load estimate");
      const json = await res.json();
      setEstimate(json.estimate);
      const defaultEmail = json?.estimate?.sent_to_email || json?.estimate?.homeowner?.email || "";
      setToEmail(defaultEmail);
    } catch (e) {
      console.error(e);
      setEstimate(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (estimateId) loadEstimate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estimateId]);

  const handleSend = async () => {
    const email = toEmail.trim();
    if (!email) return alert("Enter an email address");

    setSending(true);
    try {
      const res = await fetch(`/api/estimates/${estimateId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to_email: email }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Send failed");
      setSendOpen(false);
      await loadEstimate();
      alert("Estimate sent.");
    } catch (e: any) {
      alert(e?.message || "Failed to send");
    } finally {
      setSending(false);
    }
  };

  const handleApprove = async () => {
    if (!confirm("Mark this estimate as approved?")) return;
    setApproving(true);
    try {
      const res = await fetch(`/api/estimates/${estimateId}/approve`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Approve failed");
      await loadEstimate();
      alert("Marked approved.");
    } catch (e: any) {
      alert(e?.message || "Failed to approve");
    } finally {
      setApproving(false);
    }
  };

  const followupStatus = String(estimate?.followup_status || (estimate?.approved_at ? "completed" : "active"));
  const followupsEnabled = followupStatus === "active";
  const followupLabel =
    followupStatus === "active"
      ? "Active"
      : followupStatus === "paused"
      ? "Paused"
      : followupStatus === "completed"
      ? "Completed"
      : followupStatus === "stale"
      ? "Stale"
      : followupStatus;

  const handleToggleFollowups = async (enabled: boolean) => {
    setTogglingFollowups(true);
    try {
      const res = await fetch(`/api/estimates/${estimateId}/followups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to update follow-ups");
      await loadEstimate();
    } catch (e: any) {
      alert(e?.message || "Failed to update follow-ups");
    } finally {
      setTogglingFollowups(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3" />
          <div className="h-64 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  if (!estimate) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Button variant="outline" onClick={() => router.push("/dashboard/estimates")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </div>
        <p>Estimate not found.</p>
      </div>
    );
  }

  const status = String(estimate.status || "draft");
  const pendingDays = Number(process.env.NEXT_PUBLIC_ESTIMATE_PENDING_DAYS || "5");
  const showPending = isPendingMoneyLabel(estimate, Number.isFinite(pendingDays) ? pendingDays : 5);
  const hasSmartSendEmail = !!estimate?.sent_at || String((estimate as any)?.delivery_status || "") === "sent";
  const hasHomeownerReply = !!(estimate as any)?.first_homeowner_reply_at || !!(estimate as any)?.first_homeowner_reply_message_id;
  const hasApproved = status === "approved" || !!estimate?.approved_at;
  const smartSendCostThisMonth = 99;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => router.push("/dashboard/estimates")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Estimate</h1>
            <p className="text-sm text-gray-600">
              {estimate.homeowner?.name || "Homeowner"} • {estimate.homeowner?.email || "No email"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {showPending && (
            <span className="px-2 py-1 text-xs rounded-full bg-amber-50 text-amber-800 border border-amber-200">
              {formatMoney(estimate.total ?? 0)} pending
            </span>
          )}
          {hasApproved && (
            <span className="px-2 py-1 text-xs rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
              Origin: SmartSend
            </span>
          )}
          <span
            className={`px-3 py-1 text-xs rounded-full ${
              status === "approved"
                ? "bg-green-100 text-green-800"
                : status === "waiting"
                ? "bg-amber-100 text-amber-800"
                : status === "sent"
                ? "bg-blue-100 text-blue-800"
                : status === "lost"
                ? "bg-red-100 text-red-800"
                : "bg-gray-100 text-gray-800"
            }`}
          >
            {status}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Estimate preview */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg shadow-sm p-6 border">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-sm text-gray-600">From</div>
                <div className="font-semibold">{estimate.company?.name || "SmartSend"}</div>
              </div>
              <div className="text-right">
                <div className="text-sm text-gray-600">Created</div>
                <div className="font-medium">
                  {estimate.created_at ? new Date(estimate.created_at).toLocaleDateString() : "—"}
                </div>
              </div>
            </div>

            <div className="border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Item
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                      Qty
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                      Unit
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {lineItems.length ? (
                    lineItems.map((li: any, idx: number) => (
                      <tr key={idx}>
                        <td className="px-4 py-2 text-sm">{li.material || li.description || `Item ${idx + 1}`}</td>
                        <td className="px-4 py-2 text-sm text-right">{li.quantity ?? ""}</td>
                        <td className="px-4 py-2 text-sm text-right">{li.unit_price != null ? formatMoney(li.unit_price) : ""}</td>
                        <td className="px-4 py-2 text-sm text-right font-medium">{formatMoney(li.total ?? 0)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="px-4 py-6 text-sm text-gray-500" colSpan={4}>
                        No line items.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex justify-end">
              <div className="w-full max-w-sm text-sm">
                <div className="flex justify-between py-1">
                  <span className="text-gray-600">Subtotal</span>
                  <span className="font-medium">{formatMoney(estimate.subtotal ?? 0)}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-gray-600">Tax</span>
                  <span className="font-medium">{formatMoney(estimate.tax ?? 0)}</span>
                </div>
                <div className="flex justify-between py-2 border-t mt-1">
                  <span className="font-semibold">Total</span>
                  <span className="font-semibold text-blue-600">{formatMoney(estimate.total ?? 0)}</span>
                </div>
              </div>
            </div>

            {estimate.notes && (
              <div className="mt-4 p-4 bg-gray-50 rounded-lg border">
                <div className="text-xs font-medium text-gray-600 mb-1">Notes</div>
                <div className="text-sm whitespace-pre-wrap">{estimate.notes}</div>
              </div>
            )}
          </div>
        </div>

        {/* Preview panel (canonical actions) */}
        <div className="lg:col-span-1 space-y-4">
          {/* Block 268600 — Ultra-simple status tracking */}
          <div className="bg-white rounded-lg shadow-sm p-4 border">
            <div className="text-sm font-semibold mb-2">Estimate status</div>
            <div className="text-xs text-gray-600 mb-3">
              No notes. No dates. Just state.
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-700 block">
                Status
              </label>
              <select
                className="w-full border rounded-lg px-2 py-2 text-sm"
                value={status}
                onChange={async (e) => {
                  const next = e.target.value;
                  if (next === status) return;
                  if (next === "approved") {
                    await handleApprove();
                    return;
                  }
                  // Lost requires optional reason; handled below.
                  const res = await fetch(`/api/estimates/${estimateId}/status`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ status: next }),
                  });
                  const json = await res.json().catch(() => ({}));
                  if (!res.ok) alert(json?.error || "Failed to update status");
                  await loadEstimate();
                }}
                disabled={approving || sending || togglingFollowups}
              >
                <option value="draft">Draft</option>
                <option value="sent">Estimate sent</option>
                <option value="waiting">Waiting on homeowner</option>
                <option value="approved">Approved</option>
                <option value="lost">Lost</option>
              </select>

              {status === "lost" && (
                <div className="pt-2">
                  <label className="text-xs font-medium text-gray-700 block mb-1">
                    Lost reason (optional)
                  </label>
                  <select
                    className="w-full border rounded-lg px-2 py-2 text-sm"
                    value={String(estimate?.lost_reason || "")}
                    onChange={async (e) => {
                      const lost_reason = e.target.value || null;
                      const res = await fetch(`/api/estimates/${estimateId}/status`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ status: "lost", lost_reason }),
                      });
                      const json = await res.json().catch(() => ({}));
                      if (!res.ok) alert(json?.error || "Failed to save lost reason");
                      await loadEstimate();
                    }}
                    disabled={approving || sending || togglingFollowups}
                  >
                    <option value="">—</option>
                    <option value="price">Price</option>
                    <option value="timing">Timing</option>
                    <option value="no_response">No response</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-4 border">
            <div className="text-sm font-semibold mb-2">Send & Track</div>
            <div className="text-xs text-gray-600 mb-3">
              Send today. Homeowners reply faster. You look professional.
            </div>
            <div className="space-y-2">
              <Button className="w-full" onClick={() => setSendOpen(true)}>
                <Send className="w-4 h-4 mr-2" />
                Send to Homeowner
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => window.print()}
              >
                <Printer className="w-4 h-4 mr-2" />
                Download / Print
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={handleApprove}
                disabled={approving}
              >
                <CheckCircle2 className="w-4 h-4 mr-2" />
                {approving ? "Marking..." : "Mark as Approved"}
              </Button>
            </div>
          </div>

          {/* Block 269000 — Follow-Up Control (minimal) */}
          <div className="bg-white rounded-lg shadow-sm p-4 border">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold">Auto Follow-Ups</div>
              <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700">
                {followupLabel}
              </span>
            </div>
            <div className="text-xs text-gray-600 mb-3">
              SmartSend follows up on every sent estimate (Day 2 / 5 / 9) unless you turn it off.
            </div>

            <label className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium">Auto Follow-Ups</span>
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={followupsEnabled}
                disabled={togglingFollowups || status === "approved"}
                onChange={(e) => handleToggleFollowups(e.target.checked)}
              />
            </label>

            <div className="mt-3 text-xs text-gray-600 space-y-1">
              <div>
                <span className="font-medium">Next follow-up:</span>{" "}
                {estimate.next_followup_at ? new Date(estimate.next_followup_at).toLocaleString() : "—"}
              </div>
              <div>
                <span className="font-medium">Last follow-up:</span>{" "}
                {estimate.last_followup_at ? new Date(estimate.last_followup_at).toLocaleString() : "—"}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-4 border">
            <div className="text-sm font-semibold mb-2">Proof</div>
            <div className="text-xs text-gray-600">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`px-2 py-1 rounded-full border ${hasSmartSendEmail ? "bg-emerald-50 text-emerald-800 border-emerald-200" : "bg-gray-50 text-gray-700 border-gray-200"}`}>
                  SmartSend Email
                </span>
                <span className="text-gray-400">→</span>
                <span className={`px-2 py-1 rounded-full border ${hasHomeownerReply ? "bg-emerald-50 text-emerald-800 border-emerald-200" : "bg-gray-50 text-gray-700 border-gray-200"}`}>
                  Homeowner Reply
                </span>
                <span className="text-gray-400">→</span>
                <span className="px-2 py-1 rounded-full border bg-emerald-50 text-emerald-800 border-emerald-200">
                  Estimate
                </span>
                <span className="text-gray-400">→</span>
                <span className={`px-2 py-1 rounded-full border ${hasApproved ? "bg-emerald-50 text-emerald-800 border-emerald-200" : "bg-gray-50 text-gray-700 border-gray-200"}`}>
                  Approved
                </span>
              </div>

              {status === "approved" ? (
                <div className="mt-3 space-y-1">
                  <div>
                    <span className="font-medium">Estimated value:</span> {formatMoney(estimate.total ?? 0)}
                  </div>
                  <div>
                    <span className="font-medium">SmartSend cost this month:</span> {formatMoney(smartSendCostThisMonth)}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* Send modal */}
      {sendOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
          <div className="w-full max-w-lg bg-white rounded-lg shadow-xl p-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-semibold">Send to Homeowner</h3>
              <button
                onClick={() => setSendOpen(false)}
                className="text-gray-500 hover:text-gray-800"
              >
                ✕
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Subject: <span className="font-medium">Your Roofing Estimate from {estimate.company?.name || "SmartSend"}</span>
            </p>
            <label className="block text-sm font-medium mb-2">Email</label>
            <Input
              type="email"
              value={toEmail}
              onChange={(e) => setToEmail(e.target.value)}
              placeholder="homeowner@example.com"
            />
            <div className="mt-5 flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setSendOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSend} disabled={sending}>
                {sending ? "Sending..." : "Confirm Send"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}










