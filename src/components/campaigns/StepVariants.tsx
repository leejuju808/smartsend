"use client";

import useSWR from "swr";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/Textarea";
import { useState } from "react";
import TemplateRewriter from "@/app/campaigns/[id]/steps/TemplateRewriter";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

export function StepVariants({
  campaignId,
  stepNo,
  refreshToken = 0
}: {
  campaignId: string;
  stepNo: number;
  refreshToken?: number;
}) {
  const supabase = createClientComponentClient();
  const { data, mutate } = useSWR(
    `/api/variant-metrics?campaign=${campaignId}&step=${stepNo}&refresh=${refreshToken}`,
    (u) => fetch(u).then((r) => r.json()),
    { refreshInterval: 15000 }
  );
  const rows = data?.rows ?? [];
  const [editing, setEditing] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const handleSave = async (variantId: string, variantData: any) => {
    setSaving({ ...saving, [variantId]: true });
    try {
      const { error } = await supabase
        .from("campaign_step_variants")
        .update({
          name: variantData.name,
          weight: variantData.weight,
          subject_template: variantData.subject_template,
          body_html_template: variantData.body_html_template,
          enabled: variantData.enabled,
        })
        .eq("id", variantId);

      if (error) throw error;
      setEditing({ ...editing, [variantId]: false });
      mutate();
    } catch (e: any) {
      console.error("Failed to save variant:", e);
      alert("Failed to save: " + e.message);
    } finally {
      setSaving({ ...saving, [variantId]: false });
    }
  };

  const handleCreate = async () => {
    const name = prompt("Enter variant name (e.g., 'A', 'B', 'Short subject'):");
    if (!name) return;

    try {
      const { data: step } = await supabase
        .from("campaign_steps")
        .select("subject_template, body_html_template")
        .eq("campaign_id", campaignId)
        .eq("step_no", stepNo)
        .maybeSingle();

      const { error } = await supabase.from("campaign_step_variants").insert({
        campaign_id: campaignId,
        step_no: stepNo,
        name,
        weight: 0.5,
        subject_template: step?.subject_template || "",
        body_html_template: step?.body_html_template || "",
        enabled: true,
      });

      if (error) throw error;
      mutate();
    } catch (e: any) {
      console.error("Failed to create variant:", e);
      alert("Failed to create: " + e.message);
    }
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="font-medium">A/B Variants — Step {stepNo}</div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleCreate}>
            + Add Variant
          </Button>
          <div className="text-xs text-muted-foreground">
            Weights route traffic; promoter picks winner post-sample.
          </div>
        </div>
      </div>
      <div className="grid gap-3">
        {rows.map((r: any) => {
          const isEditing = editing[r.id];
          const variantData = isEditing
            ? editing[r.id]
            : {
                name: r.name || `Variant ${r.id.slice(0, 6)}`,
                weight: r.weight || 0.5,
                subject_template: r.subject_template || "",
                body_html_template: r.body_html_template || "",
                enabled: r.enabled !== false,
              };

          return (
            <div key={r.id} className="border rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="font-medium">
                  {isEditing ? (
                    <Input
                      value={variantData.name}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          [r.id]: { ...variantData, name: e.target.value },
                        })
                      }
                      className="w-32"
                      placeholder="Variant name"
                    />
                  ) : (
                    variantData.name
                  )}
                </div>
                <div className="text-sm">
                  Sent {r.sent || 0} · Open {r.open_rate || 0}% · Click {r.click_rate || 0}% · Reply {r.reply_rate || 0}%
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-2">
                {isEditing ? (
                  <Input
                    placeholder="Subject template"
                    value={variantData.subject_template}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        [r.id]: { ...variantData, subject_template: e.target.value },
                      })
                    }
                  />
                ) : (
                  <div className="text-sm text-muted-foreground truncate">
                    {variantData.subject_template || "No subject template"}
                  </div>
                )}
                <div className="flex items-center gap-2 justify-end">
                  <span className="text-xs">Enabled</span>
                  <Switch
                    checked={variantData.enabled}
                    onCheckedChange={(checked) =>
                      setEditing({
                        ...editing,
                        [r.id]: { ...variantData, enabled: checked },
                      })
                    }
                    disabled={!isEditing}
                  />
                  <span className="text-xs">Weight</span>
                  {isEditing ? (
                    <Input
                      type="number"
                      min="0"
                      max="1"
                      step="0.1"
                      className="w-24"
                      value={variantData.weight}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          [r.id]: { ...variantData, weight: parseFloat(e.target.value) || 0 },
                        })
                      }
                    />
                  ) : (
                    <span className="text-xs w-24 text-right">{Math.round((variantData.weight || 0) * 100)}%</span>
                  )}
                </div>
              </div>
              {isEditing && (
                <Textarea
                  placeholder="Body HTML template"
                  className="min-h-[120px]"
                  value={variantData.body_html_template}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      [r.id]: { ...variantData, body_html_template: e.target.value },
                    })
                  }
                />
              )}
              {!isEditing && (
                <div className="text-xs text-muted-foreground truncate">
                  {variantData.body_html_template
                    ? `${variantData.body_html_template.substring(0, 100)}...`
                    : "No body template"}
                </div>
              )}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <TemplateRewriter
                  campaignId={campaignId}
                  stepNo={stepNo}
                  variantId={r.id}
                  onVariantCreated={() => mutate()}
                />
                <div className="flex justify-end gap-2">
                  {isEditing ? (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const newEditing = { ...editing };
                          delete newEditing[r.id];
                          setEditing(newEditing);
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleSave(r.id, variantData)}
                        disabled={saving[r.id]}
                      >
                        {saving[r.id] ? "Saving..." : "Save"}
                      </Button>
                    </>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => setEditing({ ...editing, [r.id]: variantData })}>
                      Edit
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {rows.length === 0 && (
          <div className="text-sm text-muted-foreground p-2">
            No variants yet — add two+ to start testing.
          </div>
        )}
      </div>
    </Card>
  );
}

