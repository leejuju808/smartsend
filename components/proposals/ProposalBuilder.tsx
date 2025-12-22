// Block 40850 — SmartSend Roofing "AI Proposal Engine + Dynamic Estimate Builder" v1
// Proposal Builder Component (Contractor View)

"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/Badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Loader2,
  Send,
  Download,
  Eye,
  Settings,
  Plus,
  Trash2,
  Save,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

interface ProposalBuilderProps {
  jobId?: string;
  leadId?: string;
  workspaceId: string;
  onProposalGenerated?: (proposal: any) => void;
}

export function ProposalBuilder({
  jobId,
  leadId,
  workspaceId,
  onProposalGenerated,
}: ProposalBuilderProps) {
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [proposal, setProposal] = useState<any>(null);

  // Form inputs
  const [squares, setSquares] = useState<string>("");
  const [pitch, setPitch] = useState<string>("medium");
  const [material, setMaterial] = useState<string>("asphalt");
  const [insurance, setInsurance] = useState(false);
  const [addons, setAddons] = useState<Record<string, any>>({});

  const handleGenerateProposal = async () => {
    if (!squares || parseFloat(squares) <= 0) {
      toast.error("Please enter a valid number of squares");
      return;
    }

    setGenerating(true);
    try {
      const response = await fetch("/api/proposals/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: jobId,
          lead_id: leadId,
          workspace_id: workspaceId,
          squares: parseFloat(squares),
          pitch,
          material,
          insurance,
          addons,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to generate proposal");
      }

      const data = await response.json();
      setProposal(data.proposal);
      toast.success("Proposal generated successfully!");
      
      if (onProposalGenerated) {
        onProposalGenerated(data.proposal);
      }
    } catch (error: any) {
      console.error("Error generating proposal:", error);
      toast.error(error.message || "Failed to generate proposal");
    } finally {
      setGenerating(false);
    }
  };

  const handleSendProposal = async () => {
    if (!proposal?.id) {
      toast.error("No proposal to send");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/proposals/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposal_id: proposal.id }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to send proposal");
      }

      const data = await response.json();
      toast.success("Proposal sent successfully!");
      
      // Update proposal status
      setProposal({ ...proposal, status: "sent" });
    } catch (error: any) {
      console.error("Error sending proposal:", error);
      toast.error(error.message || "Failed to send proposal");
    } finally {
      setLoading(false);
    }
  };

  const toggleAddon = (addonKey: string, value?: any) => {
    setAddons((prev) => {
      const newAddons = { ...prev };
      if (newAddons[addonKey]) {
        delete newAddons[addonKey];
      } else {
        newAddons[addonKey] = value || true;
      }
      return newAddons;
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            AI Proposal Builder
          </CardTitle>
          <CardDescription>
            Enter job details and generate a professional proposal with Good/Better/Best options
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Basic Info */}
            <div className="space-y-4">
              <div>
                <Label htmlFor="squares">Roof Size (Squares)</Label>
                <Input
                  id="squares"
                  type="number"
                  value={squares}
                  onChange={(e) => setSquares(e.target.value)}
                  placeholder="e.g., 25"
                  min="1"
                />
              </div>

              <div>
                <Label htmlFor="pitch">Roof Pitch</Label>
                <Select value={pitch} onValueChange={setPitch}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="steep">Steep</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="material">Material Type</Label>
                <Select value={material} onValueChange={setMaterial}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="asphalt">Asphalt Shingles</SelectItem>
                    <SelectItem value="metal">Metal</SelectItem>
                    <SelectItem value="tile">Tile</SelectItem>
                    <SelectItem value="tpo">TPO</SelectItem>
                    <SelectItem value="epdm">EPDM</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="insurance"
                  checked={insurance}
                  onChange={(e) => setInsurance(e.target.checked)}
                  className="rounded"
                />
                <Label htmlFor="insurance">Insurance Job</Label>
              </div>
            </div>

            {/* Add-ons */}
            <div className="space-y-4">
              <Label>Add-ons</Label>
              <div className="space-y-2">
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <div className="font-medium">Ridge Vent</div>
                    <div className="text-sm text-muted-foreground">Linear feet</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {addons.ridge_vent && (
                      <Input
                        type="number"
                        value={addons.ridge_vent}
                        onChange={(e) =>
                          setAddons((prev) => ({
                            ...prev,
                            ridge_vent: parseFloat(e.target.value) || 0,
                          }))
                        }
                        className="w-20"
                        min="0"
                      />
                    )}
                    <Button
                      variant={addons.ridge_vent ? "default" : "outline"}
                      size="sm"
                      onClick={() => toggleAddon("ridge_vent", 0)}
                    >
                      {addons.ridge_vent ? "Remove" : "Add"}
                    </Button>
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <div className="font-medium">Decking Repair</div>
                    <div className="text-sm text-muted-foreground">Number of sheets</div>
                  </div>
                  <Button
                    variant={addons.decking_repair ? "default" : "outline"}
                    size="sm"
                    onClick={() => toggleAddon("decking_repair", 1)}
                  >
                    {addons.decking_repair ? "Remove" : "Add"}
                  </Button>
                </div>

                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <div className="font-medium">Chimney Flashing</div>
                  </div>
                  <Button
                    variant={addons.chimney_flashing ? "default" : "outline"}
                    size="sm"
                    onClick={() => toggleAddon("chimney_flashing")}
                  >
                    {addons.chimney_flashing ? "Remove" : "Add"}
                  </Button>
                </div>

                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <div className="font-medium">Skylight Replacement</div>
                    <div className="text-sm text-muted-foreground">Number of skylights</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {addons.skylight_replacement && (
                      <Input
                        type="number"
                        value={addons.skylight_replacement}
                        onChange={(e) =>
                          setAddons((prev) => ({
                            ...prev,
                            skylight_replacement: parseFloat(e.target.value) || 0,
                          }))
                        }
                        className="w-20"
                        min="0"
                      />
                    )}
                    <Button
                      variant={addons.skylight_replacement ? "default" : "outline"}
                      size="sm"
                      onClick={() => toggleAddon("skylight_replacement", 1)}
                    >
                      {addons.skylight_replacement ? "Remove" : "Add"}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 flex gap-2">
            <Button
              onClick={handleGenerateProposal}
              disabled={generating || !squares}
              className="flex-1"
            >
              {generating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Generate Proposal
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Generated Proposal Preview */}
      {proposal && (
        <Card>
          <CardHeader>
            <CardTitle>Generated Proposal</CardTitle>
            <CardDescription>
              Review your proposal options before sending to the homeowner
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="good" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="good">Good</TabsTrigger>
                <TabsTrigger value="better">Better</TabsTrigger>
                <TabsTrigger value="best">Best</TabsTrigger>
              </TabsList>

              <TabsContent value="good" className="mt-4">
                <ProposalOptionPreview option={proposal.good_option} tier="good" />
              </TabsContent>
              <TabsContent value="better" className="mt-4">
                <ProposalOptionPreview option={proposal.better_option} tier="better" />
              </TabsContent>
              <TabsContent value="best" className="mt-4">
                <ProposalOptionPreview option={proposal.best_option} tier="best" />
              </TabsContent>
            </Tabs>

            <div className="mt-6 flex gap-2">
              <Button
                onClick={handleSendProposal}
                disabled={loading || proposal.status === "sent"}
                className="flex-1"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Send to Homeowner
                  </>
                )}
              </Button>
              <Button variant="outline">
                <Eye className="mr-2 h-4 w-4" />
                Preview
              </Button>
              <Button variant="outline">
                <Download className="mr-2 h-4 w-4" />
                Download PDF
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ProposalOptionPreview({ option, tier }: { option: any; tier: string }) {
  if (!option) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-2xl font-bold">{option.title || `${tier} Option`}</h3>
        <Badge variant={tier === "better" ? "default" : "outline"}>
          {tier === "better" && "Most Popular"}
        </Badge>
      </div>

      <div className="text-3xl font-bold text-primary">
        ${option.price?.toLocaleString() || "0"}
      </div>

      {option.description && (
        <div className="prose max-w-none">
          <p className="text-muted-foreground whitespace-pre-wrap">{option.description}</p>
        </div>
      )}

      {option.materials && (
        <div>
          <h4 className="font-semibold mb-2">Materials:</h4>
          <p className="text-sm text-muted-foreground">{option.materials}</p>
        </div>
      )}

      {option.warranty && (
        <div>
          <h4 className="font-semibold mb-2">Warranty:</h4>
          <p className="text-sm text-muted-foreground">{option.warranty}</p>
        </div>
      )}
    </div>
  );
}
































