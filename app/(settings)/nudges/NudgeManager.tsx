"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { createClientComponentClient } from "@/lib/supabase";

type Props = {
  accountId: string;
};

type VariantName = "A" | "B" | "C";

type StyleProfileRow = {
  formality: number | null;
  brevity: number | null;
  empathy: number | null;
  cta_directness: number | null;
  para_count_avg: number | null;
  link_tolerance: number | null;
  emoji_tolerance: number | null;
  updated_at?: string | null;
};

const STYLE_DEFAULT: Required<Omit<StyleProfileRow, "updated_at">> = {
  formality: 0.5,
  brevity: 0.5,
  empathy: 0.5,
  cta_directness: 0.5,
  para_count_avg: 2.0,
  link_tolerance: 0.5,
  emoji_tolerance: 0.0,
};

export default function NudgeManager({ accountId }: Props) {
  const [key, setKey] = useState("default");
  const [label, setLabel] = useState("Default follow-up");
  const [presetId, setPresetId] = useState<string | null>(null);

  const supabase = useMemo(() => createClientComponentClient(), []);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [styleProfile, setStyleProfile] = useState<StyleProfileRow | null>(null);
  const [styleLoading, setStyleLoading] = useState(true);
  const [styleError, setStyleError] = useState<string | null>(null);
  const [isResettingStyle, setIsResettingStyle] = useState(false);

  const [variantName, setVariantName] = useState<VariantName>("A");
  const [weight, setWeight] = useState([50]);
  const [subject, setSubject] = useState("Quick follow-up");
  const [body, setBody] = useState(
    "Hey {{first_name}},\nFollowing up on my note. Open to a quick chat?",
  );

  const [isSavingPreset, setIsSavingPreset] = useState(false);
  const [isSavingVariant, setIsSavingVariant] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setStyleLoading(true);
      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) {
          throw userError;
        }

        if (!user) {
          if (!cancelled) {
            setOwnerId(null);
            setStyleProfile(null);
            setStyleError(null);
          }
          return;
        }

        if (cancelled) return;

        setOwnerId(user.id);

        const { data, error } = await supabase
          .from("style_profile")
          .select(
            "formality, brevity, empathy, cta_directness, para_count_avg, link_tolerance, emoji_tolerance, updated_at"
          )
          .eq("owner_id", user.id)
          .maybeSingle();

        if (cancelled) return;

        const errorCode = (error as any)?.code;
        if (error && errorCode !== "PGRST116") {
          throw error;
        }

        setStyleProfile(data ?? null);
        setStyleError(null);
      } catch (error: any) {
        if (cancelled) return;
        console.error("Failed to load style profile", error);
        setStyleProfile(null);
        setStyleError(error?.message ?? "Unable to load style profile");
      } finally {
        if (!cancelled) {
          setStyleLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const createPreset = async () => {
    if (!key.trim()) {
      toast.error("Preset key is required");
      return;
    }

    setIsSavingPreset(true);
    try {
      const response = await fetch("/api/nudges/presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_id: accountId,
          scope: "account",
          key: key.trim(),
          label: label.trim() || key.trim(),
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.error ?? "Failed to create preset");
      }

      toast.success("Preset saved");
      setPresetId(result?.preset?.id ?? null);
    } catch (error: any) {
      toast.error(error?.message ?? "Preset save failed");
    } finally {
      setIsSavingPreset(false);
    }
  };

  const addVariant = async () => {
    if (!presetId) {
      toast.error("Create a preset first");
      return;
    }

    setIsSavingVariant(true);
    try {
      const response = await fetch("/api/nudges/variants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preset_id: presetId,
          name: variantName,
          weight: (weight[0] ?? 50) / 100,
          subject: subject.trim() || null,
          body_text: body,
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.error ?? "Failed to add variant");
      }

      toast.success(`Variant ${variantName} saved`);
    } catch (error: any) {
      toast.error(error?.message ?? "Variant save failed");
    } finally {
      setIsSavingVariant(false);
    }
  };

  const resetStyleProfile = async () => {
    if (!ownerId) {
      toast.error("No user session found");
      return;
    }
    setIsResettingStyle(true);
    try {
      const payload = {
        owner_id: ownerId,
        ...STYLE_DEFAULT,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from("style_profile").upsert(payload);
      if (error) {
        throw error;
      }
      setStyleProfile({
        ...STYLE_DEFAULT,
        updated_at: payload.updated_at,
      });
      setStyleError(null);
      toast.success("Style profile reset");
    } catch (error: any) {
      console.error("Failed to reset style profile", error);
      toast.error(error?.message ?? "Failed to reset style profile");
    } finally {
      setIsResettingStyle(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Style Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {styleLoading ? (
            <div className="text-sm text-muted-foreground">Loading style signals…</div>
          ) : styleError ? (
            <div className="text-sm text-red-500">Failed to load style profile — {styleError}</div>
          ) : styleProfile ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Gauge label="Formality" value={styleProfile.formality} />
                <Gauge label="Brevity" value={styleProfile.brevity} />
                <Gauge label="Empathy" value={styleProfile.empathy} />
                <Gauge label="CTA directness" value={styleProfile.cta_directness} />
              </div>
              <div className="grid gap-2 text-sm">
                <StatRow
                  label="Avg paragraphs"
                  value={`${Math.max(1, Math.round(styleProfile.para_count_avg ?? STYLE_DEFAULT.para_count_avg))}`}
                />
                <StatRow
                  label="Link tolerance"
                  value={styleProfile.link_tolerance > 0.6 ? "One link allowed" : "Avoid links unless necessary"}
                />
                <StatRow
                  label="Emoji tolerance"
                  value={styleProfile.emoji_tolerance > 0.3 ? "Allowed sparingly" : "Do not use"}
                />
                {styleProfile.updated_at ? (
                  <StatRow
                    label="Last updated"
                    value={new Date(styleProfile.updated_at).toLocaleString()}
                  />
                ) : null}
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              No AI edits captured yet. Send or edit drafts created by the assistant to build a style profile.
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={resetStyleProfile}
            disabled={isResettingStyle || !ownerId}
          >
            {isResettingStyle ? "Resetting…" : "Reset profile"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Nudge Preset</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="text-sm">Key</label>
              <Input value={key} onChange={(event) => setKey(event.target.value)} />
            </div>
            <div>
              <label className="text-sm">Label</label>
              <Input value={label} onChange={(event) => setLabel(event.target.value)} />
            </div>
          </div>
          <Button onClick={createPreset} disabled={!key || isSavingPreset}>
            {isSavingPreset ? "Saving…" : "Create / Update"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Variant</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="text-sm">Variant name</label>
              <Input
                value={variantName}
                onChange={(event) => setVariantName(event.target.value as VariantName)}
                maxLength={1}
              />
            </div>
            <div>
              <label className="text-sm">
                Weight <span className="opacity-70">{weight[0]}%</span>
              </label>
              <Slider
                value={weight}
                onValueChange={setWeight}
                min={1}
                max={99}
                step={1}
                aria-label="Variant weight"
              />
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="text-sm">Subject</label>
              <Input value={subject} onChange={(event) => setSubject(event.target.value)} />
            </div>
            <div>
              <label className="text-sm">Preset ID</label>
              <Input value={presetId ?? ""} readOnly placeholder="Create preset to get ID" />
            </div>
          </div>
          <div>
            <label className="text-sm">Body (Text)</label>
            <Textarea rows={8} value={body} onChange={(event) => setBody(event.target.value)} />
          </div>
          <div className="flex gap-2">
            <Button onClick={addVariant} disabled={!presetId || isSavingVariant}>
              {isSavingVariant ? "Saving…" : `Save Variant ${variantName}`}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setVariantName((prev) => {
                  if (prev === "A") return "B";
                  if (prev === "B") return "C";
                  return "A";
                });
              }}
            >
              Cycle Name
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Routing by Label</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {["positive", "meeting_intent", "ooo", "oos", "bounce", "neutral"].map((labelKey) => (
            <RoutingRow key={labelKey} accountId={accountId} label={labelKey} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function RoutingRow({ accountId, label }: { accountId: string; label: string }) {
  const [presetKey, setPresetKey] = useState("default");
  const [isSaving, setIsSaving] = useState(false);

  const save = async () => {
    if (!presetKey.trim()) {
      toast.error("Preset key required");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch("/api/nudges/routing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_id: accountId,
          label,
          preset_key: presetKey.trim(),
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.error ?? "Failed to map routing");
      }
      toast.success(`Mapped ${label} to ${presetKey}`);
    } catch (error: any) {
      toast.error(error?.message ?? "Routing update failed");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <div className="w-40 text-sm font-medium capitalize text-muted-foreground">{label}</div>
      <Input
        className="max-w-xs"
        value={presetKey}
        onChange={(event) => setPresetKey(event.target.value)}
        placeholder="preset key…"
      />
      <Button size="sm" onClick={save} disabled={isSaving}>
        {isSaving ? "Saving…" : "Map"}
      </Button>
    </div>
  );
}

function Gauge({ label, value }: { label: string; value: number | null | undefined }) {
  const numeric = typeof value === "number" ? Math.min(1, Math.max(0, value)) : null;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground">
        <span>{label}</span>
        <span className="font-medium text-foreground">
          {numeric !== null ? `${Math.round(numeric * 100)}%` : "—"}
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width]"
          style={{ width: `${numeric !== null ? numeric * 100 : 0}%` }}
        />
      </div>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded border border-border/60 bg-muted/20 px-2.5 py-1.5">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

