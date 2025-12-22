"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Zap, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabaseBrowser";

/**
 * Screen 3 — Quick Campaign Launcher
 * One-tap preset campaigns - NOT a full editor
 */
type CampaignTemplate = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  goal: string | null;
};

export default function MobileCampaignsPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<CampaignTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [launching, setLaunching] = useState<string | null>(null);

  useEffect(() => {
    loadTemplates();
  }, []);

  async function loadTemplates() {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push("/login");
        return;
      }

      // Get workspace
      const { data: workspace } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", session.user.id)
        .limit(1)
        .single();

      if (!workspace) return;

      // Fetch preset campaign templates
      const { data: campaignTemplates, error } = await supabase
        .from("campaign_templates")
        .select("id, name, description, category, goal")
        .eq("is_active", true)
        .order("name");

      if (error) {
        console.error("Error loading templates:", error);
        return;
      }

      // Filter to show only preset templates (not user-created complex ones)
      const presetTemplates = [
        {
          id: "lead_revival",
          name: "Lead Revival",
          description: "Re-engage cold leads",
          category: "re-engagement",
          goal: "book_estimates",
        },
        {
          id: "free_inspection",
          name: "Free Inspection",
          description: "Offer free roof inspection",
          category: "inspection",
          goal: "book_estimates",
        },
        {
          id: "storm_outreach",
          name: "Storm Outreach",
          description: "Reach out after storms",
          category: "storm",
          goal: "book_estimates",
        },
        {
          id: "repair_followup",
          name: "Repair Follow-Up",
          description: "Follow up on repair inquiries",
          category: "repair",
          goal: "book_estimates",
        },
        {
          id: "seasonal",
          name: "Seasonal Templates",
          description: "Seasonal roofing campaigns",
          category: "seasonal",
          goal: "book_estimates",
        },
        ...(campaignTemplates || []),
      ];

      setTemplates(presetTemplates as CampaignTemplate[]);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  }

  async function launchCampaign(templateId: string) {
    setLaunching(templateId);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: workspace } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", session.user.id)
        .limit(1)
        .single();

      if (!workspace) return;

      // Launch campaign from template
      const res = await fetch("/api/mobile/campaigns/launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template_id: templateId,
          workspace_id: workspace.workspace_id,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to launch campaign");
        return;
      }

      alert("Campaign launched! Check your dashboard for progress.");
      router.push("/mobile/dashboard");
    } catch (error) {
      console.error("Error launching campaign:", error);
      alert("Failed to launch campaign");
    } finally {
      setLaunching(null);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-4 py-4 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/mobile")}
            className="p-2 -ml-2"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold">Launch Campaign</h1>
            <p className="text-xs text-gray-600">One-tap preset campaigns</p>
          </div>
        </div>
      </div>

      {/* Campaign List */}
      <div className="p-4 space-y-3">
        {loading && (
          <div className="text-center text-gray-500 py-8">Loading campaigns...</div>
        )}
        {!loading && templates.length === 0 && (
          <div className="text-center text-gray-500 py-8">
            No preset campaigns available.
          </div>
        )}
        {templates.map((template) => (
          <div
            key={template.id}
            className="bg-white rounded-xl p-4 shadow-sm"
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1">
                <div className="font-semibold text-gray-900 mb-1">
                  {template.name}
                </div>
                {template.description && (
                  <div className="text-sm text-gray-600">
                    {template.description}
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={() => launchCampaign(template.id)}
              disabled={launching === template.id}
              className="w-full mt-3 bg-blue-500 text-white py-2 rounded-lg font-semibold flex items-center justify-center gap-2 disabled:bg-gray-300"
            >
              {launching === template.id ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Launching...
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4" />
                  Launch Now
                </>
              )}
            </button>
          </div>
        ))}
      </div>

      {/* Info Footer */}
      <div className="px-4 pb-4">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800">
          💡 Tip: Launch campaigns from your truck between jobs. SmartSend handles the rest.
        </div>
      </div>
    </div>
  );
}






































