"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Trash2, Plus, Tag, Mail, Ban } from "lucide-react";

interface ClickAction {
  id: string;
  match_url: string;
  action: "tag" | "followup_campaign" | "suppress";
  value: string;
  created_at: string;
}

export default function ClickActionsPage() {
  const params = useParams();
  const campaignId = params.id as string;
  
  const [rules, setRules] = useState<ClickAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [url, setUrl] = useState("");
  const [action, setAction] = useState<"tag" | "followup_campaign" | "suppress">("tag");
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadRules = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/campaigns/${campaignId}/click-actions`);
      if (response.ok) {
        const data = await response.json();
        setRules(data);
      }
    } catch (error) {
      console.error("Error loading click actions:", error);
    } finally {
      setLoading(false);
    }
  };

  const addRule = async () => {
    if (!url.trim() || !action) return;
    
    try {
      setSubmitting(true);
      const response = await fetch(`/api/campaigns/${campaignId}/click-actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ match_url: url.trim(), action, value: value.trim() }),
      });
      
      if (response.ok) {
        setUrl("");
        setValue("");
        await loadRules();
      }
    } catch (error) {
      console.error("Error adding click action:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const deleteRule = async (actionId: string) => {
    try {
      const response = await fetch(
        `/api/campaigns/${campaignId}/click-actions?actionId=${actionId}`,
        { method: "DELETE" }
      );
      
      if (response.ok) {
        await loadRules();
      }
    } catch (error) {
      console.error("Error deleting click action:", error);
    }
  };

  useEffect(() => {
    loadRules();
  }, [campaignId]);

  const getActionIcon = (action: string) => {
    switch (action) {
      case "tag": return <Tag className="w-4 h-4" />;
      case "followup_campaign": return <Mail className="w-4 h-4" />;
      case "suppress": return <Ban className="w-4 h-4" />;
      default: return null;
    }
  };

  const getActionDescription = (action: string, value: string) => {
    switch (action) {
      case "tag": return `Tag as "${value}"`;
      case "followup_campaign": return `Enroll in campaign ${value}`;
      case "suppress": return "Suppress future emails";
      default: return action;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-4xl p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold mb-2">Click Actions</h1>
        <p className="text-gray-600">
          Automatically tag contacts, enroll them in follow-up campaigns, or suppress emails based on which links they click.
        </p>
      </div>

      {/* Add New Rule Form */}
      <div className="bg-white rounded-lg border p-6 space-y-4">
        <h2 className="text-lg font-medium">Add New Rule</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Match URL (contains...)
            </label>
            <input
              type="text"
              className="border border-gray-300 rounded-md px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., pricing, signup, demo"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Action
            </label>
            <select
              className="border border-gray-300 rounded-md px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={action}
              onChange={(e) => setAction(e.target.value as any)}
            >
              <option value="tag">Tag contact</option>
              <option value="followup_campaign">Enroll in campaign</option>
              <option value="suppress">Suppress email</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Value
            </label>
            <input
              type="text"
              className="border border-gray-300 rounded-md px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder={action === "tag" ? "tag name" : action === "followup_campaign" ? "campaign ID" : ""}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>
        </div>
        
        <button
          onClick={addRule}
          disabled={!url.trim() || submitting}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          {submitting ? "Adding..." : "Add Rule"}
        </button>
      </div>

      {/* Existing Rules */}
      <div className="bg-white rounded-lg border">
        <div className="px-6 py-4 border-b">
          <h2 className="text-lg font-medium">Active Rules</h2>
        </div>
        
        {rules.length === 0 ? (
          <div className="px-6 py-8 text-center text-gray-500">
            <p>No click actions defined yet.</p>
            <p className="text-sm">Create your first rule above to get started.</p>
          </div>
        ) : (
          <ul className="divide-y">
            {rules.map((rule) => (
              <li key={rule.id} className="px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {getActionIcon(rule.action)}
                  <div>
                    <p className="font-medium">
                      If URL contains <code className="bg-gray-100 px-2 py-1 rounded text-sm">{rule.match_url}</code>
                    </p>
                    <p className="text-sm text-gray-600">
                      → {getActionDescription(rule.action, rule.value)}
                    </p>
                  </div>
                </div>
                
                <button
                  onClick={() => deleteRule(rule.id)}
                  className="text-red-600 hover:text-red-800 p-2 rounded-md hover:bg-red-50"
                  title="Delete rule"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Help Text */}
      <div className="bg-blue-50 rounded-lg p-4">
        <h3 className="font-medium text-blue-900 mb-2">How it works</h3>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• <strong>Tag:</strong> Add a tag to contacts when they click links containing your specified text</li>
          <li>• <strong>Follow-up Campaign:</strong> Automatically enroll clickers into another email campaign</li>
          <li>• <strong>Suppress:</strong> Stop sending emails to contacts who click certain links</li>
          <li>• Rules are processed in real-time when someone clicks a tracked link</li>
        </ul>
      </div>
    </main>
  );
} 