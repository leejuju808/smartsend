"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/button";
import {
  Wrench,
  TrendingUp,
  AlertTriangle,
  ArrowRight,
  Phone,
  Mail,
} from "lucide-react";
import Link from "next/link";

interface ActionSuggestion {
  type: string;
  priority: string;
  title: string;
  description: string;
  action: string;
  job_id?: string;
  supplier_id?: string;
  crew_id?: string;
  count?: number;
  value?: number;
}

interface ActionSuggestionsData {
  fix_now?: ActionSuggestion[];
  revenue_opportunity?: ActionSuggestion[];
  risk?: ActionSuggestion[];
}

interface ActionSuggestionsPanelProps {
  suggestions: ActionSuggestionsData;
}

export function ActionSuggestionsPanel({
  suggestions,
}: ActionSuggestionsPanelProps) {
  const fixNow = suggestions.fix_now || [];
  const revenueOpportunity = suggestions.revenue_opportunity || [];
  const risk = suggestions.risk || [];

  const formatCurrency = (value: number | undefined) => {
    if (!value) return "$0";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(value);
  };

  const getActionButton = (suggestion: ActionSuggestion) => {
    switch (suggestion.action) {
      case "contact_supplier":
        return (
          <Button variant="outline" size="sm" asChild>
            <Link href={`/dashboard/jobs/${suggestion.job_id}/materials`}>
              <Phone className="w-4 h-4 mr-1" />
              Contact Supplier
            </Link>
          </Button>
        );
      case "follow_up_quotes":
        return (
          <Button variant="outline" size="sm" asChild>
            <Link href="/dashboard/pipeline/roofing">
              <Mail className="w-4 h-4 mr-1" />
              Follow Up
            </Link>
          </Button>
        );
      case "reschedule_crew":
        return (
          <Button variant="outline" size="sm" asChild>
            <Link href="/dashboard/calendar">
              <Wrench className="w-4 h-4 mr-1" />
              Reschedule
            </Link>
          </Button>
        );
      default:
        return null;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Action Suggestions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Fix These Now */}
        {fixNow.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Wrench className="w-4 h-4 text-red-600" />
              Fix These Now
            </h3>
            <div className="space-y-3">
              {fixNow.map((suggestion, idx) => (
                <div
                  key={idx}
                  className="p-4 border border-red-200 rounded-lg bg-red-50"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="font-semibold mb-1">{suggestion.title}</div>
                      <p className="text-sm text-muted-foreground">
                        {suggestion.description}
                      </p>
                    </div>
                    {getActionButton(suggestion)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Revenue Opportunity */}
        {revenueOpportunity.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-green-600" />
              Revenue Opportunity
            </h3>
            <div className="space-y-3">
              {revenueOpportunity.map((suggestion, idx) => (
                <div
                  key={idx}
                  className="p-4 border border-green-200 rounded-lg bg-green-50"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="font-semibold mb-1">{suggestion.title}</div>
                      {suggestion.value && (
                        <div className="text-sm font-medium text-green-700">
                          Potential Value: {formatCurrency(suggestion.value)}
                        </div>
                      )}
                    </div>
                    {getActionButton(suggestion)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Risk */}
        {risk.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-orange-600" />
              Risk
            </h3>
            <div className="space-y-3">
              {risk.map((suggestion, idx) => (
                <div
                  key={idx}
                  className="p-4 border border-orange-200 rounded-lg bg-orange-50"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="font-semibold mb-1">{suggestion.title}</div>
                      <p className="text-sm text-muted-foreground">
                        {suggestion.description}
                      </p>
                    </div>
                    {getActionButton(suggestion)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {fixNow.length === 0 &&
          revenueOpportunity.length === 0 &&
          risk.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <p className="text-green-600 font-semibold">
              ✓ All systems operational
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

