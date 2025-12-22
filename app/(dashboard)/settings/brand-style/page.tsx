"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

interface BrandStyleGuide {
  id: string;
  account_id: string;
  campaign_id: string | null;
  scope: "account" | "campaign";
  voice_principles: string | null;
  formatting_rules: string | null;
  length_limits: { subject_max?: number; body_max?: number } | null;
  required_tags: string[] | null;
  can_include_links: boolean;
}

interface PhraseBank {
  id: string;
  account_id: string;
  campaign_id: string | null;
  kind: "allow" | "deny";
  phrase: string;
  note: string | null;
}

export default function BrandStylePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [styleGuide, setStyleGuide] = useState<BrandStyleGuide | null>(null);
  const [phrases, setPhrases] = useState<PhraseBank[]>([]);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [campaignId, setCampaignId] = useState<string | null>(null);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // Get account_id from profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("account_id")
        .eq("id", user.id)
        .maybeSingle();

      const accId = profile?.account_id || user.id;
      setAccountId(accId);

      // Load account-wide style guide
      const { data: bsg } = await supabase
        .from("brand_style_guides")
        .select("*")
        .eq("account_id", accId)
        .eq("scope", "account")
        .is("campaign_id", null)
        .maybeSingle();

      if (bsg) {
        setStyleGuide(bsg as BrandStyleGuide);
      } else {
        // Create default if none exists
        const { data: newBsg } = await supabase
          .from("brand_style_guides")
          .insert({
            account_id: accId,
            scope: "account",
            length_limits: { subject_max: 100, body_max: 2000 },
            required_tags: ["{{first_name}}"],
            can_include_links: true,
          })
          .select()
          .single();
        if (newBsg) setStyleGuide(newBsg as BrandStyleGuide);
      }

      // Load phrase bank
      const { data: pb } = await supabase
        .from("brand_phrase_bank")
        .select("*")
        .eq("account_id", accId)
        .is("campaign_id", null)
        .order("kind", { ascending: true })
        .order("created_at", { ascending: false });

      if (pb) setPhrases(pb as PhraseBank[]);
    } catch (error) {
      console.error("Failed to load brand style:", error);
    } finally {
      setLoading(false);
    }
  }

  async function saveStyleGuide() {
    if (!accountId || !styleGuide) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("brand_style_guides")
        .upsert(
          {
            id: styleGuide.id,
            account_id: accountId,
            scope: "account",
            voice_principles: styleGuide.voice_principles || null,
            formatting_rules: styleGuide.formatting_rules || null,
            length_limits: styleGuide.length_limits || {
              subject_max: 100,
              body_max: 2000,
            },
            required_tags: styleGuide.required_tags || [],
            can_include_links: styleGuide.can_include_links ?? true,
          },
          { onConflict: "id" },
        );

      if (error) throw error;
      alert("Style guide saved!");
    } catch (error: any) {
      alert("Failed to save: " + error.message);
    } finally {
      setSaving(false);
    }
  }

  async function addPhrase(kind: "allow" | "deny", phrase: string, note: string = "") {
    if (!accountId || !phrase.trim()) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("brand_phrase_bank").insert({
        account_id: accountId,
        kind,
        phrase: phrase.trim(),
        note: note.trim() || null,
      });

      if (error) throw error;
      await loadData();
    } catch (error: any) {
      alert("Failed to add phrase: " + error.message);
    } finally {
      setSaving(false);
    }
  }

  async function removePhrase(id: string) {
    setSaving(true);
    try {
      const { error } = await supabase.from("brand_phrase_bank").delete().eq("id", id);
      if (error) throw error;
      await loadData();
    } catch (error: any) {
      alert("Failed to remove phrase: " + error.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="p-6 space-y-8 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold mb-2">Brand Style Guide</h1>
        <p className="text-sm text-gray-600">
          Configure voice principles, formatting rules, length limits, and phrase banks for your
          brand.
        </p>
      </div>

      {/* Style Guide Form */}
      <div className="border rounded-lg p-6 space-y-6">
        <h2 className="text-lg font-medium">Style Guide Settings</h2>

        <div>
          <label className="block text-sm font-medium mb-2">Voice Principles</label>
          <textarea
            className="w-full px-3 py-2 border rounded-md"
            rows={3}
            placeholder="e.g., confident, concise, respectful"
            value={styleGuide?.voice_principles || ""}
            onChange={(e) =>
              setStyleGuide({
                ...styleGuide!,
                voice_principles: e.target.value,
              })
            }
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Formatting Rules</label>
          <textarea
            className="w-full px-3 py-2 border rounded-md"
            rows={3}
            placeholder="e.g., no emojis; <=2 paragraphs; 1 CTA"
            value={styleGuide?.formatting_rules || ""}
            onChange={(e) =>
              setStyleGuide({
                ...styleGuide!,
                formatting_rules: e.target.value,
              })
            }
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Subject Max Length</label>
            <input
              type="number"
              className="w-full px-3 py-2 border rounded-md"
              value={styleGuide?.length_limits?.subject_max || 100}
              onChange={(e) =>
                setStyleGuide({
                  ...styleGuide!,
                  length_limits: {
                    ...(styleGuide?.length_limits || {}),
                    subject_max: parseInt(e.target.value) || 100,
                  },
                })
              }
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Body Max Length</label>
            <input
              type="number"
              className="w-full px-3 py-2 border rounded-md"
              value={styleGuide?.length_limits?.body_max || 2000}
              onChange={(e) =>
                setStyleGuide({
                  ...styleGuide!,
                  length_limits: {
                    ...(styleGuide?.length_limits || {}),
                    body_max: parseInt(e.target.value) || 2000,
                  },
                })
              }
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Required Tags</label>
          <input
            type="text"
            className="w-full px-3 py-2 border rounded-md"
            placeholder='e.g., {{first_name}}, {{company}}'
            value={(styleGuide?.required_tags || []).join(", ")}
            onChange={(e) => {
              const tags = e.target.value
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean);
              setStyleGuide({
                ...styleGuide!,
                required_tags: tags,
              });
            }}
          />
          <p className="text-xs text-gray-500 mt-1">
            Comma-separated list of required merge tags
          </p>
        </div>

        <div className="flex items-center">
          <input
            type="checkbox"
            id="can_include_links"
            className="mr-2"
            checked={styleGuide?.can_include_links ?? true}
            onChange={(e) =>
              setStyleGuide({
                ...styleGuide!,
                can_include_links: e.target.checked,
              })
            }
          />
          <label htmlFor="can_include_links" className="text-sm font-medium">
            Allow links in emails
          </label>
        </div>

        <button
          onClick={saveStyleGuide}
          disabled={saving}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Style Guide"}
        </button>
      </div>

      {/* Phrase Bank */}
      <div className="border rounded-lg p-6 space-y-4">
        <h2 className="text-lg font-medium">Phrase Bank</h2>
        <p className="text-sm text-gray-600">
          Add preferred (allow) or forbidden (deny) phrases for brand consistency.
        </p>

        <PhraseBankTable
          phrases={phrases}
          onAdd={addPhrase}
          onRemove={removePhrase}
          saving={saving}
        />
      </div>
    </div>
  );
}

function PhraseBankTable({
  phrases,
  onAdd,
  onRemove,
  saving,
}: {
  phrases: PhraseBank[];
  onAdd: (kind: "allow" | "deny", phrase: string, note: string) => void;
  onRemove: (id: string) => void;
  saving: boolean;
}) {
  const [newPhrase, setNewPhrase] = useState("");
  const [newNote, setNewNote] = useState("");
  const [newKind, setNewKind] = useState<"allow" | "deny">("deny");

  const allowPhrases = phrases.filter((p) => p.kind === "allow");
  const denyPhrases = phrases.filter((p) => p.kind === "deny");

  function handleAdd() {
    if (!newPhrase.trim()) return;
    onAdd(newKind, newPhrase, newNote);
    setNewPhrase("");
    setNewNote("");
  }

  return (
    <div className="space-y-6">
      {/* Add New Phrase */}
      <div className="border rounded p-4 space-y-3">
        <div className="flex gap-2">
          <select
            className="px-3 py-2 border rounded-md"
            value={newKind}
            onChange={(e) => setNewKind(e.target.value as "allow" | "deny")}
          >
            <option value="allow">Allow (Preferred)</option>
            <option value="deny">Deny (Forbidden)</option>
          </select>
          <input
            type="text"
            className="flex-1 px-3 py-2 border rounded-md"
            placeholder="Enter phrase..."
            value={newPhrase}
            onChange={(e) => setNewPhrase(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          />
          <input
            type="text"
            className="w-48 px-3 py-2 border rounded-md"
            placeholder="Note (optional)"
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          />
          <button
            onClick={handleAdd}
            disabled={saving || !newPhrase.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </div>

      {/* Deny Phrases */}
      {denyPhrases.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-2 text-red-600">Forbidden Phrases</h3>
          <div className="space-y-2">
            {denyPhrases.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between p-2 border rounded bg-red-50"
              >
                <div>
                  <span className="font-medium">{p.phrase}</span>
                  {p.note && <span className="text-sm text-gray-600 ml-2">({p.note})</span>}
                </div>
                <button
                  onClick={() => onRemove(p.id)}
                  className="text-red-600 hover:text-red-800"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Allow Phrases */}
      {allowPhrases.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-2 text-green-600">Preferred Phrases</h3>
          <div className="space-y-2">
            {allowPhrases.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between p-2 border rounded bg-green-50"
              >
                <div>
                  <span className="font-medium">{p.phrase}</span>
                  {p.note && <span className="text-sm text-gray-600 ml-2">({p.note})</span>}
                </div>
                <button
                  onClick={() => onRemove(p.id)}
                  className="text-red-600 hover:text-red-800"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {phrases.length === 0 && (
        <p className="text-sm text-gray-500 text-center py-4">No phrases added yet.</p>
      )}
    </div>
  );
}

