// Block 18900 — SmartSend Roof Age Verifier v1
// Roof Age Panel Component for Contact Profile

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
  HelpCircle,
  Calendar,
  BarChart3
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface RoofAgeData {
  estimated_age_min: number;
  estimated_age_max: number;
  estimated_age_median: number;
  confidence_score: number;
  age_band: '0_7_years' | '8_15_years' | '16_25_years' | '25_plus_years' | 'unknown';
  replacement_probability: number;
  insurance_feasibility: 'high' | 'moderate' | 'low' | 'unknown';
  material_confirmed: string | null;
  storm_impact: 'wind_hail' | 'wind_only' | 'hail_only' | 'none' | 'unknown';
  recommended_action: string;
  reasoning_summary: {
    sources: string[];
    keyFactors: string[];
    confidenceFactors: string[];
  };
  sources?: Array<{
    source_type: string;
    age_estimate_median: number;
    source_confidence: number;
    source_weight: number;
  }>;
}

interface RoofAgePanelProps {
  contactId: string;
}

export function RoofAgePanel({ contactId }: RoofAgePanelProps) {
  const [roofAgeData, setRoofAgeData] = useState<RoofAgeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadRoofAge() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/roofage/${contactId}`);
        if (!res.ok) {
          throw new Error('Failed to load roof age data');
        }
        const data = await res.json();
        setRoofAgeData(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load roof age');
      } finally {
        setLoading(false);
      }
    }

    void loadRoofAge();
  }, [contactId]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Roof Age
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error || !roofAgeData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Roof Age
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">
            {error || 'No roof age data available'}
          </div>
        </CardContent>
      </Card>
    );
  }

  const getAgeBandColor = (band: string) => {
    switch (band) {
      case '0_7_years':
        return 'bg-green-100 text-green-800 border-green-300';
      case '8_15_years':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case '16_25_years':
        return 'bg-orange-100 text-orange-800 border-orange-300';
      case '25_plus_years':
        return 'bg-red-100 text-red-800 border-red-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getAgeBandLabel = (band: string) => {
    switch (band) {
      case '0_7_years':
        return 'Low Replacement Potential';
      case '8_15_years':
        return 'Mid Replacement Potential';
      case '16_25_years':
        return 'HIGH Replacement Potential';
      case '25_plus_years':
        return 'Critical';
      default:
        return 'Unknown';
    }
  };

  const getConfidenceBadge = (score: number) => {
    if (score >= 80) {
      return <Badge className="bg-green-100 text-green-800 border-green-300">High</Badge>;
    } else if (score >= 60) {
      return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-300">Moderate</Badge>;
    } else {
      return <Badge className="bg-gray-100 text-gray-800 border-gray-300">Low</Badge>;
    }
  };

  const getInsuranceBadge = (feasibility: string) => {
    switch (feasibility) {
      case 'high':
        return <Badge className="bg-green-100 text-green-800 border-green-300">High Coverage</Badge>;
      case 'moderate':
        return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-300">Moderate</Badge>;
      case 'low':
        return <Badge className="bg-orange-100 text-orange-800 border-orange-300">Low Coverage</Badge>;
      default:
        return <Badge variant="secondary">Unknown</Badge>;
    }
  };

  const formatMaterial = (material: string | null) => {
    if (!material) return 'Not Confirmed';
    return material
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const formatStormImpact = (impact: string) => {
    switch (impact) {
      case 'wind_hail':
        return 'Wind & Hail';
      case 'wind_only':
        return 'Wind';
      case 'hail_only':
        return 'Hail';
      case 'none':
        return 'None';
      default:
        return 'Unknown';
    }
  };

  const formatRecommendedAction = (action: string) => {
    switch (action) {
      case 'repair_only':
        return 'Repair Only';
      case 'storm_inspection':
        return 'Storm Inspection';
      case 'full_assessment':
        return 'Full Assessment';
      case 'replacement_appointment':
        return 'Replacement Appointment';
      case 'emergency_replacement':
        return 'Emergency Replacement';
      default:
        return action.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Roof Age
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Estimated Age Range */}
        <div>
          <div className="text-sm text-muted-foreground mb-1">Estimated Age</div>
          <div className="text-2xl font-bold">
            {roofAgeData.estimated_age_min}–{roofAgeData.estimated_age_max} years
          </div>
          <div className="text-sm text-muted-foreground mt-1">
            Median: {roofAgeData.estimated_age_median.toFixed(1)} years
          </div>
        </div>

        {/* Confidence Score */}
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">Confidence</div>
          <div className="flex items-center gap-2">
            {getConfidenceBadge(roofAgeData.confidence_score)}
            <span className="text-sm font-medium">{roofAgeData.confidence_score}%</span>
          </div>
        </div>

        {/* Age Band */}
        <div>
          <div className="text-sm text-muted-foreground mb-2">Replacement Potential</div>
          <Badge className={`${getAgeBandColor(roofAgeData.age_band)} border`}>
            {getAgeBandLabel(roofAgeData.age_band)}
          </Badge>
          <div className="text-xs text-muted-foreground mt-1">
            {roofAgeData.replacement_probability}% replacement probability
          </div>
        </div>

        {/* Material Confirmed */}
        {roofAgeData.material_confirmed && (
          <div>
            <div className="text-sm text-muted-foreground mb-1">Material Confirmed</div>
            <div className="font-medium">{formatMaterial(roofAgeData.material_confirmed)}</div>
          </div>
        )}

        {/* Insurance Feasibility */}
        <div>
          <div className="text-sm text-muted-foreground mb-2">Insurance Feasibility</div>
          {getInsuranceBadge(roofAgeData.insurance_feasibility)}
        </div>

        {/* Storm Impact */}
        {roofAgeData.storm_impact !== 'none' && roofAgeData.storm_impact !== 'unknown' && (
          <div>
            <div className="text-sm text-muted-foreground mb-1">Storm Impact</div>
            <Badge variant="destructive">{formatStormImpact(roofAgeData.storm_impact)}</Badge>
          </div>
        )}

        {/* Recommended Next Action */}
        <div>
          <div className="text-sm text-muted-foreground mb-1">Recommended Next Action</div>
          <div className="font-medium text-sm">{formatRecommendedAction(roofAgeData.recommended_action)}</div>
        </div>

        {/* Key Factors */}
        {roofAgeData.reasoning_summary?.keyFactors && roofAgeData.reasoning_summary.keyFactors.length > 0 && (
          <div>
            <div className="text-sm text-muted-foreground mb-2">Key Factors</div>
            <ul className="text-xs space-y-1">
              {roofAgeData.reasoning_summary.keyFactors.slice(0, 3).map((factor, idx) => (
                <li key={idx} className="flex items-start gap-1">
                  <span className="text-muted-foreground">•</span>
                  <span>{factor}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Data Sources */}
        {roofAgeData.sources && roofAgeData.sources.length > 0 && (
          <div>
            <div className="text-sm text-muted-foreground mb-2">Data Sources</div>
            <div className="flex flex-wrap gap-1">
              {roofAgeData.sources.map((source, idx) => (
                <Badge key={idx} variant="outline" className="text-xs">
                  {source.source_type.replace(/_/g, ' ')}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

