// Block 28844 — Stalled Quotes List Component
// Shows list of stalled quotes with revival timeline

"use client";

import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import QuoteDetailModal from "./QuoteDetailModal";

interface StalledQuote {
  id: string;
  lead_id: string;
  total: number;
  sent_at: string;
  status: string;
  leads: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
  };
}

interface Props {
  workspaceId: string;
}

export default function StalledQuotesList({ workspaceId }: Props) {
  const [quotes, setQuotes] = useState<StalledQuote[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedQuote, setSelectedQuote] = useState<string | null>(null);

  useEffect(() => {
    fetchStalledQuotes();
  }, [workspaceId]);

  const fetchStalledQuotes = async () => {
    try {
      setLoading(true);
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );

      // Get stalled quotes for this workspace
      const { data: leads } = await supabase
        .from("leads")
        .select("id")
        .eq("workspace_id", workspaceId);

      if (!leads || leads.length === 0) {
        setQuotes([]);
        return;
      }

      const leadIds = leads.map((l) => l.id);

      const { data: stalledQuotes, error } = await supabase
        .from("quotes")
        .select(`
          id,
          lead_id,
          total,
          sent_at,
          status,
          leads:lead_id (
            first_name,
            last_name,
            email,
            phone
          )
        `)
        .in("lead_id", leadIds)
        .eq("status", "stalled")
        .order("sent_at", { ascending: false })
        .limit(50);

      if (error) {
        console.error("Error fetching stalled quotes:", error);
      } else {
        setQuotes((stalledQuotes as any) || []);
      }
    } catch (error) {
      console.error("Error fetching stalled quotes:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="border rounded-2xl p-6 bg-white">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-1/3"></div>
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="border rounded-2xl p-6 bg-white">
        <h2 className="text-xl font-semibold mb-4">Stalled Quotes</h2>
        <p className="text-sm text-gray-600 mb-6">
          Quotes that haven't received a reply in 3+ days. Revival sequence is automatically scheduled.
        </p>

        {quotes.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No stalled quotes found. Great job keeping up with your quotes! 🎉
          </div>
        ) : (
          <div className="space-y-3">
            {quotes.map((quote) => {
              const lead = quote.leads as any;
              const name = `${lead?.first_name || ""} ${lead?.last_name || ""}`.trim() || "Unknown";
              const daysSinceSent = Math.floor(
                (new Date().getTime() - new Date(quote.sent_at).getTime()) / (1000 * 60 * 60 * 24)
              );

              return (
                <div
                  key={quote.id}
                  className="border rounded-lg p-4 hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => setSelectedQuote(quote.id)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="font-medium">{name}</div>
                      <div className="text-sm text-gray-600 mt-1">
                        Quote: ${Number(quote.total || 0).toLocaleString()}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        Sent {daysSinceSent} days ago
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
                        Stalled
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {selectedQuote && (
        <QuoteDetailModal
          quoteId={selectedQuote}
          onClose={() => setSelectedQuote(null)}
        />
      )}
    </>
  );
}


































