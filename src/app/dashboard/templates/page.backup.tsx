"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Button } from "@/components/ui/Button";
import { useRouter, useSearchParams } from "next/navigation";

interface EmailTemplate {
  id: string;
  category: string;
  intent: string;
  title: string;
  body: string;
  created_at: string;
  is_public: boolean;
}

export default function TemplatesPage() {
  const supabase = createClientComponentClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [intentFilter, setIntentFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [rewritingId, setRewritingId] = useState<string | null>(null);

  useEffect(() => {
    loadTemplates();
  }, [search, categoryFilter, intentFilter]);

  async function loadTemplates() {
    setLoading(true);
    try {
      let query = supabase
        .from("email_templates")
        .select("*")
        .eq("is_public", true);

      if (search) {
        // Use PostgREST or filter syntax: column.operator.value,column2.operator.value
        query = query.or(`title.ilike.%${search}%,body.ilike.%${search}%`);
      }
      if (categoryFilter) {
        query = query.eq("category", categoryFilter);
      }
      if (intentFilter) {
        query = query.eq("intent", intentFilter);
      }

      query = query.order("created_at", { ascending: false });

      const { data, error } = await query;
      if (error) throw error;
      setTemplates(data || []);
    } catch (error) {
      console.error("Error loading templates:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleRewrite(templateId: string, body: string) {
    setRewritingId(templateId);
    try {
      const res = await fetch("/api/campaigns/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          text: body, 
          tone: "personalized",
          keepPlaceholders: true 
        }),
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Rewrite failed");
      }

      const result = await res.json();
      const rewritten = result.text || body;
      
      // Show rewritten text in a dialog or update the template in view
      const useRewritten = confirm(
        `Rewritten version:\n\n${rewritten}\n\nUse this version?`
      );
      
      if (useRewritten) {
        // Navigate to sequence editor with rewritten template
        router.push(`/dashboard/sequences/new?templateId=${templateId}&rewritten=${encodeURIComponent(rewritten)}`);
      }
    } catch (error: any) {
      alert(`Error: ${error.message || "Failed to rewrite"}`);
    } finally {
      setRewritingId(null);
    }
  }

  function handleUseTemplate(templateId: string) {
    router.push(`/dashboard/sequences/new?templateId=${templateId}`);
  }

  function handleCopy(body: string) {
    navigator.clipboard.writeText(body);
    alert("Template copied to clipboard!");
  }

  // Get unique categories and intents for filters
  const categories = Array.from(new Set(templates.map(t => t.category))).sort();
  const intents = Array.from(new Set(templates.map(t => t.intent))).sort();

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Template Library ⚡</h1>
          <p className="text-muted-foreground mt-2">
            High-performing cold email templates — one-click insert into campaigns
          </p>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex gap-4 flex-wrap items-end">
        <div className="flex-1 min-w-[300px]">
          <label className="block text-sm font-medium mb-1">Search</label>
          <input
            placeholder="Search templates by title or content..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border rounded-xl px-4 py-2 w-full"
          />
        </div>
        <div className="min-w-[150px]">
          <label className="block text-sm font-medium mb-1">Category</label>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="border rounded-xl px-3 py-2 w-full"
          >
            <option value="">All Categories</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[150px]">
          <label className="block text-sm font-medium mb-1">Intent</label>
          <select
            value={intentFilter}
            onChange={(e) => setIntentFilter(e.target.value)}
            className="border rounded-xl px-3 py-2 w-full"
          >
            <option value="">All Intents</option>
            {intents.map((int) => (
              <option key={int} value={int}>
                {int}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Templates Grid */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">
          Loading templates...
        </div>
      ) : templates.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          No templates found. Try adjusting your search or filters.
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((t) => (
            <div
              key={t.id}
              className="border rounded-2xl p-6 bg-background space-y-4 hover:shadow-md transition-shadow"
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-lg">{t.title}</h3>
                  <div className="flex gap-1">
                    <span className="px-2 py-1 text-xs rounded-lg bg-blue-100 text-blue-700">
                      {t.category}
                    </span>
                    <span className="px-2 py-1 text-xs rounded-lg bg-green-100 text-green-700">
                      {t.intent}
                    </span>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-3">
                  {t.body.slice(0, 150)}
                  {t.body.length > 150 ? "..." : ""}
                </p>
              </div>

              <div className="flex gap-2 flex-wrap">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleCopy(t.body)}
                >
                  Copy
                </Button>
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => handleUseTemplate(t.id)}
                >
                  Use Template
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => handleRewrite(t.id, t.body)}
                  disabled={rewritingId === t.id}
                >
                  {rewritingId === t.id ? "Rewriting..." : "✨ Personalize with AI"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="text-center text-sm text-muted-foreground pt-4">
        {templates.length} template{templates.length !== 1 ? "s" : ""} found
      </div>
    </div>
  );
}


