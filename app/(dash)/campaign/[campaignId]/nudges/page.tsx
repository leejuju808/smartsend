"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import CapsEditor from "@/components/campaign/CapsEditor";
import NudgeVariantAnalytics from "@/components/campaign/NudgeVariantAnalytics";
import NudgeVariantSandbox from "@/components/campaign/NudgeVariantSandbox";
import PresetManager from "@/components/campaign/PresetManager";
import VariantTeacher from "@/app/(campaign)/[id]/nudges/Teacher";

type VariantForm = {
  id?: string;
  name?: string;
  subject?: string;
  body?: string;
  scenario: string;
  tone: string;
  weight: number;
  is_active: boolean;
  leadId?: string;
};

type PresetOption = {
  key: string;
  label: string;
  sort: number;
  is_active: boolean;
  campaign_id: string | null;
};

type PresetForm = {
  key: string;
  label: string;
  sort: number;
  is_active: boolean;
};

function PresetsEditor({ campaignId, onChanged }: { campaignId: string; onChanged: () => void }) {
  const [scenarios, setScenarios] = React.useState<PresetOption[]>([]);
  const [tones, setTones] = React.useState<PresetOption[]>([]);
  const [formScenario, setFormScenario] = React.useState<PresetForm>({
    key: "",
    label: "",
    sort: 100,
    is_active: true,
  });
  const [formTone, setFormTone] = React.useState<PresetForm>({
    key: "",
    label: "",
    sort: 100,
    is_active: true,
  });

  const load = React.useCallback(() => {
    fetch(`/api/campaign/${campaignId}/nudges/presets`)
      .then((r) => r.json())
      .then((j) => {
        setScenarios(j.scenarios || []);
        setTones(j.tones || []);
      });
  }, [campaignId]);

  React.useEffect(() => {
    load();
  }, [load]);

  const cloneGlobals = async () => {
    const res = await fetch(`/api/campaign/${campaignId}/nudges/presets/clone`, { method: "POST" }).then((r) =>
      r.json()
    );
    if (res.ok) {
      toast.success("Cloned global presets");
      onChanged();
      load();
    } else {
      toast.error(res.error || "Clone failed");
    }
  };

  const saveScenario = async () => {
    const res = await fetch(`/api/campaign/${campaignId}/nudges/presets/scenario`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formScenario),
    }).then((r) => r.json());

    if (res.ok) {
      toast.success("Scenario saved");
      setFormScenario({ key: "", label: "", sort: 100, is_active: true });
      onChanged();
      load();
    } else {
      toast.error(res.error || "Save failed");
    }
  };

  const deleteScenario = async (key: string) => {
    const res = await fetch(
      `/api/campaign/${campaignId}/nudges/presets/scenario?key=${encodeURIComponent(key)}`,
      { method: "DELETE" }
    ).then((r) => r.json());

    if (res.ok) {
      toast.success("Scenario archived");
      onChanged();
      load();
    } else {
      toast.error(res.error || "Archive failed");
    }
  };

  const saveTone = async () => {
    const res = await fetch(`/api/campaign/${campaignId}/nudges/presets/tone`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formTone),
    }).then((r) => r.json());

    if (res.ok) {
      toast.success("Tone saved");
      setFormTone({ key: "", label: "", sort: 100, is_active: true });
      onChanged();
      load();
    } else {
      toast.error(res.error || "Save failed");
    }
  };

  const deleteTone = async (key: string) => {
    const res = await fetch(`/api/campaign/${campaignId}/nudges/presets/tone?key=${encodeURIComponent(key)}`, {
      method: "DELETE",
    }).then((r) => r.json());

    if (res.ok) {
      toast.success("Tone archived");
      onChanged();
      load();
    } else {
      toast.error(res.error || "Archive failed");
    }
  };

  return (
    <Card className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div className="font-semibold">Presets (campaign overrides)</div>
        <Button variant="outline" onClick={cloneGlobals}>
          Clone globals → campaign
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3 rounded border p-3">
          <div className="font-medium">Scenarios</div>
          <div className="space-y-2 text-sm">
            {scenarios.map((scenario) => (
              <div key={scenario.key} className="flex items-center justify-between">
                <div>
                  {scenario.key} — <span className="text-muted-foreground">{scenario.label}</span>
                </div>
                {scenario.campaign_id && (
                  <button className="text-xs text-red-600" onClick={() => deleteScenario(scenario.key)}>
                    Archive
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-4 gap-2">
            <Input
              className="col-span-1"
              placeholder="key"
              value={formScenario.key}
              onChange={(e) => setFormScenario({ ...formScenario, key: e.target.value })}
            />
            <Input
              className="col-span-2"
              placeholder="label"
              value={formScenario.label}
              onChange={(e) => setFormScenario({ ...formScenario, label: e.target.value })}
            />
            <Input
              className="col-span-1"
              placeholder="sort"
              type="number"
              value={formScenario.sort}
              onChange={(e) =>
                setFormScenario({
                  ...formScenario,
                  sort: Number.parseInt(e.target.value || "100", 10),
                })
              }
            />
            <div className="col-span-4 flex justify-end">
              <Button variant="outline" onClick={saveScenario}>
                Save scenario
              </Button>
            </div>
          </div>
        </div>

        <div className="space-y-3 rounded border p-3">
          <div className="font-medium">Tones</div>
          <div className="space-y-2 text-sm">
            {tones.map((tone) => (
              <div key={tone.key} className="flex items-center justify-between">
                <div>
                  {tone.key} — <span className="text-muted-foreground">{tone.label}</span>
                </div>
                {tone.campaign_id && (
                  <button className="text-xs text-red-600" onClick={() => deleteTone(tone.key)}>
                    Archive
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-4 gap-2">
            <Input
              className="col-span-1"
              placeholder="key"
              value={formTone.key}
              onChange={(e) => setFormTone({ ...formTone, key: e.target.value })}
            />
            <Input
              className="col-span-2"
              placeholder="label"
              value={formTone.label}
              onChange={(e) => setFormTone({ ...formTone, label: e.target.value })}
            />
            <Input
              className="col-span-1"
              placeholder="sort"
              type="number"
              value={formTone.sort}
              onChange={(e) =>
                setFormTone({
                  ...formTone,
                  sort: Number.parseInt(e.target.value || "100", 10),
                })
              }
            />
            <div className="col-span-4 flex justify-end">
              <Button variant="outline" onClick={saveTone}>
                Save tone
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

export default function ManageNudgesPage() {
  const { campaignId } = useParams() as { campaignId: string };

  const [presets, setPresets] = React.useState<{ scenarios: PresetOption[]; tones: PresetOption[] }>({
    scenarios: [],
    tones: [],
  });
  const [leads, setLeads] = React.useState<any[]>([]);
  const [form, setForm] = React.useState<VariantForm>({
    scenario: "no_reply",
    tone: "professional",
    weight: 1,
    is_active: true,
  });
  const [preview, setPreview] = React.useState<{ subject?: string; body?: string }>({});

  const load = React.useCallback(() => {
    fetch(`/api/campaign/${campaignId}/nudges/presets`)
      .then((r) => r.json())
      .then((j) => setPresets({ scenarios: j.scenarios || [], tones: j.tones || [] }));

    fetch(`/api/campaign/${campaignId}/leads/basic?limit=100`)
      .then((r) => r.json())
      .then((j) => setLeads(j.items || []));
  }, [campaignId]);

  React.useEffect(() => {
    load();
  }, [load]);

  const resetForm = React.useCallback(() => {
    setForm({
      scenario: "no_reply",
      tone: "professional",
      weight: 1,
      is_active: true,
    });
    setPreview({});
  }, []);

  const save = async () => {
    const response = await fetch(`/api/campaign/${campaignId}/nudges/variant`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    }).then((r) => r.json());

    if (response.ok) {
      toast.success("Variant saved");
      resetForm();
      load();
    } else {
      toast.error(response.error || "Save failed");
    }
  };

  const doPreview = async () => {
    if (!form.body) {
      toast.error("Body required for preview");
      return;
    }

    const fallbackLeadId = leads[0]?.id;
    const leadId = form.leadId || fallbackLeadId;

    if (!leadId) {
      toast.error("Add a lead to preview");
      return;
    }

    const res = await fetch(`/api/campaign/${campaignId}/nudges/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId, subject: form.subject ?? "", body: form.body ?? "" }),
    }).then((r) => r.json());

    if (res.ok) {
      setPreview({ subject: res.subject, body: res.body });
    } else {
      toast.error(res.error || "Preview failed");
    }
  };

  return (
    <div className="space-y-6 p-6">
      <VariantTeacher campaignId={campaignId} />
      <NudgeVariantSandbox campaignId={campaignId} />
      <PresetManager campaignId={campaignId} />
      <PresetsEditor campaignId={campaignId} onChanged={load} />
      <Card className="space-y-3 p-4">
        <div className="font-semibold">Add / Edit Variant</div>
        <div className="grid gap-3 md:grid-cols-2">
          <Input
            placeholder="Name"
            value={form.name ?? ""}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <Input
            placeholder="Subject (optional; defaults to thread subject)"
            value={form.subject ?? ""}
            onChange={(e) => setForm({ ...form, subject: e.target.value })}
          />
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Scenario</Label>
            <Select
              value={form.scenario}
              onValueChange={(value) => setForm({ ...form, scenario: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Scenario" />
              </SelectTrigger>
              <SelectContent>
                {presets.scenarios.map((preset) => (
                  <SelectItem key={preset.key} value={preset.key}>
                    {preset.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Tone</Label>
            <Select value={form.tone} onValueChange={(value) => setForm({ ...form, tone: value })}>
              <SelectTrigger>
                <SelectValue placeholder="Tone" />
              </SelectTrigger>
              <SelectContent>
                {presets.tones.map((preset) => (
                  <SelectItem key={preset.key} value={preset.key}>
                    {preset.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs">Weight</Label>
            <Input
              type="number"
              step="0.1"
              value={form.weight}
              onChange={(e) =>
                setForm({
                  ...form,
                  weight: Number.isNaN(parseFloat(e.target.value))
                    ? 1
                    : parseFloat(e.target.value),
                })
              }
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={!!form.is_active}
              onCheckedChange={(checked) => setForm({ ...form, is_active: checked })}
            />
            <span className="text-sm">Active</span>
          </div>
        </div>

        <Textarea
          placeholder="Body (tokens: {lead_first} {company} {booking_link} {duration} {cta} {me} {last_msg})"
          value={form.body ?? ""}
          onChange={(e) => setForm({ ...form, body: e.target.value })}
        />

        <div className="grid items-end gap-3 md:grid-cols-3">
          <div className="flex flex-col gap-1 md:col-span-2">
            <Label className="text-xs">Preview with lead</Label>
            <Select
              value={form.leadId ?? leads[0]?.id}
              onValueChange={(value) => setForm({ ...form, leadId: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose a lead" />
              </SelectTrigger>
              <SelectContent>
                {leads.map((lead: any) => (
                  <SelectItem key={lead.id} value={lead.id}>
                    {lead.first_name || lead.email} · {lead.company || "—"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={doPreview}>Preview render</Button>
        </div>

        {preview.body && (
          <Card className="mt-3 space-y-2 p-3">
            <div className="text-xs uppercase text-muted-foreground">Preview</div>
            <div className="text-sm">
              <b>Subject:</b> {preview.subject || "(none)"}
            </div>
            <pre className="whitespace-pre-wrap text-sm">{preview.body}</pre>
          </Card>
        )}

        <div className="flex gap-2 pt-2">
          <Button onClick={save}>Save variant</Button>
          <Button variant="outline" onClick={resetForm}>
            Reset
          </Button>
        </div>
      </Card>

      <CapsEditor campaignId={campaignId} />

      <NudgeVariantAnalytics campaignId={campaignId} />
    </div>
  );
}


