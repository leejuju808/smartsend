"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/src/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronDown, ChevronUp, Play, Sparkles } from "lucide-react";

interface MailboxOverride {
  mailbox_id: string;
  health_score?: number;
  bounce_rate_7d?: number;
  user_cap?: number;
  warmup_override?: number[];
}

interface SimulationResult {
  mailbox_id: string;
  email: string;
  warmup_limit: number;
  user_cap: number;
  health_score: number;
  bounce_rate_7d: number;
  simulated_safe_limit: number;
  risk: "Low" | "Medium" | "High";
}

interface SimulationResponse {
  date: string;
  total_simulated_sends: number;
  mailboxes: SimulationResult[];
  overall_risk: "Low" | "Medium" | "High";
}

interface Mailbox {
  id: string;
  email: string;
  warmup_started_at: string | null;
  daily_cap: number;
  health_score: number;
}

export default function SendPlanSimulator() {
  const [date, setDate] = useState(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split("T")[0];
  });

  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [selectedMailboxes, setSelectedMailboxes] = useState<Set<string>>(new Set());
  const [overrides, setOverrides] = useState<Map<string, MailboxOverride>>(new Map());
  const [expandedMailboxes, setExpandedMailboxes] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<SimulationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [virtualMailboxes, setVirtualMailboxes] = useState<Array<{ id: string; email: string }>>([]);

  // Load mailboxes on mount
  useEffect(() => {
    fetch("/api/mailboxes/list")
      .then((r) => r.json())
      .then((data) => {
        const mbList = (data.mailboxes || []).map((m: any) => ({
          id: m.id,
          email: m.from_email || m.email || "",
          warmup_started_at: m.warmup_started_at || null,
          daily_cap: m.daily_cap || 200,
          health_score: m.health_score || 100,
        }));
        setMailboxes(mbList);
        setSelectedMailboxes(new Set(mbList.map((m: Mailbox) => m.id)));
      })
      .catch((err) => console.error("Failed to fetch mailboxes:", err));
  }, []);

  const toggleMailbox = (id: string) => {
    const newSet = new Set(selectedMailboxes);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedMailboxes(newSet);
  };

  const toggleExpanded = (id: string) => {
    const newSet = new Set(expandedMailboxes);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setExpandedMailboxes(newSet);
  };

  const updateOverride = (mailboxId: string, field: keyof MailboxOverride, value: any) => {
    const newOverrides = new Map(overrides);
    const existing = newOverrides.get(mailboxId) || { mailbox_id: mailboxId };
    newOverrides.set(mailboxId, { ...existing, [field]: value });
    setOverrides(newOverrides);
  };

  const runSimulation = async () => {
    setLoading(true);
    try {
      // Include overrides for selected mailboxes, plus virtual mailboxes
      const mailboxes_overrides = Array.from(overrides.values()).filter((o) =>
        selectedMailboxes.has(o.mailbox_id)
      );

      // Add virtual mailboxes to overrides if they're selected
      virtualMailboxes.forEach((vm) => {
        if (selectedMailboxes.has(vm.id)) {
          const existing = mailboxes_overrides.find((o) => o.mailbox_id === vm.id);
          if (!existing) {
            mailboxes_overrides.push({
              mailbox_id: vm.id,
              health_score: 90,
              bounce_rate_7d: 0,
              user_cap: 50,
            });
          }
        }
      });

      const response = await fetch("/api/send-plan/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          mailboxes_overrides,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Simulation failed");
      }

      const data: SimulationResponse = await response.json();
      
      // Map virtual mailbox emails back
      const mappedResults = {
        ...data,
        mailboxes: data.mailboxes.map((mb) => {
          const virtual = virtualMailboxes.find((vm) => vm.id === mb.mailbox_id);
          return virtual ? { ...mb, email: virtual.email } : mb;
        }),
      };
      
      setResults(mappedResults);
    } catch (error: any) {
      console.error("Simulation error:", error);
      alert(`Failed to run simulation: ${error.message || "Please try again."}`);
    } finally {
      setLoading(false);
    }
  };

  // What-if scenarios
  const applyScenario = (scenario: string) => {
    const newOverrides = new Map(overrides);
    const allMailboxIds = Array.from(selectedMailboxes);

    switch (scenario) {
      case "add_mailboxes": {
        const newVirtual = {
          id: `virtual-${Date.now()}`,
          email: `new-inbox-${virtualMailboxes.length + 1}@domain.com`,
        };
        setVirtualMailboxes([...virtualMailboxes, newVirtual]);
        setSelectedMailboxes(new Set([...selectedMailboxes, newVirtual.id]));
        // Set default values for virtual mailbox
        newOverrides.set(newVirtual.id, {
          mailbox_id: newVirtual.id,
          health_score: 90,
          bounce_rate_7d: 0,
          user_cap: 50,
        });
        break;
      }
      case "double_bounce": {
        allMailboxIds.forEach((id) => {
          const mb = mailboxes.find((m) => m.id === id);
          if (mb) {
            const existing = newOverrides.get(id) || { mailbox_id: id };
            const currentBounce = existing.bounce_rate_7d ?? (results?.mailboxes.find((r) => r.mailbox_id === id)?.bounce_rate_7d ?? 0);
            newOverrides.set(id, { ...existing, bounce_rate_7d: currentBounce * 2 });
          }
        });
        break;
      }
      case "lower_caps": {
        allMailboxIds.forEach((id) => {
          const mb = mailboxes.find((m) => m.id === id);
          if (mb) {
            const existing = newOverrides.get(id) || { mailbox_id: id };
            const currentCap = existing.user_cap ?? mb.daily_cap;
            newOverrides.set(id, { ...existing, user_cap: Math.floor(currentCap * 0.7) });
          }
        });
        break;
      }
    }

    setOverrides(newOverrides);
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case "Low":
        return "bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/50";
      case "Medium":
        return "bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border-yellow-500/50";
      case "High":
        return "bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/50";
      default:
        return "";
    }
  };

  const allMailboxesWithVirtual = [...mailboxes, ...virtualMailboxes];

  return (
    <div className="container mx-auto p-6 max-w-7xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Daily Send Plan Simulator</h1>
          <p className="text-muted-foreground mt-1">
            Simulate tomorrow's send volume and test "what if" scenarios
          </p>
        </div>
        <Button onClick={runSimulation} disabled={loading} className="gap-2">
          <Play className="w-4 h-4" />
          {loading ? "Running..." : "Run Simulation"}
        </Button>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Inputs Panel */}
        <Card>
          <CardHeader>
            <CardTitle>Simulation Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Date Picker */}
            <div className="space-y-2">
              <Label>Target Date</Label>
              <div className="flex gap-2">
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const tomorrow = new Date();
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    setDate(tomorrow.toISOString().split("T")[0]);
                  }}
                >
                  Tomorrow
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const in7Days = new Date();
                    in7Days.setDate(in7Days.getDate() + 7);
                    setDate(in7Days.toISOString().split("T")[0]);
                  }}
                >
                  In 7 Days
                </Button>
              </div>
            </div>

            {/* What If Scenarios */}
            <div className="space-y-2">
              <Label>Quick Scenarios</Label>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => applyScenario("add_mailboxes")}
                  className="gap-1"
                >
                  <Sparkles className="w-3 h-3" />
                  Add Mailbox
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => applyScenario("double_bounce")}
                >
                  Double Bounce Rate
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => applyScenario("lower_caps")}
                >
                  Lower Caps 30%
                </Button>
              </div>
            </div>

            {/* Mailbox Selection */}
            <div className="space-y-2">
              <Label>Mailboxes</Label>
              <div className="space-y-2 max-h-[400px] overflow-y-auto border rounded p-2">
                {allMailboxesWithVirtual.map((mb) => {
                  const isSelected = selectedMailboxes.has(mb.id);
                  const isExpanded = expandedMailboxes.has(mb.id);
                  const override = overrides.get(mb.id);
                  const mbData = "daily_cap" in mb ? mb : null;

                  return (
                    <div key={mb.id} className="border rounded p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleMailbox(mb.id)}
                        />
                        <span className="flex-1 font-medium">{mb.email}</span>
                        {mbData && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleExpanded(mb.id)}
                          >
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                          </Button>
                        )}
                      </div>

                      {isExpanded && (
                        <div className="pl-6 space-y-3 pt-2 border-t">
                          <div>
                            <Label className="text-xs">Health Score</Label>
                            <div className="flex items-center gap-2">
                              <Slider
                                value={[override?.health_score ?? (mbData?.health_score ?? 100)]}
                                onValueChange={([v]) =>
                                  updateOverride(mb.id, "health_score", v)
                                }
                                min={0}
                                max={100}
                                step={1}
                                className="flex-1"
                              />
                              <span className="text-sm w-12 text-right">
                                {override?.health_score ?? (mbData?.health_score ?? 100)}
                              </span>
                            </div>
                          </div>

                          <div>
                            <Label className="text-xs">7-Day Bounce Rate (%)</Label>
                            <Input
                              type="number"
                              min="0"
                              max="100"
                              step="0.1"
                              value={
                                override?.bounce_rate_7d !== undefined
                                  ? override.bounce_rate_7d
                                  : ""
                              }
                              onChange={(e) =>
                                updateOverride(
                                  mb.id,
                                  "bounce_rate_7d",
                                  e.target.value ? parseFloat(e.target.value) : undefined
                                )
                              }
                              placeholder="Auto"
                            />
                          </div>

                          <div>
                            <Label className="text-xs">User Cap Override</Label>
                            <Input
                              type="number"
                              min="0"
                              value={
                                override?.user_cap !== undefined
                                  ? override.user_cap
                                  : (mbData?.daily_cap ?? 200)
                              }
                              onChange={(e) =>
                                updateOverride(
                                  mb.id,
                                  "user_cap",
                                  e.target.value ? parseInt(e.target.value) : undefined
                                )
                              }
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Results Panel */}
        <Card>
          <CardHeader>
            <CardTitle>Simulation Results</CardTitle>
          </CardHeader>
          <CardContent>
            {results ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                  <div>
                    <div className="text-sm text-muted-foreground">Total Simulated Volume</div>
                    <div className="text-2xl font-bold">{results.total_simulated_sends} emails</div>
                  </div>
                  <Badge className={getRiskColor(results.overall_risk)}>
                    {results.overall_risk} Risk
                  </Badge>
                </div>

                <div className="border rounded overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted">
                      <tr>
                        <th className="text-left p-2 font-medium">Mailbox</th>
                        <th className="text-right p-2 font-medium">Warmup</th>
                        <th className="text-right p-2 font-medium">User Cap</th>
                        <th className="text-right p-2 font-medium">Health</th>
                        <th className="text-right p-2 font-medium">Bounces</th>
                        <th className="text-right p-2 font-medium">Safe Limit</th>
                        <th className="text-center p-2 font-medium">Risk</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.mailboxes.map((mb) => (
                        <tr key={mb.mailbox_id} className="border-t">
                          <td className="p-2">{mb.email}</td>
                          <td className="p-2 text-right">{mb.warmup_limit}</td>
                          <td className="p-2 text-right">{mb.user_cap}</td>
                          <td className="p-2 text-right">{mb.health_score}</td>
                          <td className="p-2 text-right">
                            {mb.bounce_rate_7d.toFixed(1)}%
                          </td>
                          <td className="p-2 text-right font-medium">
                            {mb.simulated_safe_limit}
                          </td>
                          <td className="p-2 text-center">
                            <Badge className={getRiskColor(mb.risk)}>{mb.risk}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                Click "Run Simulation" to see results
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

