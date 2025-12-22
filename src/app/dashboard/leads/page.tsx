// app/dashboard/leads/page.tsx
"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { getBrowserSupabase } from "@/utils/supabase/client";
import LeadsFilters from "@/components/dashboard/LeadsFilters";
import Pagination from "@/components/dashboard/Pagination";
import LeadsTable from "@/components/dashboard/LeadsTable";
import { EmptyState } from "@/components/EmptyState";
import { Upload, Users } from "lucide-react";
import { useRouter } from "next/navigation";

type Lead = {
  id: string;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  company?: string | null;
  thread_id?: string | null;
  status: "new" | "queued" | "sent" | "bounced" | "replied" | "failed" | "retrying" | "paused";
  created_at: string;
  updated_at?: string;
  campaign_id?: string | null;
};

export default function LeadsPage() {
  const searchParams = useSearchParams();
  const status = searchParams.get("status") ?? "all";
  const page = Number(searchParams.get("page") ?? "1");
  const perPage = Number(searchParams.get("perPage") ?? "20");
  const campaignId = searchParams.get("campaignId") || undefined;
  const search = searchParams.get("search") || undefined;

  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const supabase = useMemo(() => getBrowserSupabase(), []);
  const router = useRouter();

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        status,
        page: String(page),
        perPage: String(perPage),
      });
      if (campaignId) params.set("campaignId", campaignId);
      if (search) params.set("search", search);

      const res = await fetch(`/api/leads/dashboard?${params.toString()}`);
      const json = await res.json();

      if (!res.ok) {
        console.error("Failed to fetch leads:", json.error);
      } else {
        setLeads(json.leads || []);
        setTotal(json.total || 0);
        setTotalPages(json.totalPages || 1);
      }
    } catch (error) {
      console.error("Error fetching leads:", error);
    } finally {
      setLoading(false);
    }
  }, [status, campaignId, search, page, perPage]);

  // Fetch leads when filters or pagination change
  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  // Set up realtime subscription for new inserts (only once)
  useEffect(() => {
    const channel = supabase
      .channel("leads-changes")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "leads" },
        (payload) => {
          const newLead = payload.new as Lead;
          
          // Check if the new lead matches current filters
          let matchesFilters = true;
          if (status && status !== "all" && newLead.status !== status) {
            matchesFilters = false;
          }
          if (campaignId && newLead.campaign_id !== campaignId) {
            matchesFilters = false;
          }
          if (search && !newLead.email.toLowerCase().includes(search.toLowerCase())) {
            matchesFilters = false;
          }

          // Prepend if it matches filters
          if (matchesFilters) {
            setLeads((prev) => {
              // Avoid duplicates
              if (prev.some((l) => l.id === newLead.id)) {
                return prev;
              }
              // Prepend the new lead
              return [newLead, ...prev];
            });
            // Update total count
            setTotal((prev) => prev + 1);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, status, campaignId, search]);

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <div className="max-w-6xl mx-auto p-6">
        <h1 className="text-2xl font-semibold mb-4">Leads</h1>

        <LeadsFilters />

        <div className="mt-4 text-sm text-gray-400">
          {loading ? "Loading..." : `${total} lead${total === 1 ? "" : "s"} found`}
        </div>

        <div className="mt-3">
          {!loading && total === 0 ? (
            <EmptyState
              title="No leads yet"
              subtitle="Import your first CSV file to get started with SmartSend."
              cta="Import Leads"
              onClick={() => router.push("/dashboard/leads/import")}
              icon={Users}
            />
          ) : (
            <>
              <LeadsTable leads={leads} />
              <Pagination page={page} totalPages={totalPages} />
            </>
          )}
        </div>
      </div>
    </main>
  );
} 