"use client";
import { useEffect, useMemo, useState } from "react";
import { renderTemplate } from "@/lib/renderTemplate";
import Link from "next/link";

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
  const [contacts, setContacts] = useState<any[]>([]);
  const [sampleIdx, setSampleIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/contacts/list");
        if (!r.ok) {
          throw new Error(`Failed to fetch contacts: ${r.status}`);
        }
        const j = await r.json();
        setContacts(j.items || []);
      } catch (err) {
        console.error("Failed to fetch contacts:", err);
        setError("Failed to load contacts");
      }
    })();
  }, []);

  const sample = contacts.length ? contacts[Math.min(sampleIdx, contacts.length - 1)] : null;
  const subjectPreview = useMemo(() => (sample ? renderTemplate(subject, sample) : subject), [subject, sample]);
  const bodyPreview = useMemo(() => (sample ? renderTemplate(body, sample) : body), [body, sample]);

  async function create() {
    if (!name.trim() || !subject.trim() || !body.trim()) {
      setError("Please fill in all required fields");
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
      
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, subject, body_html: toHtml(body), segment }),
      });
      
      if (!res.ok) {
        throw new Error(`Failed to create campaign: ${res.status}`);
      }
      
      const j = await res.json();
      
      if (j?.ok) {
        setCreatedId(j.campaign.id);
        setPreviewTotal(j.campaign.total);
      } else {
        throw new Error(j?.error || "Failed to create campaign");
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
        <input 
          className="rounded-xl border p-2" 
          placeholder="Subject" 
          value={subject} 
          onChange={e => setSubject(e.target.value)} 
        />
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
        {contacts.length > 0 && (
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
        )}
        {contacts.length === 0 && (
          <div className="text-xs text-gray-500">
            Add contacts to see a live preview.
            <span className="ml-2 underline">
              <Link href="/dashboard/contacts">Go to Contacts</Link>
            </span>
          </div>
        )}
      </div>

      <div className="rounded-2xl border p-4 space-y-3">
        <div className="text-sm font-medium">Segment</div>
        <Input label="Tags (any match)" value={tagsAny} onChange={setTagsAny} placeholder="lead, trial, imported-2025-08" />
        <Input label="Include domains" value={includeDomains} onChange={setIncludeDomains} placeholder="company.com, example.org" />
        <Input label="Exclude domains" value={excludeDomains} onChange={setExcludeDomains} placeholder="gmail.com" />
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

function split(s: string): string[] { 
  return s.split(/[,\s]+/).map(x => x.trim()).filter(Boolean); 
}

function toHtml(s: string): string { 
  return s.replace(/\n/g, "<br/>"); 
}

interface InputProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

function Input({ label, value, onChange, placeholder }: InputProps) {
  return (
    <div>
      <div className="text-xs text-gray-600">{label}</div>
      <input 
        className="mt-1 w-full rounded-xl border p-2" 
        value={value} 
        onChange={e => onChange(e.target.value)} 
        placeholder={placeholder}
      />
    </div>
  );
}

