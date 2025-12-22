"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/label";

interface OrgSettings {
  id?: string;
  workspace_id: string;
  org_name: string;
  brand_color: string;
  logo_url?: string;
  default_sender_name: string;
  default_sender_email: string;
  api_key?: string;
  updated_at?: string;
}

export default function SettingsPanel() {
  const [data, setData] = useState<OrgSettings>({
    workspace_id: '',
    org_name: 'My Organization',
    brand_color: '#FFD700',
    logo_url: '',
    default_sender_name: 'SmartSend AI',
    default_sender_email: 'noreply@smartsend.ai',
  });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const searchParams = useSearchParams();
  const workspaceId = searchParams.get('ws');

  async function load() {
    if (!workspaceId) {
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`/api/settings?workspace_id=${workspaceId}`);
      const json = await res.json();
      if (json.settings) {
        setData(json.settings);
      } else {
        // Set default values for new workspace
        setData(prev => ({ ...prev, workspace_id: workspaceId }));
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!workspaceId) {
      alert('No workspace selected');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, workspace_id: workspaceId }),
      });
      
      if (res.ok) {
        alert("✅ Settings saved successfully!");
      } else {
        const error = await res.json();
        alert(`❌ Error: ${error.error}`);
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      alert('❌ Error saving settings');
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => { 
    load(); 
  }, [workspaceId]);

  if (loading) {
    return (
      <div className="rounded-2xl border p-4">
        <div className="animate-pulse space-y-3">
          <div className="h-6 bg-gray-200 rounded w-1/3"></div>
          <div className="space-y-2">
            <div className="h-4 bg-gray-200 rounded w-1/4"></div>
            <div className="h-10 bg-gray-200 rounded"></div>
          </div>
          <div className="space-y-2">
            <div className="h-4 bg-gray-200 rounded w-1/4"></div>
            <div className="h-10 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!workspaceId) {
    return (
      <div className="rounded-2xl border p-4 text-center text-gray-500">
        <p>Please select a workspace to manage settings</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border p-6 space-y-4">
      <h3 className="text-lg font-semibold">⚙️ Organization Settings</h3>

      <div className="grid gap-4">
        <div className="space-y-2">
          <Label>Organization Name</Label>
          <Input 
            value={data.org_name || ""} 
            onChange={e => setData({...data, org_name: e.target.value})} 
            placeholder="My Organization"
          />
        </div>
        
        <div className="space-y-2">
          <Label>Brand Color</Label>
          <div className="flex items-center gap-2">
            <Input 
              type="color" 
              value={data.brand_color || "#FFD700"} 
              onChange={e => setData({...data, brand_color: e.target.value})}
              className="w-16 h-10"
            />
            <Input 
              value={data.brand_color || "#FFD700"} 
              onChange={e => setData({...data, brand_color: e.target.value})}
              placeholder="#FFD700"
            />
          </div>
        </div>
        
        <div className="space-y-2">
          <Label>Logo URL</Label>
          <Input 
            value={data.logo_url || ""} 
            onChange={e => setData({...data, logo_url: e.target.value})} 
            placeholder="https://example.com/logo.png"
          />
        </div>
        
        <div className="space-y-2">
          <Label>Default Sender Name</Label>
          <Input 
            value={data.default_sender_name || ""} 
            onChange={e => setData({...data, default_sender_name: e.target.value})} 
            placeholder="SmartSend AI"
          />
        </div>
        
        <div className="space-y-2">
          <Label>Default Sender Email</Label>
          <Input 
            type="email"
            value={data.default_sender_email || ""} 
            onChange={e => setData({...data, default_sender_email: e.target.value})} 
            placeholder="noreply@smartsend.ai"
          />
        </div>
      </div>

      <Button 
        onClick={save} 
        disabled={saving} 
        className="bg-yellow-500 text-black hover:bg-yellow-600 mt-4"
      >
        {saving ? "Saving..." : "Save Changes"}
      </Button>
    </div>
  );
}