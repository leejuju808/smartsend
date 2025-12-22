"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Plus, 
  Trophy, 
  TrendingUp, 
  BarChart3, 
  X,
  CheckCircle2,
  AlertCircle
} from "lucide-react";
import { ABVariantEditor } from "./ABVariantEditor";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface VariantPerformance {
  variant_id: string;
  campaign_id: string;
  variant_label: string;
  subject: string;
  sends: number;
  opens: number;
  replies: number;
  booked_estimates: number;
  closed_jobs: number;
  open_rate_pct: number;
  reply_rate_pct: number;
  booked_rate_pct: number;
  close_rate_pct: number;
  is_winner: boolean;
  created_at: string;
  updated_at: string;
}

interface WinnerInfo {
  id: string;
  campaign_id: string;
  winning_variant: string;
  reason: string;
  created_at: string;
}

interface ABTestDashboardProps {
  campaignId: string;
}

export function ABTestDashboard({ campaignId }: ABTestDashboardProps) {
  const [variants, setVariants] = useState<VariantPerformance[]>([]);
  const [winner, setWinner] = useState<WinnerInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [showEditor, setShowEditor] = useState(false);
  const [editingVariant, setEditingVariant] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const [variantsRes, winnerRes] = await Promise.all([
        fetch(`/api/campaigns/${campaignId}/ab-test/variants`),
        fetch(`/api/campaigns/${campaignId}/ab-test/winner`)
      ]);

      if (variantsRes.ok) {
        const variantsData = await variantsRes.json();
        setVariants(variantsData);
      }

      if (winnerRes.ok) {
        const winnerData = await winnerRes.json();
        setWinner(winnerData);
      }
    } catch (error) {
      console.error("Failed to load A/B test data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // Refresh every 30 seconds
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [campaignId]);

  const handleCreateVariant = () => {
    setEditingVariant(null);
    setShowEditor(true);
  };

  const handleEditVariant = (variantId: string) => {
    setEditingVariant(variantId);
    setShowEditor(true);
  };

  const handleEditorClose = () => {
    setShowEditor(false);
    setEditingVariant(null);
    loadData();
  };

  const handleSelectWinner = async (variantId: string) => {
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/ab-test/select-winner`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variant_id: variantId }),
      });
      if (res.ok) {
        loadData();
      }
    } catch (error) {
      console.error("Failed to select winner:", error);
    }
  };

  const handleKillVariant = async (variantId: string) => {
    if (!confirm("Are you sure you want to stop using this variant? This cannot be undone.")) {
      return;
    }
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/ab-test/variants/${variantId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        loadData();
      }
    } catch (error) {
      console.error("Failed to kill variant:", error);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-sm text-muted-foreground">Loading A/B test data...</div>
        </CardContent>
      </Card>
    );
  }

  const totalSends = variants.reduce((sum, v) => sum + v.sends, 0);
  const hasVariants = variants.length > 0;

  return (
    <>
      <Card className="border-2">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5" />
                A/B Testing Engine
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Test email versions automatically. SmartSend finds the winner and deploys it.
              </p>
            </div>
            <Button onClick={handleCreateVariant} size="sm">
              <Plus className="w-4 h-4 mr-2" />
              Create Variant
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {winner && (
            <div className="mb-6 p-4 rounded-lg bg-green-50 border border-green-200">
              <div className="flex items-start gap-3">
                <Trophy className="w-5 h-5 text-green-600 mt-0.5" />
                <div className="flex-1">
                  <div className="font-semibold text-green-900 mb-1">
                    Winner Selected: Variant {variants.find(v => v.variant_id === winner.winning_variant)?.variant_label || "?"}
                  </div>
                  <div className="text-sm text-green-700">{winner.reason}</div>
                  <div className="text-xs text-green-600 mt-1">
                    Selected on {new Date(winner.created_at).toLocaleDateString()}
                  </div>
                </div>
              </div>
            </div>
          )}

          {!hasVariants ? (
            <div className="text-center py-12">
              <BarChart3 className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No A/B Test Variants Yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Create variants to test different subject lines, intros, CTAs, and tones.
              </p>
              <Button onClick={handleCreateVariant}>
                <Plus className="w-4 h-4 mr-2" />
                Create Your First Variant
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                Total sends: {totalSends} | Testing {variants.length} variant{variants.length !== 1 ? "s" : ""}
              </div>

              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Variant</TableHead>
                      <TableHead className="text-right">Sends</TableHead>
                      <TableHead className="text-right">Opens</TableHead>
                      <TableHead className="text-right">Replies</TableHead>
                      <TableHead className="text-right">Booked</TableHead>
                      <TableHead className="text-right">Closed</TableHead>
                      <TableHead className="text-right">Conversion %</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {variants.map((variant) => (
                      <TableRow 
                        key={variant.variant_id}
                        className={variant.is_winner ? "bg-green-50" : ""}
                      >
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Badge variant={variant.is_winner ? "default" : "outline"}>
                              {variant.variant_label}
                            </Badge>
                            {variant.is_winner && (
                              <Trophy className="w-4 h-4 text-green-600" />
                            )}
                            <div className="text-xs text-muted-foreground max-w-xs truncate">
                              {variant.subject}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {variant.sends}
                        </TableCell>
                        <TableCell className="text-right">
                          {variant.opens} ({variant.open_rate_pct}%)
                        </TableCell>
                        <TableCell className="text-right">
                          {variant.replies} ({variant.reply_rate_pct}%)
                        </TableCell>
                        <TableCell className="text-right">
                          {variant.booked_estimates} ({variant.booked_rate_pct}%)
                        </TableCell>
                        <TableCell className="text-right">
                          {variant.closed_jobs} ({variant.close_rate_pct}%)
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {variant.close_rate_pct > 0 && (
                              <TrendingUp className="w-3 h-3 text-green-600" />
                            )}
                            <span className="font-semibold">
                              {variant.close_rate_pct > 0 
                                ? variant.close_rate_pct.toFixed(1) 
                                : variant.booked_rate_pct > 0
                                ? variant.booked_rate_pct.toFixed(1)
                                : variant.reply_rate_pct.toFixed(1)
                              }%
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditVariant(variant.variant_id)}
                            >
                              Edit
                            </Button>
                            {!variant.is_winner && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleSelectWinner(variant.variant_id)}
                                >
                                  <CheckCircle2 className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleKillVariant(variant.variant_id)}
                                >
                                  <X className="w-4 h-4 text-red-600" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {variants.length > 0 && totalSends < 50 && (
                <div className="p-4 rounded-lg bg-yellow-50 border border-yellow-200 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
                  <div className="flex-1">
                    <div className="font-semibold text-yellow-900 mb-1">
                      Need More Data
                    </div>
                    <div className="text-sm text-yellow-700">
                      SmartSend needs at least 50 sends per variant to determine a winner. 
                      Currently at {totalSends} total sends.
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {showEditor && (
        <ABVariantEditor
          campaignId={campaignId}
          variantId={editingVariant}
          onClose={handleEditorClose}
        />
      )}
    </>
  );
}



























