// Section 2 — Hot Leads That Require Action

"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Flame, AlertTriangle, DollarSign, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

interface HotLeadsSectionProps {
  hotLeads: Array<{
    id: string;
    name?: string;
    email?: string;
    heat_score: number;
    estimated_job_value?: number;
    status?: string;
  }>;
  stuckLeads: Array<{
    id: string;
    name?: string;
    email?: string;
    status?: string;
    updated_at?: string;
  }>;
  angryLeads: Array<{
    id: string;
    name?: string;
    email?: string;
    homeowner_tone?: string;
  }>;
  highValueLowProbLeads: Array<{
    id: string;
    name?: string;
    email?: string;
    estimated_job_value?: number;
    job_probability?: number;
  }>;
}

export function HotLeadsSection({
  hotLeads,
  stuckLeads,
  angryLeads,
  highValueLowProbLeads,
}: HotLeadsSectionProps) {
  const formatCurrency = (amount?: number) => {
    if (!amount) return "$0";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-white">Hot Leads That Require Action</h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Hot Leads (80-100) */}
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Flame className="h-5 w-5 text-orange-500" />
              Hot Leads (80-100)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {hotLeads.length === 0 ? (
              <p className="text-gray-400 text-sm">No hot leads right now.</p>
            ) : (
              <div className="space-y-2">
                {hotLeads.slice(0, 5).map((lead) => (
                  <Link
                    key={lead.id}
                    href={`/leads/${lead.id}`}
                    className="block p-3 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-white">
                          {lead.name || lead.email || "Unknown"}
                        </div>
                        <div className="text-sm text-gray-400">
                          {formatCurrency(lead.estimated_job_value)}
                        </div>
                      </div>
                      <Badge variant="destructive" className="bg-orange-500">
                        {lead.heat_score}
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Stuck Leads */}
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Clock className="h-5 w-5 text-yellow-500" />
              Stuck in Pipeline (48+ hours)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stuckLeads.length === 0 ? (
              <p className="text-gray-400 text-sm">No stuck leads.</p>
            ) : (
              <div className="space-y-2">
                {stuckLeads.slice(0, 5).map((lead) => (
                  <Link
                    key={lead.id}
                    href={`/leads/${lead.id}`}
                    className="block p-3 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-white">
                          {lead.name || lead.email || "Unknown"}
                        </div>
                        <div className="text-sm text-gray-400">{lead.status || "Unknown status"}</div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Angry/Impatient Leads */}
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Angry/Impatient Tone
            </CardTitle>
          </CardHeader>
          <CardContent>
            {angryLeads.length === 0 ? (
              <p className="text-gray-400 text-sm">No angry leads.</p>
            ) : (
              <div className="space-y-2">
                {angryLeads.slice(0, 5).map((lead) => (
                  <Link
                    key={lead.id}
                    href={`/leads/${lead.id}`}
                    className="block p-3 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-white">
                          {lead.name || lead.email || "Unknown"}
                        </div>
                        <div className="text-sm text-red-400 capitalize">
                          {lead.homeowner_tone || "Unknown tone"}
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* High-Value Low Probability */}
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <DollarSign className="h-5 w-5 text-yellow-500" />
              High-Value Low Probability
            </CardTitle>
          </CardHeader>
          <CardContent>
            {highValueLowProbLeads.length === 0 ? (
              <p className="text-gray-400 text-sm">No high-value low-probability leads.</p>
            ) : (
              <div className="space-y-2">
                {highValueLowProbLeads.slice(0, 5).map((lead) => (
                  <Link
                    key={lead.id}
                    href={`/leads/${lead.id}`}
                    className="block p-3 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-white">
                          {lead.name || lead.email || "Unknown"}
                        </div>
                        <div className="text-sm text-gray-400">
                          {formatCurrency(lead.estimated_job_value)} • {lead.job_probability || 0}% prob
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}









































