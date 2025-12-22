"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import {
  Send,
  FileText,
  CheckCircle2,
  Loader2,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  Package,
  Users,
  AlertTriangle,
  Shield,
  Star,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";

interface EstimateLineItem {
  id: string;
  line_number: number;
  description: string;
  category: string;
  quantity: number;
  unit: string;
  unit_cost: number;
  labor_cost: number;
  material_cost: number;
  total_cost: number;
  notes?: string;
}

interface MaterialQuantity {
  id: string;
  material_type: string;
  quantity_min?: number;
  quantity_max?: number;
  quantity_avg?: number;
  unit: string;
  waste_factor_percent?: number;
  quantity_with_waste?: number;
  is_code_required?: boolean;
}

interface Upsell {
  id: string;
  upsell_type: string;
  title: string;
  description?: string;
  cost_min: number;
  cost_max: number;
  cost_avg: number;
  is_recommended: boolean;
  ai_reasoning?: string;
  priority: number;
}

interface MaterialBrand {
  id: string;
  brand_name: string;
  brand_category: string;
  product_line?: string;
  warranty_years?: number;
  price_per_square_min: number;
  price_per_square_max: number;
  pros?: string[];
  cons?: string[];
  best_for?: string;
  is_recommended: boolean;
}

interface Estimate {
  id: string;
  thread_id: string;
  status: string;
  estimated_total_min: number;
  estimated_total_max: number;
  estimated_total_avg: number;
  price_range_text: string;
  job_type: string;
  job_subcategory?: string;
  severity_level?: string;
  roof_squares_avg?: number;
  material_type?: string;
  pitch_category?: string;
  complexity_rating?: string;
  ai_reasoning?: string;
  pdf_url?: string;
  estimate_line_items?: EstimateLineItem[];
  // Block 20020 fields
  material_quantities?: MaterialQuantity[]; // JSONB field (legacy)
  estimate_material_quantities?: MaterialQuantity[]; // Related table (preferred)
  waste_factor_percent?: number;
  waste_factor_category?: string;
  estimated_crew_size?: number;
  estimated_labor_hours_min?: number;
  estimated_labor_hours_max?: number;
  estimated_job_duration_days_min?: number;
  estimated_job_duration_days_max?: number;
  permit_required?: boolean;
  permit_reason?: string;
  permit_cost_estimate?: number;
  insurance_code_items?: any[];
  recommended_brands?: MaterialBrand[]; // JSONB field (legacy)
  estimate_material_brands?: MaterialBrand[]; // Related table (preferred)
  upsell_options?: Upsell[]; // JSONB field (legacy)
  estimate_upsells?: Upsell[]; // Related table (preferred)
  customer_summary?: string;
  sms_estimate_text?: string;
}

interface EstimateDisplayProps {
  threadId: string;
  estimate?: Estimate;
  onEstimateUpdated?: () => void;
}

export function EstimateDisplay({
  threadId,
  estimate: initialEstimate,
  onEstimateUpdated,
}: EstimateDisplayProps) {
  const [estimate, setEstimate] = useState<Estimate | null>(initialEstimate || null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [showSMS, setShowSMS] = useState(false);

  useEffect(() => {
    if (!initialEstimate && threadId) {
      loadEstimate();
    }
  }, [threadId, initialEstimate]);

  const loadEstimate = async () => {
    try {
      const response = await fetch(
        `/api/inbox/estimates?threadId=${threadId}`
      );
      if (response.ok) {
        const data = await response.json();
        if (data.estimate) {
          setEstimate(data.estimate);
        }
      }
    } catch (error) {
      console.error("Error loading estimate:", error);
    }
  };

  const handleSendEstimate = async () => {
    if (!estimate) return;

    setSending(true);
    try {
      const response = await fetch(
        `/api/inbox/estimates/${estimate.id}/send`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ channel: "email" }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to send estimate");
      }

      toast.success("Estimate sent to homeowner!");
      await loadEstimate();
      if (onEstimateUpdated) {
        onEstimateUpdated();
      }
    } catch (error: any) {
      console.error("Error sending estimate:", error);
      toast.error(error.message || "Failed to send estimate");
    } finally {
      setSending(false);
    }
  };

  const handleGeneratePDF = async () => {
    if (!estimate) return;

    setLoading(true);
    try {
      const response = await fetch(
        `/api/inbox/estimates/${estimate.id}/pdf`,
        {
          method: "POST",
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to generate PDF");
      }

      const data = await response.json();
      toast.success("PDF generated!");
      
      // Open PDF in new window
      if (data.pdf_url) {
        window.open(data.pdf_url, "_blank");
      }
      
      await loadEstimate();
    } catch (error: any) {
      console.error("Error generating PDF:", error);
      toast.error(error.message || "Failed to generate PDF");
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!estimate) return;

    setLoading(true);
    try {
      const response = await fetch(
        `/api/inbox/estimates/${estimate.id}/approve`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ pipelineStage: "pending_decision" }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to approve estimate");
      }

      toast.success("Estimate approved!");
      await loadEstimate();
      if (onEstimateUpdated) {
        onEstimateUpdated();
      }
    } catch (error: any) {
      console.error("Error approving estimate:", error);
      toast.error(error.message || "Failed to approve estimate");
    } finally {
      setLoading(false);
    }
  };

  const handleGetSMS = async () => {
    if (!estimate) return;

    setLoading(true);
    try {
      const response = await fetch(
        `/api/inbox/estimates/${estimate.id}/sms`
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to get SMS estimate");
      }

      const data = await response.json();
      setShowSMS(true);
      // Copy to clipboard
      navigator.clipboard.writeText(data.sms_text);
      toast.success("SMS estimate copied to clipboard!");
    } catch (error: any) {
      console.error("Error getting SMS estimate:", error);
      toast.error(error.message || "Failed to get SMS estimate");
    } finally {
      setLoading(false);
    }
  };

  if (!estimate) {
    return null;
  }

  const lineItems = estimate.estimate_line_items || [];
  const priceRange =
    estimate.price_range_text ||
    `$${estimate.estimated_total_min?.toFixed(0)} - $${estimate.estimated_total_max?.toFixed(0)}`;

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold">
            AI-Generated Estimate
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge
              variant={
                estimate.status === "approved"
                  ? "default"
                  : estimate.status === "sent"
                  ? "secondary"
                  : "outline"
              }
            >
              {estimate.status}
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-4">
          {/* Price Range */}
          <div className="text-center p-4 bg-blue-50 rounded-lg border border-blue-200">
            <div className="text-sm text-gray-600 mb-1">Estimated Total</div>
            <div className="text-3xl font-bold text-blue-600">{priceRange}</div>
          </div>

          {/* Job Details */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-600">Job Type:</span>{" "}
              <span className="font-medium">
                {estimate.job_type?.replace("_", " ") || "Unknown"}
              </span>
            </div>
            {estimate.roof_squares_avg && (
              <div>
                <span className="text-gray-600">Roof Size:</span>{" "}
                <span className="font-medium">
                  {estimate.roof_squares_avg.toFixed(1)} squares
                </span>
              </div>
            )}
            {estimate.material_type && (
              <div>
                <span className="text-gray-600">Material:</span>{" "}
                <span className="font-medium capitalize">
                  {estimate.material_type}
                </span>
              </div>
            )}
            {estimate.complexity_rating && (
              <div>
                <span className="text-gray-600">Complexity:</span>{" "}
                <span className="font-medium capitalize">
                  {estimate.complexity_rating}
                </span>
              </div>
            )}
          </div>

          {/* AI Reasoning */}
          {estimate.ai_reasoning && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="text-sm font-medium text-yellow-900 mb-1">
                AI Analysis:
              </div>
              <div className="text-sm text-yellow-800">
                {estimate.ai_reasoning}
              </div>
            </div>
          )}

          {/* Customer Summary (Block 20020) */}
          {estimate.customer_summary && (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="text-sm font-medium text-blue-900 mb-2">
                Estimate Summary
              </div>
              <div className="text-sm text-blue-800">
                {estimate.customer_summary}
              </div>
            </div>
          )}

          {/* Material Quantities (Block 20020) */}
          {((estimate.estimate_material_quantities && estimate.estimate_material_quantities.length > 0) || 
            (estimate.material_quantities && Array.isArray(estimate.material_quantities) && estimate.material_quantities.length > 0)) && (
            <div className="border rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <Package className="h-4 w-4 text-gray-600" />
                <div className="text-sm font-medium">Material Quantities</div>
                {estimate.waste_factor_percent && (
                  <Badge variant="outline" className="ml-auto">
                    Waste: {estimate.waste_factor_percent}% ({estimate.waste_factor_category})
                  </Badge>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {(estimate.estimate_material_quantities || estimate.material_quantities || []).map((mq: MaterialQuantity) => (
                  <div key={mq.id} className="flex justify-between p-2 bg-gray-50 rounded">
                    <span className="text-gray-600 capitalize">
                      {mq.material_type.replace(/_/g, " ")}:
                    </span>
                    <span className="font-medium">
                      {mq.quantity_avg?.toFixed(1) || `${mq.quantity_min}-${mq.quantity_max}`} {mq.unit}
                      {mq.is_code_required && (
                        <Badge variant="outline" className="ml-1 text-xs">Code</Badge>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Labor Hours (Block 20020) */}
          {estimate.estimated_labor_hours_min && (
            <div className="border rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <Users className="h-4 w-4 text-gray-600" />
                <div className="text-sm font-medium">Labor Estimate</div>
              </div>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <div className="text-gray-600">Crew Size</div>
                  <div className="font-medium">{estimate.estimated_crew_size || 4} person</div>
                </div>
                <div>
                  <div className="text-gray-600">Labor Hours</div>
                  <div className="font-medium">
                    {estimate.estimated_labor_hours_min}-{estimate.estimated_labor_hours_max} hrs
                  </div>
                </div>
                <div>
                  <div className="text-gray-600">Duration</div>
                  <div className="font-medium">
                    {estimate.estimated_job_duration_days_min}-{estimate.estimated_job_duration_days_max} days
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Permit Requirements (Block 20020) */}
          {estimate.permit_required && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-4 w-4 text-red-600" />
                <div className="text-sm font-medium text-red-900">Permit Required</div>
              </div>
              <div className="text-sm text-red-800">
                {estimate.permit_reason}
                {estimate.permit_cost_estimate && (
                  <div className="mt-1 font-medium">
                    Estimated Permit Cost: ${estimate.permit_cost_estimate.toFixed(2)}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Insurance Code Items (Block 20020) */}
          {estimate.insurance_code_items && estimate.insurance_code_items.length > 0 && (
            <div className="border rounded-lg p-4 bg-blue-50">
              <div className="flex items-center gap-2 mb-3">
                <Shield className="h-4 w-4 text-blue-600" />
                <div className="text-sm font-medium text-blue-900">Code-Required Items</div>
              </div>
              <div className="text-xs text-blue-700 mb-2">
                Required by local building code:
              </div>
              <ul className="space-y-1 text-sm">
                {estimate.insurance_code_items.map((item: any, idx: number) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-blue-600">•</span>
                    <span className="text-blue-800">
                      {item.description || item.item_type}
                      {item.code_reference && (
                        <span className="text-xs text-blue-600 ml-1">
                          ({item.code_reference})
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Material Brands (Block 20020) */}
          {((estimate.estimate_material_brands && estimate.estimate_material_brands.length > 0) ||
            (estimate.recommended_brands && Array.isArray(estimate.recommended_brands) && estimate.recommended_brands.length > 0)) && (
            <div className="border rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <Star className="h-4 w-4 text-gray-600" />
                <div className="text-sm font-medium">Recommended Material Brands</div>
              </div>
              <div className="space-y-3">
                {(estimate.estimate_material_brands || estimate.recommended_brands || []).map((brand: MaterialBrand) => (
                  <div
                    key={brand.id}
                    className={`p-3 rounded border ${
                      brand.is_recommended
                        ? "bg-green-50 border-green-200"
                        : "bg-gray-50 border-gray-200"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="font-medium">{brand.brand_name}</div>
                      {brand.is_recommended && (
                        <Badge variant="default" className="bg-green-600">
                          Recommended
                        </Badge>
                      )}
                    </div>
                    {brand.product_line && (
                      <div className="text-xs text-gray-600 mb-1">{brand.product_line}</div>
                    )}
                    <div className="text-xs text-gray-600">
                      ${brand.price_per_square_min}-${brand.price_per_square_max} per square
                      {brand.warranty_years && ` • ${brand.warranty_years}-year warranty`}
                    </div>
                    {brand.best_for && (
                      <div className="text-xs text-gray-700 mt-1">
                        Best for: {brand.best_for}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Upsells (Block 20020) */}
          {((estimate.estimate_upsells && estimate.estimate_upsells.length > 0) ||
            (estimate.upsell_options && Array.isArray(estimate.upsell_options) && estimate.upsell_options.length > 0)) && (
            <div className="border rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="h-4 w-4 text-gray-600" />
                <div className="text-sm font-medium">Optional Upgrades</div>
              </div>
              <div className="space-y-2">
                {(estimate.estimate_upsells || estimate.upsell_options || []).map((upsell: Upsell) => (
                  <div
                    key={upsell.id}
                    className={`p-3 rounded border ${
                      upsell.is_recommended
                        ? "bg-green-50 border-green-200"
                        : "bg-gray-50 border-gray-200"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="font-medium text-sm">{upsell.title}</div>
                      {upsell.is_recommended && (
                        <Badge variant="outline" className="text-xs">
                          Recommended
                        </Badge>
                      )}
                    </div>
                    {upsell.description && (
                      <div className="text-xs text-gray-600 mb-1">{upsell.description}</div>
                    )}
                    <div className="text-xs font-medium text-blue-600">
                      ${upsell.cost_min.toFixed(0)}-${upsell.cost_max.toFixed(0)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SMS Estimate (Block 20020) */}
          {showSMS && estimate.sms_estimate_text && (
            <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
              <div className="text-sm font-medium mb-2">SMS Estimate Text:</div>
              <div className="text-sm text-gray-700 font-mono bg-white p-3 rounded border">
                {estimate.sms_estimate_text}
              </div>
            </div>
          )}

          {/* Line Items */}
          {lineItems.length > 0 && (
            <div>
              <div className="text-sm font-medium mb-2">Line Items:</div>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left">Description</th>
                      <th className="px-3 py-2 text-right">Qty</th>
                      <th className="px-3 py-2 text-right">Unit Cost</th>
                      <th className="px-3 py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineItems.map((item) => (
                      <tr key={item.id} className="border-t">
                        <td className="px-3 py-2">
                          <div>{item.description}</div>
                          {item.notes && (
                            <div className="text-xs text-gray-500 mt-1">
                              {item.notes}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {item.quantity} {item.unit}
                        </td>
                        <td className="px-3 py-2 text-right">
                          ${item.unit_cost.toFixed(2)}
                        </td>
                        <td className="px-3 py-2 text-right font-medium">
                          ${item.total_cost.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-2 pt-2 border-t">
            <Button
              onClick={handleSendEstimate}
              disabled={sending || estimate.status === "sent"}
              variant="default"
              className="flex-1"
            >
              {sending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Send Estimate
                </>
              )}
            </Button>
            <Button
              onClick={handleGeneratePDF}
              disabled={loading}
              variant="outline"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <FileText className="h-4 w-4 mr-2" />
                  PDF
                </>
              )}
            </Button>
            {estimate.sms_estimate_text && (
              <Button
                onClick={handleGetSMS}
                disabled={loading}
                variant="outline"
                size="sm"
              >
                <MessageSquare className="h-4 w-4 mr-2" />
                SMS
              </Button>
            )}
            {estimate.status !== "approved" && (
              <Button
                onClick={handleApprove}
                disabled={loading}
                variant="outline"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Approve
                  </>
                )}
              </Button>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

