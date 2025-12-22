// app/(dashboard)/settings/ai-reply/page.tsx
// Block 19840 — AI Reply Assistant Settings v1
// Settings page for configuring AI reply preferences

"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

interface AIReplySettings {
  tone: 'friendly' | 'direct' | 'professional' | 'laid-back' | 'insurance-heavy' | 'sales-optimized';
  include_signature: boolean;
  include_phone: boolean;
  include_scheduling_link: boolean;
  include_address: boolean;
  owner_name: string;
  company_name: string;
  phone: string;
  scheduling_link: string;
  address: string;
  auto_detect_reply_type: boolean;
  enable_objection_handling: boolean;
  enable_follow_up_suggestions: boolean;
  allow_pricing_estimates: boolean;
  default_price_range_min: number | null;
  default_price_range_max: number | null;
}

export default function AIReplySettingsPage() {
  const supabase = createClientComponentClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<AIReplySettings>({
    tone: 'friendly',
    include_signature: true,
    include_phone: true,
    include_scheduling_link: true,
    include_address: false,
    owner_name: '',
    company_name: '',
    phone: '',
    scheduling_link: '',
    address: '',
    auto_detect_reply_type: true,
    enable_objection_handling: true,
    enable_follow_up_suggestions: true,
    allow_pricing_estimates: false,
    default_price_range_min: null,
    default_price_range_max: null,
  });

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("ai_reply_settings")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.error("Error loading settings:", error);
        return;
      }

      if (data) {
        setSettings({
          tone: data.tone || 'friendly',
          include_signature: data.include_signature ?? true,
          include_phone: data.include_phone ?? true,
          include_scheduling_link: data.include_scheduling_link ?? true,
          include_address: data.include_address ?? false,
          owner_name: data.owner_name || '',
          company_name: data.company_name || '',
          phone: data.phone || '',
          scheduling_link: data.scheduling_link || '',
          address: data.address || '',
          auto_detect_reply_type: data.auto_detect_reply_type ?? true,
          enable_objection_handling: data.enable_objection_handling ?? true,
          enable_follow_up_suggestions: data.enable_follow_up_suggestions ?? true,
          allow_pricing_estimates: data.allow_pricing_estimates ?? false,
          default_price_range_min: data.default_price_range_min || null,
          default_price_range_max: data.default_price_range_max || null,
        });
      }
    } catch (error) {
      console.error("Error loading AI reply settings:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        alert("Please sign in to save settings");
        return;
      }

      const { error } = await supabase
        .from("ai_reply_settings")
        .upsert({
          user_id: user.id,
          ...settings,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id',
        });

      if (error) {
        console.error("Error saving settings:", error);
        alert("Failed to save settings: " + error.message);
      } else {
        alert("Settings saved successfully!");
      }
    } catch (error: any) {
      console.error("Error saving AI reply settings:", error);
      alert("Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-neutral-400">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-neutral-100 mb-2">AI Reply Assistant Settings</h1>
        <p className="text-neutral-400 text-sm">
          Configure how AI generates replies to homeowners in your inbox.
        </p>
      </div>

      {/* Tone Preferences */}
      <section className="bg-neutral-900 rounded-xl p-6 border border-neutral-800">
        <h2 className="text-lg font-semibold text-neutral-100 mb-4">Reply Tone</h2>
        <p className="text-sm text-neutral-400 mb-4">
          Choose the tone for all AI-generated replies. This affects how professional, friendly, or direct your messages sound.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {(['friendly', 'direct', 'professional', 'laid-back', 'insurance-heavy', 'sales-optimized'] as const).map((tone) => (
            <button
              key={tone}
              onClick={() => setSettings({ ...settings, tone })}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                settings.tone === tone
                  ? 'bg-emerald-600 text-white'
                  : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
              }`}
            >
              {tone.charAt(0).toUpperCase() + tone.slice(1).replace('-', ' ')}
            </button>
          ))}
        </div>
      </section>

      {/* Signature Settings */}
      <section className="bg-neutral-900 rounded-xl p-6 border border-neutral-800">
        <h2 className="text-lg font-semibold text-neutral-100 mb-4">Signature & Contact Info</h2>
        <p className="text-sm text-neutral-400 mb-4">
          Configure what information is automatically added to AI-generated replies.
        </p>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium text-neutral-200">Include Signature</label>
              <p className="text-xs text-neutral-400">Automatically append signature to AI replies</p>
            </div>
            <input
              type="checkbox"
              checked={settings.include_signature}
              onChange={(e) => setSettings({ ...settings, include_signature: e.target.checked })}
              className="w-5 h-5 rounded border-neutral-700 bg-neutral-800"
            />
          </div>

          {settings.include_signature && (
            <div className="pl-6 space-y-4 border-l-2 border-neutral-800">
              <div>
                <label className="block text-sm font-medium text-neutral-200 mb-1">Owner Name</label>
                <input
                  type="text"
                  value={settings.owner_name}
                  onChange={(e) => setSettings({ ...settings, owner_name: e.target.value })}
                  placeholder="Your name"
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-200 mb-1">Company Name</label>
                <input
                  type="text"
                  value={settings.company_name}
                  onChange={(e) => setSettings({ ...settings, company_name: e.target.value })}
                  placeholder="Your company name"
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium text-neutral-200">Include Phone</label>
                  <p className="text-xs text-neutral-400">Add phone number to signature</p>
                </div>
                <input
                  type="checkbox"
                  checked={settings.include_phone}
                  onChange={(e) => setSettings({ ...settings, include_phone: e.target.checked })}
                  className="w-5 h-5 rounded border-neutral-700 bg-neutral-800"
                />
              </div>

              {settings.include_phone && (
                <div className="pl-6">
                  <input
                    type="text"
                    value={settings.phone}
                    onChange={(e) => setSettings({ ...settings, phone: e.target.value })}
                    placeholder="(555) 123-4567"
                    className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              )}

              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium text-neutral-200">Include Scheduling Link</label>
                  <p className="text-xs text-neutral-400">Add scheduling link to signature</p>
                </div>
                <input
                  type="checkbox"
                  checked={settings.include_scheduling_link}
                  onChange={(e) => setSettings({ ...settings, include_scheduling_link: e.target.checked })}
                  className="w-5 h-5 rounded border-neutral-700 bg-neutral-800"
                />
              </div>

              {settings.include_scheduling_link && (
                <div className="pl-6">
                  <input
                    type="text"
                    value={settings.scheduling_link}
                    onChange={(e) => setSettings({ ...settings, scheduling_link: e.target.value })}
                    placeholder="https://calendly.com/your-link"
                    className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              )}

              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium text-neutral-200">Include Address</label>
                  <p className="text-xs text-neutral-400">Add business address to signature</p>
                </div>
                <input
                  type="checkbox"
                  checked={settings.include_address}
                  onChange={(e) => setSettings({ ...settings, include_address: e.target.checked })}
                  className="w-5 h-5 rounded border-neutral-700 bg-neutral-800"
                />
              </div>

              {settings.include_address && (
                <div className="pl-6">
                  <textarea
                    value={settings.address}
                    onChange={(e) => setSettings({ ...settings, address: e.target.value })}
                    placeholder="123 Main St, City, State 12345"
                    rows={2}
                    className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* AI Behavior */}
      <section className="bg-neutral-900 rounded-xl p-6 border border-neutral-800">
        <h2 className="text-lg font-semibold text-neutral-100 mb-4">AI Behavior</h2>
        <p className="text-sm text-neutral-400 mb-4">
          Control how AI analyzes and responds to homeowner messages.
        </p>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium text-neutral-200">Auto-Detect Reply Type</label>
              <p className="text-xs text-neutral-400">Automatically detect scheduling, pricing, insurance, etc.</p>
            </div>
            <input
              type="checkbox"
              checked={settings.auto_detect_reply_type}
              onChange={(e) => setSettings({ ...settings, auto_detect_reply_type: e.target.checked })}
              className="w-5 h-5 rounded border-neutral-700 bg-neutral-800"
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium text-neutral-200">Enable Objection Handling</label>
              <p className="text-xs text-neutral-400">AI detects and responds to objections like "too expensive"</p>
            </div>
            <input
              type="checkbox"
              checked={settings.enable_objection_handling}
              onChange={(e) => setSettings({ ...settings, enable_objection_handling: e.target.checked })}
              className="w-5 h-5 rounded border-neutral-700 bg-neutral-800"
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium text-neutral-200">Enable Follow-Up Suggestions</label>
              <p className="text-xs text-neutral-400">AI suggests follow-up messages for scheduling</p>
            </div>
            <input
              type="checkbox"
              checked={settings.enable_follow_up_suggestions}
              onChange={(e) => setSettings({ ...settings, enable_follow_up_suggestions: e.target.checked })}
              className="w-5 h-5 rounded border-neutral-700 bg-neutral-800"
            />
          </div>
        </div>
      </section>

      {/* Pricing Estimates */}
      <section className="bg-neutral-900 rounded-xl p-6 border border-neutral-800">
        <h2 className="text-lg font-semibold text-neutral-100 mb-4">Pricing Estimates</h2>
        <p className="text-sm text-neutral-400 mb-4">
          Allow AI to include price ranges in replies (optional).
        </p>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium text-neutral-200">Allow Pricing Estimates</label>
              <p className="text-xs text-neutral-400">AI can mention price ranges in replies</p>
            </div>
            <input
              type="checkbox"
              checked={settings.allow_pricing_estimates}
              onChange={(e) => setSettings({ ...settings, allow_pricing_estimates: e.target.checked })}
              className="w-5 h-5 rounded border-neutral-700 bg-neutral-800"
            />
          </div>

          {settings.allow_pricing_estimates && (
            <div className="pl-6 grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-neutral-200 mb-1">Min Price ($)</label>
                <input
                  type="number"
                  value={settings.default_price_range_min || ''}
                  onChange={(e) => setSettings({ ...settings, default_price_range_min: e.target.value ? parseFloat(e.target.value) : null })}
                  placeholder="5000"
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-200 mb-1">Max Price ($)</label>
                <input
                  type="number"
                  value={settings.default_price_range_max || ''}
                  onChange={(e) => setSettings({ ...settings, default_price_range_max: e.target.value ? parseFloat(e.target.value) : null })}
                  placeholder="15000"
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Save Button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? "Saving..." : "Save Settings"}
        </button>
      </div>
    </div>
  );
}



















































