"use client";

// Block 160000 — Automation Builder UI
// Route: /automations

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Zap,
  Plus,
  ToggleLeft,
  ToggleRight,
  Settings,
  Trash2,
  Play,
  Pause,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { createClientComponentClient } from "@/lib/supabase";

interface Automation {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  automation_triggers: Array<{ id: string; event_key: string }>;
  automation_conditions: Array<{
    id: string;
    field: string;
    operator: string;
    value: string;
  }>;
  automation_actions: Array<{
    id: string;
    action_key: string;
    payload: any;
    action_order: number;
  }>;
}

export default function AutomationsPage() {
  const router = useRouter();
  const supabase = createClientComponentClient();
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [companyId, setCompanyId] = useState<string | null>(null);

  useEffect(() => {
    loadCompanyAndAutomations();
  }, []);

  const loadCompanyAndAutomations = async () => {
    try {
      // Get user's company (simplified - you may need to adjust based on your auth structure)
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }

      // Get user's first company (you may want to make this more sophisticated)
      const { data: companies } = await supabase
        .from("roofing_companies")
        .select("id")
        .eq("owner_id", user.id)
        .limit(1)
        .single();

      if (companies) {
        setCompanyId(companies.id);
        await loadAutomations(companies.id);
      } else {
        setLoading(false);
      }
    } catch (error) {
      console.error("Error loading company:", error);
      setLoading(false);
    }
  };

  const loadAutomations = async (cid: string) => {
    try {
      const response = await fetch(`/api/automations?company_id=${cid}`);
      if (!response.ok) throw new Error("Failed to fetch automations");

      const data = await response.json();
      setAutomations(data.automations || []);
    } catch (error) {
      console.error("Error loading automations:", error);
    } finally {
      setLoading(false);
    }
  };

  const toggleAutomation = async (id: string, currentStatus: boolean) => {
    try {
      const response = await fetch(`/api/automations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !currentStatus }),
      });

      if (!response.ok) throw new Error("Failed to toggle automation");

      // Reload automations
      if (companyId) {
        await loadAutomations(companyId);
      }
    } catch (error) {
      console.error("Error toggling automation:", error);
      alert("Failed to toggle automation");
    }
  };

  const deleteAutomation = async (id: string) => {
    if (!confirm("Are you sure you want to delete this automation?")) return;

    try {
      const response = await fetch(`/api/automations/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete automation");

      // Reload automations
      if (companyId) {
        await loadAutomations(companyId);
      }
    } catch (error) {
      console.error("Error deleting automation:", error);
      alert("Failed to delete automation");
    }
  };

  const seedTemplates = async () => {
    if (!companyId) return;

    try {
      const response = await fetch("/api/automations/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: companyId }),
      });

      if (!response.ok) throw new Error("Failed to seed templates");

      // Reload automations
      await loadAutomations(companyId);
      alert("Automation templates created successfully!");
    } catch (error) {
      console.error("Error seeding templates:", error);
      alert("Failed to seed templates");
    }
  };

  const formatEventKey = (key: string) => {
    return key
      .split(".")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  const formatActionKey = (key: string) => {
    return key
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading automations...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Automations</h1>
            <p className="text-gray-600 mt-2">
              Automate your roofing business with triggers, conditions, and actions
            </p>
          </div>
          <div className="flex gap-3">
            {automations.length === 0 && (
              <Button onClick={seedTemplates} variant="outline">
                <Zap className="w-4 h-4 mr-2" />
                Load Templates
              </Button>
            )}
            <Button onClick={() => router.push("/automations/new")}>
              <Plus className="w-4 h-4 mr-2" />
              Create New Automation
            </Button>
          </div>
        </div>

        {/* Automations Grid */}
        {automations.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Zap className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                No automations yet
              </h3>
              <p className="text-gray-600 mb-6">
                Get started by creating your first automation or loading pre-built templates.
              </p>
              <div className="flex gap-3 justify-center">
                <Button onClick={seedTemplates} variant="outline">
                  Load Templates
                </Button>
                <Button onClick={() => router.push("/automations/new")}>
                  Create Automation
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {automations.map((automation) => (
              <Card key={automation.id} className="relative">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg">{automation.name}</CardTitle>
                      {automation.description && (
                        <CardDescription className="mt-1">
                          {automation.description}
                        </CardDescription>
                      )}
                    </div>
                    <button
                      onClick={() => toggleAutomation(automation.id, automation.is_active)}
                      className="ml-2"
                    >
                      {automation.is_active ? (
                        <ToggleRight className="w-6 h-6 text-green-600" />
                      ) : (
                        <ToggleLeft className="w-6 h-6 text-gray-400" />
                      )}
                    </button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {/* Trigger */}
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase mb-1">
                        Trigger
                      </p>
                      <p className="text-sm text-gray-900">
                        {formatEventKey(
                          automation.automation_triggers[0]?.event_key || "N/A"
                        )}
                      </p>
                    </div>

                    {/* Conditions */}
                    {automation.automation_conditions.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase mb-1">
                          Conditions
                        </p>
                        <div className="space-y-1">
                          {automation.automation_conditions.map((condition) => (
                            <p key={condition.id} className="text-sm text-gray-700">
                              {condition.field} {condition.operator} {condition.value}
                            </p>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase mb-1">
                        Actions
                      </p>
                      <div className="space-y-1">
                        {automation.automation_actions
                          .sort((a, b) => a.action_order - b.action_order)
                          .map((action) => (
                            <p key={action.id} className="text-sm text-gray-700">
                              • {formatActionKey(action.action_key)}
                            </p>
                          ))}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 mt-4 pt-4 border-t">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => router.push(`/automations/${automation.id}/edit`)}
                    >
                      <Settings className="w-4 h-4 mr-1" />
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteAutomation(automation.id)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="w-4 h-4 mr-1" />
                      Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


























