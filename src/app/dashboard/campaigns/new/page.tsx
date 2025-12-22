"use client";
import { useEffect, useMemo, useState } from "react";
import { renderTemplate } from "@/lib/renderTemplate";

interface Contact {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  company?: string;
  title?: string;
  phone?: string;
  custom?: Record<string, any>;
  created_at: string;
  is_suppressed?: boolean;
}
import { split, toHtml } from "@/lib/campaign-utils";
import { Input } from "@/components/ui/Input";
import Link from "next/link";
import TemplateRewriteDialog from "@/components/rewrite/TemplateRewriteDialog";

export default function NewCampaignPage() {
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("Hi {{name}},\n\nQuick note…");
  const [tagsAny, setTagsAny] = useState("");
  const [includeDomains, setIncludeDomains] = useState("");
  const [excludeDomains, setExcludeDomains] = useState("");
  const [includeUnsub, setIncludeUnsub] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [previewTotal, setPreviewTotal] = useState<number | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [sampleIdx, setSampleIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setLoadingContacts(true);
        const activeWorkspace = localStorage.getItem('active_workspace');
        const headers: Record<string, string> = {};
        if (activeWorkspace) {
          headers['x-workspace-id'] = activeWorkspace;
        }
        
        const r = await fetch("/api/contacts/list", { headers });
        if (!r.ok) {
          throw new Error(`Failed to fetch contacts: ${r.status}`);
        }
        const j = await r.json();
        setContacts(j.items || []);
      } catch (err) {
        console.error("Failed to fetch contacts:", err);
        setError("Failed to load contacts");
      } finally {
        setLoadingContacts(false);
      }
    })();
  }, []);

  const sample = contacts.length ? contacts[Math.min(sampleIdx, contacts.length - 1)] : null;
  const subjectPreview = useMemo(() => {
    if (!sample) return subject;
    const result = renderTemplate(subject, sample);
    return result.rendered;
  }, [subject, sample]);
  const bodyPreview = useMemo(() => {
    if (!sample) return body;
    const result = renderTemplate(body, sample);
    return result.rendered;
  }, [body, sample]);

  async function create() {
    if (!name.trim() || !subject.trim() || !body.trim()) {
      setError("Please fill in all required fields");
      return;
    }

    // Validate that at least one segment criteria is specified
    const hasSegmentCriteria = tagsAny.trim() || includeDomains.trim() || excludeDomains.trim();
    if (!hasSegmentCriteria) {
      setError("Please specify at least one segment criteria (tags, include domains, or exclude domains)");
      return;
    }

    setCreating(true);
    setError(null);
    
    try {
      const segment = {
        tagsAny: split(tagsAny),
        includeDomains: split(includeDomains),
        excludeDomains: split(excludeDomains),
        includeUnsubscribed: includeUnsub,
        search: ""
      };
      
      // Get active workspace from localStorage
      const activeWorkspace = localStorage.getItem('active_workspace');
      
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          ...(activeWorkspace && { "x-workspace-id": activeWorkspace })
        },
        body: JSON.stringify({ name, subject, body_html: toHtml(body), segment }),
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to create campaign: ${res.status}`);
      }
      
      const j = await res.json();
      
      if (j?.ok && j?.campaign) {
        setCreatedId(j.campaign.id);
        setPreviewTotal(j.campaign.total);
        
        // Mark onboarding step complete
        try {
          await fetch('/api/onboarding/complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ step: 'create_campaign' }),
          })
        } catch (e) {
          // Silently fail - onboarding is not critical
        }
      } else {
        throw new Error("Invalid response from server");
      }
    } catch (err) {
      console.error("Failed to create campaign:", err);
      setError(err instanceof Error ? err.message : "Failed to create campaign");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="p-6 max-w-3xl space-y-5">
      <h1 className="text-2xl font-semibold">New campaign</h1>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="grid gap-3">
        <input 
          className="rounded-xl border p-2" 
          placeholder="Internal name" 
          value={name} 
          onChange={e => setName(e.target.value)} 
        />
        <div className="flex gap-2">
          <input 
            className="flex-1 rounded-xl border p-2" 
            placeholder="Subject" 
            value={subject} 
            onChange={e => setSubject(e.target.value)} 
          />
          <TemplateRewriteDialog
            initialSubject={subject}
            initialBody={body}
            onUseVariant={(v: { subject: string; body: string }) => { setSubject(v.subject); setBody(v.body); }}
          />
        </div>
        <textarea 
          className="min-h-[200px] rounded-xl border p-3 font-mono" 
          value={body} 
          onChange={e => setBody(e.target.value)} 
        />
      </div>

      <div className="rounded-2xl border p-4 grid gap-3 text-sm">
        <div className="font-medium">Variables Available</div>
        <ul className="list-disc pl-5 text-gray-700">
          <li><code>{`{{name}}`}</code> → Contact's first name</li>
          <li><code>{`{{last}}`}</code> → Last name</li>
          <li><code>{`{{company}}`}</code> → Company</li>
          <li><code>{`{{email}}`}</code> → Email</li>
        </ul>
        {loadingContacts ? (
          <div className="text-xs text-gray-500">Loading contacts...</div>
        ) : contacts.length > 0 ? (
          <div className="mt-2">
            <div className="text-xs text-gray-600 mb-2">Live Preview (random contact)</div>
            <div className="rounded-xl border p-3 bg-white">
              <div className="text-xs font-medium text-gray-700">Subject</div>
              <div className="mb-2">{subjectPreview || "(empty)"}</div>
              <div className="text-xs font-medium text-gray-700">Body</div>
              <pre className="whitespace-pre-wrap font-sans text-sm">{bodyPreview || "(empty)"}</pre>
            </div>
            <button 
              type="button" 
              onClick={() => setSampleIdx((s) => (s + 1) % contacts.length)} 
              className="mt-2 rounded-lg border px-3 py-1 hover:bg-gray-50"
            >
              Shuffle Contact
            </button>
          </div>
        ) : (
          <div className="text-xs text-gray-500">
            {error === "Failed to load contacts" ? (
              <span className="text-red-600">Failed to load contacts. Please refresh the page.</span>
            ) : (
              <>
                Add contacts to see a live preview.
                <span className="ml-2 underline">
                  <Link href="/dashboard/contacts">Go to Contacts</Link>
                </span>
              </>
            )}
          </div>
        )}
      </div>

      <div className="rounded-2xl border p-4 space-y-3">
        <div className="text-sm font-medium">Segment</div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tags (any match)</label>
          <Input value={tagsAny} onChange={(e) => setTagsAny(e.target.value)} placeholder="lead, trial, imported-2025-08" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Include domains</label>
          <Input value={includeDomains} onChange={(e) => setIncludeDomains(e.target.value)} placeholder="company.com, example.org" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Exclude domains</label>
          <Input value={excludeDomains} onChange={(e) => setExcludeDomains(e.target.value)} placeholder="gmail.com" />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input 
            type="checkbox" 
            checked={includeUnsub} 
            onChange={e => setIncludeUnsub(e.target.checked)} 
          /> 
          Include unsubscribed (not recommended)
        </label>
      </div>

      <button 
        onClick={create} 
        disabled={creating} 
        className="rounded-2xl bg-black px-4 py-2 text-white disabled:opacity-50 hover:bg-gray-800"
      >
        {creating ? "Creating…" : "Save draft & preview"}
      </button>

      {createdId && (
        <div className="rounded-xl border p-4 text-sm">
          Audience size: <b>{previewTotal}</b>
          <div className="mt-3">
            <a className="underline hover:no-underline" href={`/dashboard/campaigns/${createdId}`}>
              Open campaign
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

