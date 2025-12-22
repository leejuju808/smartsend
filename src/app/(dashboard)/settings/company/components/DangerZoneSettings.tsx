"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { AlertTriangle, Trash2, RotateCcw, UserX, Building2 } from "lucide-react";

interface DangerZoneSettingsProps {
  canEdit: boolean;
}

export default function DangerZoneSettings({ canEdit }: DangerZoneSettingsProps) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleDangerAction = async (action: string) => {
    if (!canEdit) return;

    if (confirming !== action) {
      setConfirming(action);
      setPassword("");
      setMessage(null);
      return;
    }

    if (!password) {
      setMessage("Please enter your password to confirm");
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      // TODO: Implement actual API calls for each action
      await new Promise((resolve) => setTimeout(resolve, 1000));

      setMessage(`Action "${action}" would be executed here. This is a placeholder.`);
      setConfirming(null);
      setPassword("");
    } catch (error: any) {
      setMessage(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const dangerActions = [
    {
      id: "delete_contacts",
      title: "Delete All Contacts",
      description: "Permanently delete all contacts from your workspace. This cannot be undone.",
      icon: Trash2,
      color: "text-red-600",
    },
    {
      id: "reset_pipeline",
      title: "Reset Pipeline",
      description: "Reset all leads to default status. This will clear all pipeline progress.",
      icon: RotateCcw,
      color: "text-orange-600",
    },
    {
      id: "reset_lead_scores",
      title: "Reset Lead Scores",
      description: "Reset all lead scores to zero. Scores will be recalculated over time.",
      icon: RotateCcw,
      color: "text-orange-600",
    },
    {
      id: "reset_assigned_staff",
      title: "Reset Assigned Staff",
      description: "Remove all staff assignments from leads. Leads will need to be reassigned.",
      icon: UserX,
      color: "text-orange-600",
    },
    {
      id: "transfer_ownership",
      title: "Transfer Ownership",
      description: "Transfer workspace ownership to another team member.",
      icon: UserX,
      color: "text-blue-600",
    },
    {
      id: "delete_company",
      title: "Delete Company Account",
      description: "Permanently delete your company account and all data. This cannot be undone.",
      icon: Building2,
      color: "text-red-600",
    },
  ];

  if (!canEdit) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold mb-2">Danger Zone</h1>
          <p className="text-sm text-gray-600">
            Only company owners can access danger zone settings
          </p>
        </div>
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-sm text-yellow-800">
            You must be the company owner to access these settings.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold mb-2">Danger Zone</h1>
        <p className="text-sm text-gray-600">
          Powerful but destructive actions. All options require confirmation and password.
        </p>
      </div>

      <div className="space-y-4">
        {dangerActions.map((action) => {
          const Icon = action.icon;
          const isConfirming = confirming === action.id;

          return (
            <div
              key={action.id}
              className="bg-white rounded-lg border border-gray-200 p-6"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <Icon className={`h-5 w-5 ${action.color} mt-0.5`} />
                  <div>
                    <h3 className="font-medium text-gray-900">{action.title}</h3>
                    <p className="text-sm text-gray-600 mt-1">{action.description}</p>
                  </div>
                </div>
              </div>

              {isConfirming && (
                <div className="mt-4 pt-4 border-t">
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Enter your password to confirm
                      </label>
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-red-500 focus:border-red-500"
                        placeholder="Your password"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => handleDangerAction(action.id)}
                        disabled={loading || !password}
                        variant="destructive"
                        size="sm"
                      >
                        {loading ? "Processing..." : `Confirm ${action.title}`}
                      </Button>
                      <Button
                        onClick={() => {
                          setConfirming(null);
                          setPassword("");
                          setMessage(null);
                        }}
                        variant="outline"
                        size="sm"
                        disabled={loading}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {!isConfirming && (
                <div className="mt-4">
                  <Button
                    onClick={() => handleDangerAction(action.id)}
                    variant={action.id.includes("delete") ? "destructive" : "outline"}
                    size="sm"
                  >
                    {action.title}
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {message && (
        <div
          className={`p-4 rounded-lg border ${
            message.startsWith("Error")
              ? "bg-red-50 border-red-200 text-red-800"
              : "bg-yellow-50 border-yellow-200 text-yellow-800"
          }`}
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-5 w-5 mt-0.5" />
            <div>
              <p className="font-medium">Warning</p>
              <p className="text-sm mt-1">{message}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}





















































