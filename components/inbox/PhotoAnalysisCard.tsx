// Block 19940 — SmartSend Inbox Photo Intelligence v1
// UI Component to display AI photo analysis results in inbox threads

"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronDown, ChevronUp, Image as ImageIcon, AlertTriangle, TrendingUp, DollarSign, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

interface PhotoAnalysisReport {
  id: string;
  damage_type: string | null;
  damage_types: string[] | null;
  severity: number;
  severity_label: string | null;
  severity_description: string | null;
  material_detected: string | null;
  material_confidence: number | null;
  slope_estimation: string | null;
  roof_condition_notes: string | null;
  condition_summary: string[] | null;
  insurance_likelihood: number;
  insurance_indicators: string[] | null;
  recommended_next_step: string | null;
  recommended_action_type: string | null;
  potential_job_type: string | null;
  job_type_confidence: number | null;
  value_range_min: number | null;
  value_range_max: number | null;
  value_range_type: string | null;
  value_range_formatted: string | null;
  analyzed_at: string;
  attachment_id: string | null;
}

interface PhotoAnalysisCardProps {
  report: PhotoAnalysisReport;
  imageUrl?: string;
  className?: string;
}

export function PhotoAnalysisCard({ report, imageUrl, className }: PhotoAnalysisCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const getSeverityColor = (severity: number) => {
    if (severity >= 50) return "bg-red-100 text-red-800 border-red-300";
    if (severity >= 20) return "bg-yellow-100 text-yellow-800 border-yellow-300";
    return "bg-green-100 text-green-800 border-green-300";
  };

  const getSeverityIcon = (severity: number) => {
    if (severity >= 50) return <AlertTriangle className="w-4 h-4" />;
    if (severity >= 20) return <TrendingUp className="w-4 h-4" />;
    return null;
  };

  const formatDamageType = (type: string | null) => {
    if (!type) return "No damage detected";
    return type.split("_").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
  };

  return (
    <Card className={cn("border-l-4", className)}>
      <CardHeader 
        className="cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <ImageIcon className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold">AI Photo Analysis</CardTitle>
              <p className="text-xs text-gray-500 mt-1">
                Analyzed {new Date(report.analyzed_at).toLocaleString()}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {report.severity !== null && (
              <Badge className={cn("font-semibold", getSeverityColor(report.severity))}>
                <div className="flex items-center gap-1">
                  {getSeverityIcon(report.severity)}
                  <span>{report.severity_label || `${report.severity}/100`}</span>
                </div>
              </Badge>
            )}
            {isExpanded ? (
              <ChevronUp className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-400" />
            )}
          </div>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="space-y-4 pt-0">
          {/* Photo Thumbnail */}
          {imageUrl && (
            <div className="rounded-lg overflow-hidden border">
              <img 
                src={imageUrl} 
                alt="Analyzed photo" 
                className="w-full h-auto max-h-64 object-contain bg-gray-50"
              />
            </div>
          )}

          {/* Damage Type */}
          {report.damage_type && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Damage Detected
              </h4>
              <div className="space-y-1">
                <Badge variant="outline" className="text-sm">
                  {formatDamageType(report.damage_type)}
                </Badge>
                {report.damage_types && report.damage_types.length > 1 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {report.damage_types.map((type, idx) => (
                      <Badge key={idx} variant="secondary" className="text-xs">
                        {formatDamageType(type)}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Severity Description */}
          {report.severity_description && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-1">Severity Assessment</h4>
              <p className="text-sm text-gray-600">{report.severity_description}</p>
            </div>
          )}

          {/* Material Detection */}
          {report.material_detected && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-1">Material Detected</h4>
              <div className="flex items-center gap-2">
                <Badge variant="outline">
                  {formatDamageType(report.material_detected)}
                </Badge>
                {report.material_confidence && (
                  <span className="text-xs text-gray-500">
                    {Math.round(report.material_confidence)}% confidence
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Roof Condition Notes */}
          {report.roof_condition_notes && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-1 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Condition Notes
              </h4>
              <p className="text-sm text-gray-600">{report.roof_condition_notes}</p>
              {report.condition_summary && report.condition_summary.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {report.condition_summary.map((note, idx) => (
                    <li key={idx} className="text-xs text-gray-500 flex items-start gap-2">
                      <span className="text-gray-400">•</span>
                      <span>{note}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Insurance Likelihood */}
          {report.insurance_likelihood > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-2">Insurance Likelihood</h4>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-gray-200 rounded-full h-2">
                    <div 
                      className={cn(
                        "h-2 rounded-full transition-all",
                        report.insurance_likelihood >= 70 ? "bg-green-600" :
                        report.insurance_likelihood >= 50 ? "bg-yellow-600" : "bg-gray-400"
                      )}
                      style={{ width: `${report.insurance_likelihood}%` }}
                    />
                  </div>
                  <span className="text-sm font-semibold">{report.insurance_likelihood}%</span>
                </div>
                {report.insurance_indicators && report.insurance_indicators.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {report.insurance_indicators.map((indicator, idx) => (
                      <Badge key={idx} variant="secondary" className="text-xs">
                        {indicator.replace(/_/g, " ")}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Recommended Next Step */}
          {report.recommended_next_step && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <h4 className="text-sm font-semibold text-blue-900 mb-1">Recommended Next Step</h4>
              <p className="text-sm text-blue-800">{report.recommended_next_step}</p>
            </div>
          )}

          {/* Value Range */}
          {report.value_range_formatted && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <h4 className="text-sm font-semibold text-green-900 mb-1 flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                Estimated Value Range
              </h4>
              <div className="space-y-1">
                <p className="text-lg font-bold text-green-900">{report.value_range_formatted}</p>
                {report.potential_job_type && (
                  <p className="text-xs text-green-700">
                    Job Type: {formatDamageType(report.potential_job_type)}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Additional Details */}
          <div className="pt-2 border-t">
            <div className="grid grid-cols-2 gap-3 text-xs">
              {report.slope_estimation && (
                <div>
                  <span className="text-gray-500">Slope:</span>
                  <span className="ml-1 font-medium">{formatDamageType(report.slope_estimation)}</span>
                </div>
              )}
              {report.potential_job_type && (
                <div>
                  <span className="text-gray-500">Job Type:</span>
                  <span className="ml-1 font-medium">{formatDamageType(report.potential_job_type)}</span>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}



















































