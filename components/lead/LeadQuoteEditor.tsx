"use client";

import { useEffect, useState } from "react";

export function LeadQuoteEditor({ leadId }: { leadId: string }) {
  const [quote, setQuote] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);

  const [title, setTitle] = useState("Roofing Estimate");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<
    { label: string; quantity: number; unit_price: number }[]
  >([{ label: "", quantity: 1, unit_price: 0 }]);

  useEffect(() => {
    // v1: auto-load most recent quote if exists
    async function load() {
      try {
        const res = await fetch(`/api/lead-quotes/latest?lead_id=${leadId}`);
        if (res.ok) {
          const data = await res.json();
          if (data) {
            setQuote(data);
            setTitle(data.title || "Roofing Estimate");
            setNotes(data.notes || "");
            setItems(
              (data.quote_items || []).length > 0
                ? data.quote_items.map((it: any) => ({
                    label: it.label,
                    quantity: it.quantity,
                    unit_price: it.unit_price
                  }))
                : [{ label: "", quantity: 1, unit_price: 0 }]
            );
          }
        }
      } catch (err) {
        console.error("Failed to load quote:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [leadId]);

  function updateItem(idx: number, field: string, value: any) {
    setItems((prev) =>
      prev.map((it, i) =>
        i === idx ? { ...it, [field]: field === "label" ? value : Number(value) } : it
      )
    );
  }

  function addItem() {
    setItems((prev) => [...prev, { label: "", quantity: 1, unit_price: 0 }]);
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  async function saveDraft() {
    setSaving(true);
    try {
      const res = await fetch("/api/quotes/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quote_id: quote?.id,
          lead_id: leadId,
          title,
          notes,
          items: items.filter((it) => it.label.trim())
        })
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to save");
      }

      const data = await res.json();
      setQuote(data);
    } catch (err: any) {
      console.error("Failed to save quote:", err);
      alert(err.message || "Failed to save quote");
    } finally {
      setSaving(false);
    }
  }

  async function sendQuote() {
    let currentQuote = quote;
    
    if (!currentQuote?.id) {
      // Save draft first
      await saveDraft();
      // Wait a bit for the quote to be saved
      await new Promise(resolve => setTimeout(resolve, 500));
      // Reload to get the new quote ID
      const res = await fetch(`/api/lead-quotes/latest?lead_id=${leadId}`);
      if (res.ok) {
        const data = await res.json();
        if (data) {
          currentQuote = data;
          setQuote(data);
        }
      }
    }

    if (!currentQuote?.id) {
      alert("Please save the quote first");
      return;
    }

    setSending(true);
    try {
      const res = await fetch("/api/quotes/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quote_id: currentQuote.id })
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to send");
      }

      // Reload quote to get updated status
      const reloadRes = await fetch(`/api/lead-quotes/latest?lead_id=${leadId}`);
      if (reloadRes.ok) {
        const data = await reloadRes.json();
        if (data) {
          setQuote(data);
        }
      }

      alert("Quote sent successfully!");
    } catch (err: any) {
      console.error("Failed to send quote:", err);
      alert(err.message || "Failed to send quote");
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return <div className="text-xs text-gray-400">Loading estimate…</div>;
  }

  const total = quote?.total ?? 0;
  const status = quote?.status || "draft";

  return (
    <div className="space-y-3 rounded-xl bg-white/5 border border-white/10 p-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-white">
          Estimate / Quote
        </div>
        {status && (
          <div className="text-[11px] text-gray-300 uppercase">
            Status: {status}
          </div>
        )}
      </div>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-xs text-gray-200"
        placeholder="Estimate title"
      />

      <div className="space-y-2">
        <div className="text-[11px] text-gray-400">Line items</div>
        <div className="space-y-2">
          {items.map((it, idx) => (
            <div
              key={idx}
              className="grid grid-cols-[2fr,0.7fr,1fr,auto] gap-2 text-xs items-center"
            >
              <input
                placeholder="Tear-off and install new shingles"
                value={it.label}
                onChange={(e) => updateItem(idx, "label", e.target.value)}
                className="bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-gray-200"
              />
              <input
                type="number"
                min={1}
                value={it.quantity}
                onChange={(e) => updateItem(idx, "quantity", e.target.value)}
                className="bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-gray-200"
              />
              <input
                type="number"
                min={0}
                step="0.01"
                value={it.unit_price}
                onChange={(e) => updateItem(idx, "unit_price", e.target.value)}
                className="bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-gray-200"
                placeholder="$0.00"
              />
              {items.length > 1 && (
                <button
                  onClick={() => removeItem(idx)}
                  className="text-red-400 hover:text-red-300 text-xs"
                >
                  ×
                </button>
              )}
            </div>
          ))}
          <button
            onClick={addItem}
            className="text-[11px] text-yellow-300 underline"
          >
            + Add line item
          </button>
        </div>
      </div>

      <div>
        <div className="text-[11px] text-gray-400 mb-1">Internal notes</div>
        <textarea
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-xs text-gray-200"
          placeholder="Notes about scope, materials, insurance, etc. (internal only)"
        />
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-white/10">
        <div className="text-xs text-gray-300">
          Total:{" "}
          <span className="text-sm font-semibold text-yellow-300">
            ${Number(total).toLocaleString()}
          </span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={saveDraft}
            disabled={saving}
            className="px-3 py-1 rounded-lg bg-white/10 text-xs text-gray-200 border border-white/20 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save Draft"}
          </button>
          <button
            onClick={sendQuote}
            disabled={sending || status === "sent"}
            className="px-3 py-1 rounded-lg bg-yellow-500 text-xs font-semibold text-black disabled:opacity-50"
          >
            {sending ? "Sending…" : status === "sent" ? "Sent" : "Send to Homeowner"}
          </button>
        </div>
      </div>
    </div>
  );
}

