"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { SmartRewritePanel } from "@/components/templates/SmartRewritePanel";

const VARS = ["{{first_name}}", "{{last_name}}", "{{company}}", "{{title}}", "{{email}}"];

interface CampaignTemplate {
  id: string;
  campaign_id: string;
  name: string;
  variant: string;
  weight: number;
  subject: string;
  body_text: string | null;
  body_html: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export default function CampaignTemplateEditor({ campaignId }: { campaignId: string }) {
  const [rows, setRows] = useState<CampaignTemplate[]>([]);
  const [selected, setSelected] = useState<CampaignTemplate | null>(null);

  const [name, setName] = useState("");
  const [variant, setVariant] = useState("A");
  const [weight, setWeight] = useState(100);
  const [subject, setSubject] = useState("{{first_name}}, quick question");
  const [bodyHtml, setBodyHtml] = useState("<p>Hi {{first_name}},</p><p>Quick question about your current process at {{company}}. Open to a 5-min chat?</p><p>— {{email}}</p>");
  const [bodyText, setBodyText] = useState("Hi {{first_name}},\n\nQuick question about your current process at {{company}}. Open to a 5-min chat?\n\n— {{email}}");
  const [isActive, setIsActive] = useState(true);

  async function load() {
    try {
      const r = await fetch("/api/campaign-templates/list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId }),
      });
      const j = await r.json();
      if (j.ok) setRows(j.rows || []);
    } catch (e) {
      console.error("Failed to load templates:", e);
    }
  }

  useEffect(() => {
    load();
  }, [campaignId]);

  useEffect(() => {
    if (!selected) return;
    setName(selected.name);
    setVariant(selected.variant);
    setWeight(selected.weight);
    setSubject(selected.subject);
    setBodyHtml(selected.body_html || "");
    setBodyText(selected.body_text || "");
    setIsActive(!!selected.is_active);
  }, [selected]);

  const onSave = async () => {
    try {
      const r = await fetch("/api/campaign-templates/upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selected?.id,
          campaignId,
          name,
          variant,
          weight,
          subject,
          body_text: bodyText,
          body_html: bodyHtml,
          is_active: isActive,
        }),
      });
      const j = await r.json();
      if (j.ok) {
        setSelected(j.template);
        load();
      } else {
        alert(`Error: ${j.message}`);
      }
    } catch (e) {
      alert("Failed to save template");
    }
  };

  const preview = useMemo(
    () => ({
      subject: subject
        .replace(/\{\{first_name\}\}/g, "Alex")
        .replace(/\{\{company\}\}/g, "Acme Inc."),
      html: bodyHtml
        .replace(/\{\{first_name\}\}/g, "Alex")
        .replace(/\{\{company\}\}/g, "Acme Inc.")
        .replace(/\{\{email\}\}/g, "you@brand.com"),
    }),
    [subject, bodyHtml]
  );

  return (
    <div className="grid md:grid-cols-3 gap-4">
      {/* List */}
      <div className="border rounded-lg p-3 space-y-2">
        <div className="text-sm font-medium">Templates</div>
        {rows.map((r) => (
          <button
            key={r.id}
            onClick={() => setSelected(r)}
            className={`w-full text-left rounded-md border px-2 py-1 text-sm ${
              selected?.id === r.id ? "bg-muted" : ""
            }`}
          >
            {r.variant} — {r.name} {r.is_active ? "" : "(inactive)"} · weight {r.weight}
          </button>
        ))}
        <Button
          variant="outline"
          onClick={() => {
            setSelected(null);
            setName("");
            setVariant("A");
            setWeight(100);
          }}
        >
          + New
        </Button>
        <div className="text-xs text-muted-foreground pt-2">
          Vars: {VARS.join("  •  ")}
        </div>
      </div>

      {/* Editor */}
      <div className="border rounded-lg p-3 space-y-2">
        <Input
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="flex gap-2">
          <select
            className="w-[120px] border rounded px-2 py-1"
            value={variant}
            onChange={(e) => setVariant(e.target.value)}
          >
            {["A", "B", "C", "D"].map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
          <Input
            type="number"
            className="w-[120px]"
            value={weight}
            onChange={(e) => setWeight(parseInt(e.target.value || "0", 10))}
            placeholder="Weight"
          />
          <label className="ml-auto text-sm inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            Active
          </label>
        </div>
        <Input
          placeholder="Subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />
        <Textarea
          rows={6}
          placeholder="HTML body"
          value={bodyHtml}
          onChange={(e) => setBodyHtml(e.target.value)}
        />
        <Textarea
          rows={4}
          placeholder="Plain text body"
          value={bodyText}
          onChange={(e) => setBodyText(e.target.value)}
        />
        
        <SmartRewritePanel
          subject={subject}
          body={bodyHtml}
          onApply={(newSubject, newBody) => {
            setSubject(newSubject);
            setBodyHtml(newBody);
          }}
        />
        
        <Button onClick={onSave}>Save</Button>
      </div>

      {/* Preview */}
      <div className="border rounded-lg p-3 space-y-2">
        <div className="text-sm font-medium">Preview</div>
        <div className="text-sm">
          <span className="font-medium">Subject:</span> {preview.subject}
        </div>
        <div
          className="border rounded-md p-3 bg-background"
          dangerouslySetInnerHTML={{ __html: preview.html }}
        />
      </div>
    </div>
  );
}
