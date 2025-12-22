// Block 18300 — Material Detection Engine v1
// Material Summary Panel Component for Contact Profile

"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/badge";
import { 
  Home, 
  TrendingUp, 
  AlertTriangle, 
  Shield, 
  Clock,
  Image as ImageIcon,
  FileText,
  CheckCircle2,
  XCircle,
  HelpCircle
} from "lucide-react";

interface MaterialSummary {
  materialType: string;
  materialDetails: {
    shingleType?: string;
    metalType?: string;
    tileType?: string;
    flatType?: string;
  };
  pitch: string;
  layerCount: string;
  ageEstimate: string;
  components: {
    skylights: boolean;
    chimney: boolean;
    boxVents: boolean;
    ridgeVents: boolean;
    pipeBoots: boolean;
    satelliteMounts: boolean;
    solarPanels: boolean;
  };
  conditions: {
    granuleLoss: boolean;
    shingleCurl: boolean;
    mossBuildup: boolean;
    hailImpact: boolean;
    windUplift: boolean;
  };
  compatibilityFlags: string[];
  stormVulnerability: string;
  insuranceAngle: string;
  replacementUrgency: string;
  confidence: {
    overall: number;
    text: number;
    photo: number;
  };
  detectionSources: {
    fromText: boolean;
    fromPhoto: boolean;
  };
  tags: Array<{ tag: string; tag_category: string; confidence: number }>;
  lastAnalyzed: string | null;
}

interface MaterialSummaryPanelProps {
  contactId: string;
}

export function MaterialSummaryPanel({ contactId }: MaterialSummaryPanelProps) {
  const [summary, setSummary] = useState<MaterialSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchMaterialSummary() {
      try {
        const response = await fetch(`/api/materials/${contactId}`);
        if (!response.ok) {
          throw new Error("Failed to fetch material summary");
        }
        const data = await response.json();
        setSummary(data.summary);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchMaterialSummary();
  }, [contactId]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Roof Material Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">Loading material intelligence...</div>
        </CardContent>
      </Card>
    );
  }

  if (error || !summary) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Roof Material Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">
            {error || "No material intelligence available"}
          </div>
        </CardContent>
      </Card>
    );
  }

  const formatMaterialType = (type: string): string => {
    const map: Record<string, string> = {
      asphalt_shingle: "Asphalt Shingle",
      metal: "Metal Roofing",
      tile: "Tile Roofing",
      flat_tpo: "TPO Flat Roof",
      flat_epdm: "EPDM Flat Roof",
      flat_mod_bit: "Modified Bitumen",
      slate: "Slate",
      wood_shake: "Wood Shake",
      unknown: "Unknown",
    };
    return map[type] || type.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
  };

  const formatPitch = (pitch: string): string => {
    const map: Record<string, string> = {
      low_slope: "Low Slope",
      medium_slope: "Medium Slope",
      steep_slope: "Steep Slope",
      unknown: "Unknown",
    };
    return map[pitch] || pitch;
  };

  const formatAge = (age: string): string => {
    const map: Record<string, string> = {
      "0_5_years": "0-5 years",
      "6_15_years": "6-15 years",
      "16_25_years": "16-25 years",
      "25_plus_years": "25+ years",
      unknown: "Unknown",
    };
    return map[age] || age;
  };

  const formatLayerCount = (layers: string): string => {
    const map: Record<string, string> = {
      "1_layer": "1 Layer",
      "2_layers": "2 Layers",
      uncertain: "Uncertain",
    };
    return map[layers] || layers;
  };

  const getUrgencyColor = (urgency: string): string => {
    const colors: Record<string, string> = {
      low: "bg-green-100 text-green-800",
      medium: "bg-yellow-100 text-yellow-800",
      high: "bg-orange-100 text-orange-800",
      critical: "bg-red-100 text-red-800",
      unknown: "bg-gray-100 text-gray-800",
    };
    return colors[urgency] || colors.unknown;
  };

  const getVulnerabilityColor = (vuln: string): string => {
    const colors: Record<string, string> = {
      low: "bg-green-100 text-green-800",
      medium: "bg-yellow-100 text-yellow-800",
      high: "bg-red-100 text-red-800",
      unknown: "bg-gray-100 text-gray-800",
    };
    return colors[vuln] || colors.unknown;
  };

  const getInsuranceColor = (angle: string): string => {
    const colors: Record<string, string> = {
      weak: "bg-gray-100 text-gray-800",
      moderate: "bg-yellow-100 text-yellow-800",
      strong: "bg-green-100 text-green-800",
      unknown: "bg-gray-100 text-gray-800",
    };
    return colors[angle] || colors.unknown;
  };

  const componentsList = [];
  if (summary.components.skylights) componentsList.push("Skylight");
  if (summary.components.chimney) componentsList.push("Chimney");
  if (summary.components.boxVents) componentsList.push("Box Vents");
  if (summary.components.ridgeVents) componentsList.push("Ridge Vents");
  if (summary.components.pipeBoots) componentsList.push("Pipe Boots");
  if (summary.components.satelliteMounts) componentsList.push("Satellite Mounts");
  if (summary.components.solarPanels) componentsList.push("Solar Panels");

  const conditionsList = [];
  if (summary.conditions.granuleLoss) conditionsList.push("Granule Loss");
  if (summary.conditions.shingleCurl) conditionsList.push("Shingle Curl");
  if (summary.conditions.mossBuildup) conditionsList.push("Moss Buildup");
  if (summary.conditions.hailImpact) conditionsList.push("Hail Impact");
  if (summary.conditions.windUplift) conditionsList.push("Wind Uplift");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Home className="h-5 w-5" />
          Roof Material Summary
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Material Type */}
        <div>
          <div className="text-sm font-medium text-muted-foreground mb-1">Material Type</div>
          <div className="flex items-center gap-2">
            <span className="font-semibold">{formatMaterialType(summary.materialType)}</span>
            {summary.materialDetails.shingleType && (
              <Badge variant="outline">
                {summary.materialDetails.shingleType.replace(/_/g, " ")}
              </Badge>
            )}
            {summary.materialDetails.metalType && (
              <Badge variant="outline">
                {summary.materialDetails.metalType.replace(/_/g, " ")}
              </Badge>
            )}
            {summary.materialDetails.tileType && (
              <Badge variant="outline">
                {summary.materialDetails.tileType.replace(/_/g, " ")}
              </Badge>
            )}
            {summary.materialDetails.flatType && (
              <Badge variant="outline">
                {summary.materialDetails.flatType.replace(/_/g, " ")}
              </Badge>
            )}
          </div>
        </div>

        {/* Key Characteristics */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-sm text-muted-foreground mb-1">Pitch</div>
            <div className="font-medium">{formatPitch(summary.pitch)}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground mb-1">Layer Count</div>
            <div className="font-medium">{formatLayerCount(summary.layerCount)}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground mb-1">Age Estimate</div>
            <div className="font-medium">{formatAge(summary.ageEstimate)}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground mb-1">Confidence</div>
            <div className="font-medium">{Math.round(summary.confidence.overall)}%</div>
          </div>
        </div>

        {/* Components */}
        {componentsList.length > 0 && (
          <div>
            <div className="text-sm text-muted-foreground mb-1">Components</div>
            <div className="flex flex-wrap gap-1">
              {componentsList.map((comp, idx) => (
                <Badge key={idx} variant="secondary" className="text-xs">
                  {comp}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Conditions */}
        {conditionsList.length > 0 && (
          <div>
            <div className="text-sm text-muted-foreground mb-1">Conditions Detected</div>
            <div className="flex flex-wrap gap-1">
              {conditionsList.map((cond, idx) => (
                <Badge key={idx} variant="destructive" className="text-xs">
                  {cond}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Risk & Urgency */}
        <div className="grid grid-cols-3 gap-2 pt-2 border-t">
          <div>
            <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              Storm Vulnerability
            </div>
            <Badge className={getVulnerabilityColor(summary.stormVulnerability)}>
              {summary.stormVulnerability.charAt(0).toUpperCase() + summary.stormVulnerability.slice(1)}
            </Badge>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              <Shield className="h-3 w-3" />
              Insurance Angle
            </div>
            <Badge className={getInsuranceColor(summary.insuranceAngle)}>
              {summary.insuranceAngle.charAt(0).toUpperCase() + summary.insuranceAngle.slice(1)}
            </Badge>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Replacement Urgency
            </div>
            <Badge className={getUrgencyColor(summary.replacementUrgency)}>
              {summary.replacementUrgency.charAt(0).toUpperCase() + summary.replacementUrgency.slice(1)}
            </Badge>
          </div>
        </div>

        {/* Compatibility Flags */}
        {summary.compatibilityFlags.length > 0 && (
          <div>
            <div className="text-sm text-muted-foreground mb-1">Compatibility Flags</div>
            <div className="flex flex-wrap gap-1">
              {summary.compatibilityFlags.map((flag, idx) => (
                <Badge key={idx} variant="outline" className="text-xs text-orange-600">
                  {flag.replace(/_/g, " ")}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Detection Sources */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2 border-t">
          <div className="flex items-center gap-1">
            {summary.detectionSources.fromText ? (
              <FileText className="h-3 w-3 text-green-600" />
            ) : (
              <FileText className="h-3 w-3" />
            )}
            <span>Text</span>
          </div>
          <div className="flex items-center gap-1">
            {summary.detectionSources.fromPhoto ? (
              <ImageIcon className="h-3 w-3 text-green-600" />
            ) : (
              <ImageIcon className="h-3 w-3" />
            )}
            <span>Photo</span>
          </div>
          {summary.lastAnalyzed && (
            <div className="ml-auto">
              Analyzed {new Date(summary.lastAnalyzed).toLocaleDateString()}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

