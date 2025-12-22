// Block 20710 — Scope Panel (from Block 20380)
// Block 21020 — Enhanced with v2 Scope Analysis

"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/badge";
import { Ruler, AlertTriangle, CheckCircle2, DollarSign, TrendingUp, FileText } from "lucide-react";

interface ScopePanelProps {
  data: {
    squares: number | null;
    material: string | null;
    pitch: string | null;
    isSteep: boolean;
    stories: number | null;
    wastePercent: number | null;
    keyLineItems: any[];
    missingItems: any[];
    codeItemsIncluded: any[];
    // Block 21020 — v2 Scope Analysis
    scopeAnalysisV2?: {
      insuranceRcv: number;
      smartsendEstimateTotal: number;
      rcvDifference: number;
      underpaymentAmount: number;
      totalSupplementOpportunity: number;
      missingLineItems: any[];
      underpricedLineItems: any[];
      quantityMismatches: any[];
      oAndP: {
        included: boolean;
        shouldBeIncluded: boolean;
        missingValue: number;
        justification: string;
      };
      codeItemsMissing: any[];
      codeConflictsDetected: boolean;
      supplementBreakdown: Record<string, number>;
      supplementTypes: string[];
    } | null;
    supplementOpportunityTotal?: number;
    rcvUnderpayment?: number;
    oAndPMissing?: boolean;
    oAndPMissingValue?: number;
    codeConflictsDetected?: boolean;
  };
}

export function ScopePanel({ data }: ScopePanelProps) {
  const formatMaterial = (material: string | null) => {
    if (!material) return "Unknown";
    const materialMap: Record<string, string> = {
      asphalt: "Arch Shingle",
      architectural: "Arch Shingle",
      dimensional: "Arch Shingle",
      metal: "Metal",
      tile: "Tile",
      wood: "Wood",
      flat: "Flat",
    };
    return materialMap[material.toLowerCase()] || material;
  };

  if (!data.squares && !data.material) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Ruler className="h-5 w-5" />
            Roof Scope
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No scope information available</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Ruler className="h-5 w-5" />
          Roof Scope
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Main Scope Info */}
        <div className="flex items-center gap-2 flex-wrap">
          {data.squares && (
            <span className="text-lg font-bold">{data.squares} SQ</span>
          )}
          {data.material && (
            <>
              <span>·</span>
              <span className="font-medium">{formatMaterial(data.material)}</span>
            </>
          )}
          {data.isSteep && (
            <>
              <span>·</span>
              <Badge variant="outline">Steep</Badge>
            </>
          )}
          {data.stories && (
            <>
              <span>·</span>
              <span>{data.stories}-Story</span>
            </>
          )}
        </div>

        {/* Waste Percentage */}
        {data.wastePercent && (
          <div className="text-sm text-muted-foreground">
            Waste: {data.wastePercent}%
          </div>
        )}

        {/* Key Line Items */}
        {data.keyLineItems && data.keyLineItems.length > 0 && (
          <div className="pt-2 border-t">
            <div className="text-sm font-medium mb-2">Key Line Items:</div>
            <div className="space-y-1">
              {data.keyLineItems.slice(0, 5).map((item: any, idx: number) => (
                <div key={idx} className="text-sm flex items-center gap-2">
                  <CheckCircle2 className="h-3 w-3 text-green-600" />
                  <span>{typeof item === "string" ? item : item.name || item.description}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Missing Items (Supplement Opportunities) */}
        {data.missingItems && data.missingItems.length > 0 && (
          <div className="pt-2 border-t">
            <div className="text-sm font-medium mb-2 text-orange-700 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Missing Items (Supplement Opportunities):
            </div>
            <div className="space-y-1">
              {data.missingItems.map((item: any, idx: number) => (
                <div key={idx} className="text-sm text-orange-700">
                  • {typeof item === "string" ? item : item.name || item.description}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Code Items Included */}
        {data.codeItemsIncluded && data.codeItemsIncluded.length > 0 && (
          <div className="pt-2 border-t">
            <div className="text-sm font-medium mb-2 text-green-700">Code Items Included:</div>
            <div className="space-y-1">
              {data.codeItemsIncluded.map((item: any, idx: number) => (
                <div key={idx} className="text-sm text-green-700 flex items-center gap-2">
                  <CheckCircle2 className="h-3 w-3" />
                  <span>{typeof item === "string" ? item : item.name || item.description}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Block 21020 — v2 Scope Analysis */}
        {data.scopeAnalysisV2 && (
          <div className="pt-4 border-t-2 border-blue-200">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="h-5 w-5 text-blue-600" />
              <CardTitle className="text-base">Scope Analysis v2</CardTitle>
            </div>

            {/* RCV Comparison */}
            <div className="space-y-2 mb-4">
              <div className="flex items-center justify-between p-2 bg-blue-50 rounded">
                <span className="text-sm font-medium">Insurance RCV:</span>
                <span className="text-sm font-bold">${(data.scopeAnalysisV2.insuranceRcv || 0).toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between p-2 bg-green-50 rounded">
                <span className="text-sm font-medium">SmartSend Estimate:</span>
                <span className="text-sm font-bold text-green-700">${(data.scopeAnalysisV2.smartsendEstimateTotal || 0).toLocaleString()}</span>
              </div>
              {data.scopeAnalysisV2.underpaymentAmount > 0 && (
                <div className="flex items-center justify-between p-2 bg-orange-50 rounded border border-orange-200">
                  <span className="text-sm font-medium text-orange-700">RCV Underpayment:</span>
                  <span className="text-sm font-bold text-orange-700">${data.scopeAnalysisV2.underpaymentAmount.toLocaleString()}</span>
                </div>
              )}
            </div>

            {/* Supplement Opportunity */}
            {data.scopeAnalysisV2.totalSupplementOpportunity > 0 && (
              <div className="mb-4 p-3 bg-gradient-to-r from-orange-50 to-yellow-50 rounded-lg border border-orange-200">
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign className="h-4 w-4 text-orange-600" />
                  <span className="text-sm font-bold text-orange-700">Total Supplement Opportunity:</span>
                </div>
                <div className="text-2xl font-bold text-orange-700">
                  +${data.scopeAnalysisV2.totalSupplementOpportunity.toLocaleString()}
                </div>
                {Object.keys(data.scopeAnalysisV2.supplementBreakdown || {}).length > 0 && (
                  <div className="mt-2 space-y-1">
                    {Object.entries(data.scopeAnalysisV2.supplementBreakdown).map(([key, value]) => (
                      value > 0 && (
                        <div key={key} className="text-xs flex justify-between">
                          <span className="text-muted-foreground">{key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}:</span>
                          <span className="font-medium">+${value.toLocaleString()}</span>
                        </div>
                      )
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Missing Line Items */}
            {data.scopeAnalysisV2.missingLineItems && data.scopeAnalysisV2.missingLineItems.length > 0 && (
              <div className="mb-3">
                <div className="text-sm font-medium mb-2 text-orange-700 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Missing Items:
                </div>
                <div className="space-y-1">
                  {data.scopeAnalysisV2.missingLineItems.slice(0, 5).map((item: any, idx: number) => (
                    <div key={idx} className="text-sm text-orange-700 flex items-center justify-between">
                      <span>• {item.description || item.category}</span>
                      {item.estimated_value && (
                        <span className="font-medium">+${item.estimated_value.toLocaleString()}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Underpriced Items */}
            {data.scopeAnalysisV2.underpricedLineItems && data.scopeAnalysisV2.underpricedLineItems.length > 0 && (
              <div className="mb-3">
                <div className="text-sm font-medium mb-2 text-orange-700">Underpriced Items:</div>
                <div className="space-y-1">
                  {data.scopeAnalysisV2.underpricedLineItems.slice(0, 3).map((item: any, idx: number) => (
                    <div key={idx} className="text-sm text-orange-700 flex items-center justify-between">
                      <span>• {item.description || item.category}</span>
                      {item.total_difference && (
                        <span className="font-medium">+${item.total_difference.toLocaleString()}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Quantity Mismatches */}
            {data.scopeAnalysisV2.quantityMismatches && data.scopeAnalysisV2.quantityMismatches.length > 0 && (
              <div className="mb-3">
                <div className="text-sm font-medium mb-2 text-orange-700">Quantity Mismatches:</div>
                <div className="space-y-1">
                  {data.scopeAnalysisV2.quantityMismatches.slice(0, 3).map((item: any, idx: number) => (
                    <div key={idx} className="text-sm text-orange-700">
                      • {item.category}: Insurance {item.insurance_qty}{item.unit} vs SmartSend {item.smartsend_qty}{item.unit}
                      {item.estimated_value && (
                        <span className="ml-2 font-medium">(+${item.estimated_value.toLocaleString()})</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* O&P Analysis */}
            {data.scopeAnalysisV2.oAndP && !data.scopeAnalysisV2.oAndP.included && data.scopeAnalysisV2.oAndP.shouldBeIncluded && (
              <div className="mb-3 p-2 bg-purple-50 rounded border border-purple-200">
                <div className="text-sm font-medium mb-1 text-purple-700">O&P Missing:</div>
                <div className="text-sm text-purple-700 mb-1">
                  Recommended Supplement: <span className="font-bold">+${data.scopeAnalysisV2.oAndP.missingValue.toLocaleString()}</span>
                </div>
                {data.scopeAnalysisV2.oAndP.justification && (
                  <div className="text-xs text-muted-foreground mt-1">
                    {data.scopeAnalysisV2.oAndP.justification}
                  </div>
                )}
              </div>
            )}

            {/* Code Conflicts */}
            {data.scopeAnalysisV2.codeConflictsDetected && data.scopeAnalysisV2.codeItemsMissing && data.scopeAnalysisV2.codeItemsMissing.length > 0 && (
              <div className="mb-3 p-2 bg-red-50 rounded border border-red-200">
                <div className="text-sm font-medium mb-1 text-red-700 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Code Conflicts Detected:
                </div>
                <div className="space-y-1">
                  {data.scopeAnalysisV2.codeItemsMissing.slice(0, 3).map((item: any, idx: number) => (
                    <div key={idx} className="text-xs text-red-700">
                      • {item.description || item.item} ({item.code_reference})
                      {item.estimated_value && (
                        <span className="ml-2 font-medium">+${item.estimated_value.toLocaleString()}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Supplement Types */}
            {data.scopeAnalysisV2.supplementTypes && data.scopeAnalysisV2.supplementTypes.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {data.scopeAnalysisV2.supplementTypes.map((type: string, idx: number) => (
                  <Badge key={idx} variant="outline" className="text-xs">
                    {type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Fallback: Show quick stats if v2 analysis not available but thread has v2 data */}
        {!data.scopeAnalysisV2 && (data.supplementOpportunityTotal > 0 || data.rcvUnderpayment > 0) && (
          <div className="pt-4 border-t">
            <div className="text-sm font-medium mb-2 text-blue-700">Supplement Opportunities:</div>
            {data.rcvUnderpayment > 0 && (
              <div className="text-sm text-orange-700 mb-1">
                RCV Underpayment: <span className="font-bold">${data.rcvUnderpayment.toLocaleString()}</span>
              </div>
            )}
            {data.supplementOpportunityTotal > 0 && (
              <div className="text-sm text-orange-700 mb-1">
                Total Supplement: <span className="font-bold">+${data.supplementOpportunityTotal.toLocaleString()}</span>
              </div>
            )}
            {data.oAndPMissing && data.oAndPMissingValue > 0 && (
              <div className="text-sm text-purple-700">
                O&P Missing: <span className="font-bold">+${data.oAndPMissingValue.toLocaleString()}</span>
              </div>
            )}
            {data.codeConflictsDetected && (
              <div className="text-sm text-red-700 mt-1">
                <AlertTriangle className="h-3 w-3 inline mr-1" />
                Code conflicts detected
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

