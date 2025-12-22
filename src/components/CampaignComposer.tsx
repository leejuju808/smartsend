"use client";

import { useEffect, useMemo, useState } from "react";
import { renderTemplate } from "@/lib/templating";
import PreflightPanel from "@/components/campaign/PreflightPanel";
import { supabase } from "@/lib/supabase/client";
import { AiRewritePanel } from "@/components/compose/AiRewritePanel";
import SmartTemplateRewriter from "@/components/SmartTemplateRewriter";
import { Button } from "@/components/ui/Button";
import { ComposerToolbar } from "@/components/ComposerToolbar";

type List = { id: string; name: string };
type PreviewContact = {
  email: string;
  first_name?: string;
  last_name?: string;
  company?: string;
  custom?: Record<string, any>;
};

export default function CampaignComposer() {
  const [lists, setLists] = useState<List[]>([]);
  const [listId, setListId] = useState<string>("");
  const [senderAccountId, setSenderAccountId] = useState<string>("");
  const [senders, setSenders] = useState<Array<{ id: string; provider: string; email: string }>>([]);
  const [senderProfileId, setSenderProfileId] = useState<string>("");
  const [senderProfiles, setSenderProfiles] = useState<Array<{ id: string; provider: string; email: string; display_name?: string | null }>>([]);
  const [senderPoolId, setSenderPoolId] = useState<string>("");
  const [senderPools, setSenderPools] = useState<Array<{ id: string; name: string; strategy: string; quiet_hours?: any }>>([]);
  const [selectedPool, setSelectedPool] = useState<any>(null);
  const [subjectTpl, setSubjectTpl] = useState("Hey {{contact.first_name}} — quick question");
  const [htmlTpl, setHtmlTpl] = useState(`<p>Hi {{contact.first_name}},</p>
<p>We helped teams like {{contact.company}} book 3–5 extra demos/week. Want details?</p>
<p>— SmartSend</p>`);
  const [scheduledAt, setScheduledAt] = useState<string>(() => {
    const d = new Date(Date.now() + 15 * 60 * 1000);
    return d.toISOString().slice(0, 16);
  });
  const [campaignName, setCampaignName] = useState("October Warm Leads");
  const [testEmail, setTestEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [previewContact, setPreviewContact] = useState<PreviewContact>({
    email: "jane@example.com",
    first_name: "Jane",
    last_name: "Doe",
    company: "Acme Co",
    custom: { role: "Ops" }
  });
  const [toast, setToast] = useState<string | null>(null);
  
  // A/B Testing state
  const [abMode, setAbMode] = useState<"single" | "even" | "weighted">("even");
  const [templateId, setTemplateId] = useState<string>("");
  const [templates, setTemplates] = useState<Array<{ id: string; name: string }>>([]);
  const [variantWeights, setVariantWeights] = useState<Record<string, number>>({});
  const [variants, setVariants] = useState<Array<{ id: string; variant_label: string }>>([]);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [preflightResult, setPreflightResult] = useState<any>(null);
  const [showRewriter, setShowRewriter] = useState(false);
  const [activeField, setActiveField] = useState<"subject" | "body">("body");

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/lists");
      if (res.ok) {
        const json = await res.json();
        setLists(json.lists || []);
        if (json.lists?.[0]) setListId(json.lists[0].id);
      }
    })();
  }, []);

  // Get org_id
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
          // Fallback: get first org membership
          const { data: membership } = await supabase
            .from("org_members")
            .select("org_id")
            .eq("user_id", user.id)
            .maybeSingle();
          if (membership?.org_id) {
            setOrgId(membership.org_id);
          }
        }
      }
    })();
  }, []);

  // Load sender pools when orgId is available
  useEffect(() => {
    if (!orgId) return;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("sender_pools")
          .select("*")
          .eq("org_id", orgId)
          .order("created_at", { ascending: false });

        if (error) throw error;
        setSenderPools(data || []);
        if (data && data.length > 0 && !senderPoolId) {
          setSenderPoolId(data[0].id);
          setSelectedPool(data[0]);
        }
      } catch (error) {
        console.error("Failed to load sender pools:", error);
      }
    })();
  }, [orgId]);

  // Update selected pool when poolId changes
  useEffect(() => {
    if (senderPoolId) {
      const pool = senderPools.find(p => p.id === senderPoolId);
      setSelectedPool(pool || null);
    } else {
      setSelectedPool(null);
    }
  }, [senderPoolId, senderPools]);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/senders/list", { cache: "no-store" });
        const j = await r.json();
        const items = (j.items || j.senders || []) as Array<any>;
        const normalized = items.map((s) => ({ id: s.id, provider: s.provider || "gmail", email: s.email || s.from_email }));
        setSenders(normalized);
        if (normalized[0]) setSenderAccountId(normalized[0].id);
      } catch {}
    })();
  }, []);

  // Load sender profiles
  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data } = await supabase
            .from("sender_profiles")
            .select("id, provider, email, display_name")
            .order("created_at", { ascending: false });
          setSenderProfiles(data || []);
          if (data && data.length > 0 && !senderProfileId) {
            setSenderProfileId(data[0].id);
          }
        }
      } catch {}
    })();
  }, []);

  // Fetch email templates
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/email-templates");
        if (r.ok) {
          const j = await r.json();
          setTemplates(j.templates || j.data || []);
        }
      } catch {}
    })();
  }, []);

  // Fetch variants when template is selected
  useEffect(() => {
    if (!templateId) {
      setVariants([]);
      return;
    }
    (async () => {
      try {
        const r = await fetch(`/api/template-variants?template_id=${templateId}`);
        if (r.ok) {
          const j = await r.json();
          const vars = j.variants || j.data || [];
          setVariants(vars);
          // Initialize weights evenly if weighted mode
          if (abMode === "weighted" && vars.length > 0) {
            const equalWeight = 1 / vars.length;
            const weights: Record<string, number> = {};
            vars.forEach((v: any) => {
              weights[v.variant_label] = equalWeight;
            });
            setVariantWeights(weights);
          }
        }
      } catch {}
    })();
  }, [templateId, abMode]);

  const rendered = useMemo(() => {
    const data = { contact: previewContact };
    return {
      subject: renderTemplate(subjectTpl, data),
      html: renderTemplate(htmlTpl, data),
    };
  }, [subjectTpl, htmlTpl, previewContact]);

  function handleInsertVariable(variable: string) {
    // Convert {{first_name}} to {{contact.first_name}} for the contact structure
    const formattedVar = variable.replace(/{{([^}]+)}}/, "{{contact.$1}}");
    
    if (activeField === "subject") {
      setSubjectTpl(subjectTpl + formattedVar);
    } else {
      setHtmlTpl(htmlTpl + formattedVar);
    }
  }

  async function handleTestSend() {
    setLoading(true);
    try {
      const res = await fetch("/api/campaigns/test-send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          to: testEmail,
          subject: renderTemplate(subjectTpl, { contact: { email: testEmail } }),
          html: renderTemplate(htmlTpl, { contact: { email: testEmail } }),
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Failed");
      setToast("Test email queued ✅");
    } catch (e: any) {
      setToast(`Test failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleSchedule() {
    if (!listId) {
      setToast("Pick a list");
      return;
    }
    if (!senderProfileId && !senderAccountId) {
      setToast("Pick a sender profile or account");
      return;
    }
    setLoading(true);
    try {
      // Create campaign first
      const campaignId = crypto.randomUUID();
      const campaignRes = await fetch("/api/campaigns/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: campaignId,
          name: campaignName || "Untitled Campaign",
          sender_account_id: senderAccountId || null,
          sender_profile_id: senderProfileId || null,
          sender_pool_id: senderPoolId || null,
          template_id: templateId || null,
          ab_mode: templateId ? abMode : null,
          variant_weights: templateId && abMode === "weighted" ? variantWeights : null,
        }),
      });
      
      if (!campaignRes.ok) {
        const error = await campaignRes.json();
        throw new Error(error.error || "Failed to create campaign");
      }

      // Then schedule the bulk emails
      const res = await fetch("/api/campaigns/schedule-bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          listId,
          campaignId,
          subjectTemplate: subjectTpl,
          htmlTemplate: htmlTpl,
          scheduledAt,
          sender_account_id: senderAccountId || null,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Failed");
      setToast(`Scheduled ${j.enqueued} emails ✅`);
    } catch (e: any) {
      setToast(`Schedule failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="space-y-4">
        <div>
          <label className="block text-sm mb-1">Campaign name</label>
          <input
            className="w-full border rounded-lg p-2"
            value={campaignName}
            onChange={(e) => setCampaignName(e.target.value)}
            placeholder="Fall Promo A"
          />
        </div>

        <div>
          <label className="block text-sm mb-1">List</label>
          <select
            className="w-full border rounded-lg p-2"
            value={listId}
            onChange={(e) => setListId(e.target.value)}
          >
            {lists.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">
            Upload CSV at <code>/api/contacts/import</code> before scheduling.
          </p>
        </div>

        <div>
          <label className="block text-sm mb-1">Sender Profile (Gmail/Outlook)</label>
          <select
            className="w-full border rounded-lg p-2"
            value={senderProfileId}
            onChange={(e) => setSenderProfileId(e.target.value)}
          >
            <option value="">None (use default sender)</option>
            {senderProfiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.provider} — {p.display_name || p.email}
              </option>
            ))}
          </select>
          {senderProfiles.length === 0 && (
            <p className="text-xs text-gray-500 mt-1">
              <a href="/dashboard/settings/senders" className="text-blue-600 hover:underline">
                Connect a Gmail or Outlook account
              </a>
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm mb-1">Sender Pool</label>
          <select
            className="w-full border rounded-lg p-2"
            value={senderPoolId}
            onChange={(e) => setSenderPoolId(e.target.value)}
          >
            <option value="">None (use default sender)</option>
            {senderPools.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          {selectedPool && (
            <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded text-xs">
              <div className="font-medium">Pool Settings:</div>
              <div>Strategy: {selectedPool.strategy}</div>
              {selectedPool.quiet_hours?.start && selectedPool.quiet_hours?.end && (
                <div>
                  Quiet hours: {selectedPool.quiet_hours.start}–{selectedPool.quiet_hours.end}
                  {selectedPool.quiet_hours.tz && ` (${selectedPool.quiet_hours.tz})`}
                </div>
              )}
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-sm">Subject (supports merge tags)</label>
            <ComposerToolbar onInsertVariable={handleInsertVariable} />
          </div>
          <input
            className="w-full border rounded-lg p-2"
            value={subjectTpl}
            onChange={(e) => setSubjectTpl(e.target.value)}
            onFocus={() => setActiveField("subject")}
            placeholder="Hey {{contact.first_name}}, quick question"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-sm">HTML Body (supports merge tags)</label>
            <div className="flex items-center gap-2">
              <ComposerToolbar onInsertVariable={handleInsertVariable} />
              <Button
                onClick={() => setShowRewriter(true)}
                variant="secondary"
                size="sm"
                className="flex items-center gap-1"
              >
                ✨ Rewrite with AI
              </Button>
            </div>
          </div>
          <textarea
            className="w-full border rounded-lg p-2 min-h-[220px] font-mono"
            value={htmlTpl}
            onChange={(e) => setHtmlTpl(e.target.value)}
            onFocus={() => setActiveField("body")}
          />
          <div className="text-xs text-gray-500 mt-2">
            Tips: use <code>{"{{contact.first_name}}"}</code>, <code>{"{{contact.company}}"}</code>, or any <code>{"{{contact.custom.*}}"}</code>.
          </div>
        </div>

        <SmartTemplateRewriter
          open={showRewriter}
          onClose={() => setShowRewriter(false)}
          initialTemplate={htmlTpl.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")}
          onUseTemplate={(template) => {
            // Convert plain text back to HTML (simple paragraph wrapping)
            const htmlBody = template
              .split("\n\n")
              .map((p) => p.trim())
              .filter((p) => p)
              .map((p) => `<p>${p.replace(/\n/g, "<br />")}</p>`)
              .join("\n");
            setHtmlTpl(htmlBody || template);
          }}
        />

        {/* AI Rewrite Panel */}
        <div className="border rounded-lg p-4">
          <h3 className="text-sm font-semibold mb-3">AI Rewrite</h3>
          <AiRewritePanel
            initialSubject={subjectTpl}
            initialBody={htmlTpl.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")}
            mergeFields={["{{contact.first_name}}", "{{contact.company}}"]}
            onPickVariant={(v) => {
              setSubjectTpl(v.subject);
              // Convert plain text back to HTML (simple paragraph wrapping)
              const htmlBody = v.body
                .split("\n\n")
                .map(p => p.trim())
                .filter(p => p)
                .map(p => `<p>${p.replace(/\n/g, "<br />")}</p>`)
                .join("\n");
              setHtmlTpl(htmlBody || v.body);
            }}
          />
        </div>

        <div>
          <label className="block text-sm mb-1">Schedule (local time)</label>
          <input
            type="datetime-local"
            className="w-full border rounded-lg p-2"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
          />
        </div>

        {/* A/B Testing Section */}
        <div className="border rounded-lg p-4 space-y-3">
          <h3 className="text-sm font-semibold">A/B Testing (Optional)</h3>
          
          <div>
            <label className="block text-sm mb-1">Email Template</label>
            <select
              className="w-full border rounded-lg p-2"
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
            >
              <option value="">None (use templates above)</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Select a template with variants to enable A/B testing
            </p>
          </div>

          {templateId && (
            <>
              <div>
                <label className="block text-sm mb-1">A/B Mode</label>
                <select
                  className="w-full border rounded-lg p-2"
                  value={abMode}
                  onChange={(e) => setAbMode(e.target.value as "single" | "even" | "weighted")}
                >
                  <option value="single">Single variant</option>
                  <option value="even">Even split</option>
                  <option value="weighted">Weighted</option>
                </select>
              </div>

              {abMode === "weighted" && variants.length > 0 && (
                <div>
                  <label className="block text-sm mb-2">Variant Weights (must sum to 1.0)</label>
                  <div className="space-y-2">
                    {variants.map((v) => (
                        <div key={v.id} className="flex items-center gap-2">
                          <label className="text-sm w-24">{v.variant_label}:</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            max="1"
                            className="flex-1 border rounded p-2"
                            value={variantWeights[v.variant_label] || 0}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) || 0;
                              setVariantWeights({ ...variantWeights, [v.variant_label]: val });
                            }}
                          />
                        </div>
                    ))}
                    <div className="text-xs text-gray-500">
                      Total: {Object.values(variantWeights).reduce((a, b) => a + b, 0).toFixed(2)}
                      {Math.abs(Object.values(variantWeights).reduce((a, b) => a + b, 0) - 1.0) >= 0.01 && (
                        <span className="text-red-600"> (must equal 1.0)</span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {variants.length === 0 && (
                <p className="text-xs text-gray-500">No variants found for this template.</p>
              )}
            </>
          )}
        </div>

        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="block text-sm mb-1">Send test to</label>
            <input
              className="w-full border rounded-lg p-2"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="you@domain.com"
            />
          </div>
          <button
            onClick={handleTestSend}
            disabled={loading || !testEmail}
            className="px-4 py-2 rounded-lg border hover:bg-gray-50 disabled:opacity-50"
          >
            Send test
          </button>
        </div>

        {orgId && (
          <PreflightPanel
            onRun={async () => {
              if (!orgId) throw new Error("No org_id");
              const senderDomain = senders.find(s => s.id === senderAccountId)?.email?.split("@")[1] || null;
              const r = await fetch("/api/preflight", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  org_id: orgId,
                  campaign_id: null, // Will be created later
                  subject: subjectTpl,
                  body: htmlTpl,
                  sender_domain: senderDomain
                })
              });
              const j = await r.json();
              setPreflightResult(j);
              return j;
            }}
            last={preflightResult}
          />
        )}

        <div className="flex gap-2">
          <button
            onClick={handleSchedule}
            disabled={loading || preflightResult?.severity === "HIGH"}
            className="px-4 py-2 rounded-lg bg-black text-white hover:opacity-90 disabled:opacity-50"
            title={preflightResult?.severity === "HIGH" ? "Fix deliverability issues before scheduling" : undefined}
          >
            Schedule Campaign
          </button>
          {toast && <span className="text-sm text-gray-600">{toast}</span>}
          {preflightResult?.severity === "HIGH" && (
            <span className="text-sm text-red-600">Fix deliverability issues before scheduling</span>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <div className="border rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-1">Preview contact</div>
          <div className="grid grid-cols-2 gap-2">
            <input
              className="border rounded p-2"
              placeholder="first_name"
              value={previewContact.first_name || ""}
              onChange={(e) => setPreviewContact(p => ({ ...p, first_name: e.target.value }))}
            />
            <input
              className="border rounded p-2"
              placeholder="last_name"
              value={previewContact.last_name || ""}
              onChange={(e) => setPreviewContact(p => ({ ...p, last_name: e.target.value }))}
            />
            <input
              className="border rounded p-2 col-span-2"
              placeholder="company"
              value={previewContact.company || ""}
              onChange={(e) => setPreviewContact(p => ({ ...p, company: e.target.value }))}
            />
            <input
              className="border rounded p-2 col-span-2"
              placeholder="email"
              value={previewContact.email}
              onChange={(e) => setPreviewContact(p => ({ ...p, email: e.target.value }))}
            />
          </div>
        </div>

        <div className="border rounded-lg">
          <div className="px-3 py-2 border-b text-sm text-gray-600">Rendered Subject</div>
          <div className="px-3 py-3">{rendered.subject}</div>
        </div>

        <div className="border rounded-lg overflow-hidden">
          <div className="px-3 py-2 border-b text-sm text-gray-600">Rendered HTML</div>
          <iframe
            className="w-full h-[420px]"
            srcDoc={rendered.html}
          />
        </div>
      </div>
    </div>
  );
}