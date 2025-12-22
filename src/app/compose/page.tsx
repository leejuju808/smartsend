"use client";

import { useEffect, useMemo, useState } from "react";
import { renderTemplate } from "@/lib/templating";
import { supabase } from "@/lib/supabase/client";
import CampaignSequenceBuilder from "@/components/CampaignSequenceBuilder";
import { ComposerToolbar } from "@/components/ComposerToolbar";
import RewriterDrawer from "@/components/rewrite/RewriterDrawer";

type Campaign = {
  id: string;
  name: string;
  org_id?: string;
};

type Lead = {
  first_name?: string;
  last_name?: string;
  company?: string;
  title?: string;
  phone?: string;
  website?: string;
  email: string;
};

export default function ComposePage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignId, setCampaignId] = useState<string>("");
  const [orgId, setOrgId] = useState<string | null>(null);
  const [subject, setSubject] = useState("Hey {{first_name}} — quick question");
  const [body, setBody] = useState(`<p>Hi {{first_name}},</p>
<p>We helped teams like {{company}} book 3–5 extra demos/week. Want details?</p>
<p>— SmartSend</p>`);
  const [templateName, setTemplateName] = useState("October Outreach");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"single" | "sequence">("single");
  const [previewLead, setPreviewLead] = useState<Lead>({
    email: "jane@example.com",
    first_name: "Jane",
    last_name: "Doe",
    company: "Acme Co",
  });
  const [domainSuppression, setDomainSuppression] = useState<{ reason: string; until: string } | null>(null);
  const [checkingDomain, setCheckingDomain] = useState(false);

  // Get org_id on mount
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("org_id")
          .eq("id", user.id)
          .maybeSingle();
        if (profile?.org_id) {
          setOrgId(profile.org_id);
        } else {
          const { data: membership } = await supabase
            .from("organization_members")
            .select("org_id")
            .eq("user_id", user.id)
            .limit(1)
            .maybeSingle();
          if (membership?.org_id) {
            setOrgId(membership.org_id);
          }
        }
      }
    })();
  }, []);

  // Load campaigns when orgId is available
  useEffect(() => {
    if (!orgId) return;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("campaigns")
          .select("id, name, org_id")
          .eq("org_id", orgId)
          .order("created_at", { ascending: false });

        if (error) throw error;
        setCampaigns(data || []);
        if (data && data.length > 0 && !campaignId) {
          setCampaignId(data[0].id);
        }
      } catch (error) {
        console.error("Failed to load campaigns:", error);
      }
    })();
  }, [orgId]);

  const rendered = useMemo(() => {
    return {
      subject: renderTemplate(subject, previewLead),
      html: renderTemplate(body, previewLead),
    };
  }, [subject, body, previewLead]);

  useEffect(() => {
    const email = previewLead.email?.toLowerCase().trim();
    const domain = email?.includes("@") ? email.split("@")[1] : null;
    if (!domain) {
      setDomainSuppression(null);
      setCheckingDomain(false);
      return;
    }
    let alive = true;
    setCheckingDomain(true);
    fetch(`/api/domains/${encodeURIComponent(domain)}/suppression`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        setDomainSuppression(j?.suppression ?? null);
      })
      .catch(() => {
        if (!alive) return;
        setDomainSuppression(null);
      })
      .finally(() => {
        if (!alive) return;
        setCheckingDomain(false);
      });
    return () => {
      alive = false;
    };
  }, [previewLead.email]);

  function handleInsertVariable(variable: string) {
    if (activeTab === "single") {
      setBody(body + variable);
    }
  }

  async function handleSchedule() {
    if (!campaignId || !orgId) {
      setStatus("Please select a campaign and ensure org_id is available");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/compose/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_id: orgId,
          campaign_id: campaignId,
          template: { subject, body },
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Failed");
      setStatus(`Enqueued ${j.enqueued} emails${j.skipped > 0 ? ` (skipped ${j.skipped})` : ""}`);
    } catch (e: any) {
      setStatus(`Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveTemplate() {
    if (!templateName || !subject || !body) {
      setStatus("Please fill in all template fields");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/templates/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: templateName,
          subject,
          body,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Failed");
      setStatus("Template saved ✅");
    } catch (e: any) {
      setStatus(`Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Compose v2</h1>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab("single")}
            className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === "single"
                ? "border-black text-black"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            Single Email
          </button>
          <button
            onClick={() => setActiveTab("sequence")}
            className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === "sequence"
                ? "border-black text-black"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            Multi-Step Sequence
          </button>
        </nav>
      </div>

      {activeTab === "sequence" ? (
        <CampaignSequenceBuilder
          campaignId={campaignId}
          onSave={() => setStatus("✅ Sequence saved successfully!")}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Campaign</label>
            <select
              className="w-full border rounded-lg p-2"
              value={campaignId}
              onChange={(e) => setCampaignId(e.target.value)}
            >
              <option value="">Select a campaign...</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {campaigns.length === 0 && (
              <p className="text-xs text-gray-500 mt-1">
                No campaigns found. Create one first.
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Template Name</label>
            <input
              className="w-full border rounded-lg p-2"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="My Outreach Template"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium">Subject</label>
              <div className="flex items-center gap-2">
                <RewriterDrawer
                  campaignId={campaignId || undefined}
                  mode="subject"
                  value={subject}
                  onApply={(t) => setSubject(t)}
                />
                <ComposerToolbar onInsertVariable={(v) => setSubject(subject + v)} />
              </div>
            </div>
            <input
              className="w-full border rounded-lg p-2"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Hey {{first_name}} — quick question"
            />
            <p className="text-xs text-gray-500 mt-1">
              Variables: <code>{"{{first_name}}"}</code>, <code>{"{{company}}"}</code>, <code>{"{{title}}"}</code>
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium">Body (HTML)</label>
              <div className="flex items-center gap-2">
                <RewriterDrawer
                  campaignId={campaignId || undefined}
                  mode="body"
                  value={body}
                  onApply={(t) => setBody(t)}
                />
                <ComposerToolbar onInsertVariable={handleInsertVariable} />
              </div>
            </div>
            <textarea
              className="w-full border rounded-lg p-2 min-h-[220px] font-mono text-sm"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="<p>Hi {{first_name}}, ...</p>"
            />
            <p className="text-xs text-gray-500 mt-1">
              Tips: Use HTML. Variables support fallback: <code>{"{{title | there}}"}</code>
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleSaveTemplate}
              disabled={loading}
              className="px-4 py-2 rounded-lg border hover:bg-gray-50 disabled:opacity-50"
            >
              Save Template
            </button>
            <button
              onClick={handleSchedule}
              disabled={loading || !campaignId}
              className="px-4 py-2 rounded-lg bg-black text-white hover:opacity-90 disabled:opacity-50"
            >
              Schedule Now
            </button>
          </div>

          {status && (
            <div className={`p-3 rounded-lg ${status.includes("Error") ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>
              {status}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Preview Contact</label>
            <div className="grid grid-cols-2 gap-2 border rounded-lg p-3">
              <input
                className="border rounded p-2 text-sm"
                placeholder="first_name"
                value={previewLead.first_name || ""}
                onChange={(e) => setPreviewLead((p) => ({ ...p, first_name: e.target.value }))}
              />
              <input
                className="border rounded p-2 text-sm"
                placeholder="last_name"
                value={previewLead.last_name || ""}
                onChange={(e) => setPreviewLead((p) => ({ ...p, last_name: e.target.value }))}
              />
              <input
                className="border rounded p-2 text-sm col-span-2"
                placeholder="company"
                value={previewLead.company || ""}
                onChange={(e) => setPreviewLead((p) => ({ ...p, company: e.target.value }))}
              />
              <input
                className="border rounded p-2 text-sm col-span-2"
                placeholder="email"
                value={previewLead.email}
                onChange={(e) => setPreviewLead((p) => ({ ...p, email: e.target.value }))}
              />
              {(checkingDomain || domainSuppression) && (
                <div className="col-span-2">
                  {domainSuppression ? (
                    <span className="inline-flex items-center gap-2 rounded-full bg-red-100 text-red-700 px-3 py-1 text-xs font-medium">
                      <span className="w-2 h-2 rounded-full bg-red-500" />
                      Domain cooling down until{" "}
                      {new Date(domainSuppression.until).toLocaleTimeString(undefined, {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {domainSuppression.reason && (
                        <span className="opacity-75">({domainSuppression.reason})</span>
                      )}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-2 rounded-full bg-neutral-100 text-neutral-600 px-3 py-1 text-xs font-medium">
                      <span className="w-2 h-2 rounded-full bg-neutral-400 animate-pulse" />
                      Checking domain status…
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="border rounded-lg overflow-hidden">
            <div className="px-3 py-2 border-b text-sm font-medium bg-gray-50">Rendered Subject</div>
            <div className="px-3 py-3">{rendered.subject}</div>
          </div>

          <div className="border rounded-lg overflow-hidden">
            <div className="px-3 py-2 border-b text-sm font-medium bg-gray-50">Rendered HTML</div>
            <iframe className="w-full h-[420px]" srcDoc={rendered.html} />
          </div>
        </div>
      </div>
      )}
    </div>
  );
}

