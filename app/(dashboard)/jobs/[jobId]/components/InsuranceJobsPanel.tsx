// Block 91000 — SmartSend Roofing Insurance Jobs Engine v1
// Component: InsuranceJobsPanel
// Complete insurance workflow panel with Damage, Scope, Supplements, Communications, Documents

"use client";

import { useState, useEffect } from "react";
import useSWR from "swr";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  DollarSign,
  FileText,
  Phone,
  Mail,
  User,
  Camera,
  Plus,
  Upload,
  Shield,
  MessageSquare,
  FileCheck,
  TrendingUp,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { format } from "date-fns";
import { DamageDocumentationTab } from "./insurance/DamageDocumentationTab";
import { ScopeBuilderTab } from "./insurance/ScopeBuilderTab";
import { SupplementsTab } from "./insurance/SupplementsTab";
import { CommunicationsTab } from "./insurance/CommunicationsTab";
import { InsuranceDocumentsTab } from "./insurance/InsuranceDocumentsTab";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface InsuranceClaim {
  id: string;
  job_id: string;
  claim_number: string;
  carrier: string;
  adjuster_name: string;
  adjuster_phone: string;
  adjuster_email: string;
  deductible: number;
  rc_value: number;
  acv_value: number;
  depreciation: number;
  supplements_sent: number;
  supplements_approved: number;
  claim_status: string;
  created_at: string;
  updated_at: string;
}

interface InsuranceClaimSummary {
  claim: InsuranceClaim | null;
  damage_items_count: number;
  scopes_count: number;
  supplements_count: number;
  communications_count: number;
  pending_supplements: number;
  approved_supplements: number;
}

export function InsuranceJobsPanel({ jobId }: { jobId: string }) {
  const [activeTab, setActiveTab] = useState("overview");
  const { data, error, mutate } = useSWR<InsuranceClaimSummary>(
    `/api/jobs/${jobId}/insurance/claim`,
    fetcher
  );

  const claim = data?.claim;

  const getStatusColor = (status: string) => {
    switch (status) {
      case "approved":
      case "supplement_approved":
        return "text-green-600 dark:text-green-400 bg-green-500/10";
      case "scope_created":
      case "sent_to_carrier":
        return "text-blue-600 dark:text-blue-400 bg-blue-500/10";
      case "waiting_for_adjuster":
      case "supplement_pending":
        return "text-yellow-600 dark:text-yellow-400 bg-yellow-500/10";
      case "inspection_needed":
        return "text-gray-600 dark:text-gray-400 bg-gray-500/10";
      case "denied":
        return "text-red-600 dark:text-red-400 bg-red-500/10";
      default:
        return "text-gray-600 dark:text-gray-400 bg-gray-500/10";
    }
  };

  const getStatusLabel = (status: string) => {
    return status
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  if (!data && !error) {
    return (
      <Card className="border-zinc-800 bg-zinc-950">
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-6 w-48 bg-zinc-800 rounded"></div>
            <div className="h-32 w-full bg-zinc-800 rounded"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-zinc-800 bg-zinc-950">
        <CardContent className="p-6">
          <div className="text-red-400 text-sm">
            Error loading insurance claim information.
          </div>
        </CardContent>
      </Card>
    );
  }

  // If no claim exists, show setup prompt
  if (!claim) {
    return (
      <Card className="border-zinc-800 bg-zinc-950">
        <CardHeader>
          <CardTitle className="text-lg text-zinc-50 flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Insurance Jobs Engine
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 space-y-4">
            <Shield className="w-12 h-12 mx-auto text-zinc-600" />
            <div>
              <h3 className="text-lg font-semibold text-zinc-50 mb-2">
                This is an insurance job
              </h3>
              <p className="text-sm text-zinc-400 mb-4">
                Enable insurance mode to access the complete insurance workflow:
                damage documentation, scope builder, supplements, and communication tracking.
              </p>
              <Button
                onClick={async () => {
                  const response = await fetch(`/api/jobs/${jobId}/insurance/claim`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                  });
                  if (response.ok) {
                    mutate();
                  }
                }}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Plus className="w-4 h-4 mr-2" />
                Enable Insurance Mode
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-zinc-800 bg-zinc-950">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg text-zinc-50 flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Insurance Jobs Engine
          </CardTitle>
          <Badge className={getStatusColor(claim.claim_status)}>
            {getStatusLabel(claim.claim_status)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {/* Quick Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-zinc-900 rounded-lg p-3 border border-zinc-800">
            <div className="text-xs text-zinc-400 mb-1">RC Value</div>
            <div className="text-lg font-semibold text-zinc-50">
              {formatCurrency(claim.rc_value || 0)}
            </div>
          </div>
          <div className="bg-zinc-900 rounded-lg p-3 border border-zinc-800">
            <div className="text-xs text-zinc-400 mb-1">ACV Value</div>
            <div className="text-lg font-semibold text-zinc-50">
              {formatCurrency(claim.acv_value || 0)}
            </div>
          </div>
          <div className="bg-zinc-900 rounded-lg p-3 border border-zinc-800">
            <div className="text-xs text-zinc-400 mb-1">Supplements</div>
            <div className="text-lg font-semibold text-green-400">
              {formatCurrency(claim.supplements_approved || 0)}
            </div>
          </div>
          <div className="bg-zinc-900 rounded-lg p-3 border border-zinc-800">
            <div className="text-xs text-zinc-400 mb-1">Deductible</div>
            <div className="text-lg font-semibold text-zinc-50">
              {formatCurrency(claim.deductible || 0)}
            </div>
          </div>
        </div>

        {/* Adjuster Info */}
        {(claim.adjuster_name || claim.adjuster_email || claim.adjuster_phone) && (
          <div className="bg-zinc-900 rounded-lg p-4 mb-6 border border-zinc-800">
            <div className="flex items-center gap-2 mb-3">
              <User className="w-4 h-4 text-zinc-400" />
              <span className="text-sm font-semibold text-zinc-50">Adjuster Contact</span>
            </div>
            <div className="space-y-2 text-sm">
              {claim.adjuster_name && (
                <div className="text-zinc-300">{claim.adjuster_name}</div>
              )}
              {claim.adjuster_phone && (
                <div className="flex items-center gap-2">
                  <Phone className="w-3 h-3 text-zinc-400" />
                  <a
                    href={`tel:${claim.adjuster_phone}`}
                    className="text-blue-400 hover:underline"
                  >
                    {claim.adjuster_phone}
                  </a>
                </div>
              )}
              {claim.adjuster_email && (
                <div className="flex items-center gap-2">
                  <Mail className="w-3 h-3 text-zinc-400" />
                  <a
                    href={`mailto:${claim.adjuster_email}`}
                    className="text-blue-400 hover:underline"
                  >
                    {claim.adjuster_email}
                  </a>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-5 bg-zinc-900">
            <TabsTrigger value="overview" className="text-xs">
              Overview
            </TabsTrigger>
            <TabsTrigger value="damage" className="text-xs">
              Damage
            </TabsTrigger>
            <TabsTrigger value="scope" className="text-xs">
              Scope
            </TabsTrigger>
            <TabsTrigger value="supplements" className="text-xs">
              Supplements
            </TabsTrigger>
            <TabsTrigger value="communications" className="text-xs">
              Communications
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4">
            <div className="space-y-4">
              {/* Claim Details */}
              <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
                <h3 className="text-sm font-semibold text-zinc-50 mb-3">Claim Details</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-zinc-400 mb-1">Carrier</div>
                    <div className="text-zinc-50 font-medium">{claim.carrier || "—"}</div>
                  </div>
                  <div>
                    <div className="text-zinc-400 mb-1">Claim Number</div>
                    <div className="text-zinc-50 font-medium">
                      {claim.claim_number || "—"}
                    </div>
                  </div>
                </div>
              </div>

              {/* Statistics */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
                  <div className="flex items-center gap-2 mb-2">
                    <Camera className="w-4 h-4 text-zinc-400" />
                    <div className="text-xs text-zinc-400">Damage Items</div>
                  </div>
                  <div className="text-2xl font-bold text-zinc-50">
                    {data?.damage_items_count || 0}
                  </div>
                </div>
                <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-4 h-4 text-zinc-400" />
                    <div className="text-xs text-zinc-400">Scopes</div>
                  </div>
                  <div className="text-2xl font-bold text-zinc-50">
                    {data?.scopes_count || 0}
                  </div>
                </div>
                <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="w-4 h-4 text-zinc-400" />
                    <div className="text-xs text-zinc-400">Supplements</div>
                  </div>
                  <div className="text-2xl font-bold text-zinc-50">
                    {data?.supplements_count || 0}
                  </div>
                </div>
                <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
                  <div className="flex items-center gap-2 mb-2">
                    <MessageSquare className="w-4 h-4 text-zinc-400" />
                    <div className="text-xs text-zinc-400">Communications</div>
                  </div>
                  <div className="text-2xl font-bold text-zinc-50">
                    {data?.communications_count || 0}
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="damage" className="mt-4">
            <DamageDocumentationTab claimId={claim.id} jobId={jobId} />
          </TabsContent>

          <TabsContent value="scope" className="mt-4">
            <ScopeBuilderTab claimId={claim.id} jobId={jobId} />
          </TabsContent>

          <TabsContent value="supplements" className="mt-4">
            <SupplementsTab claimId={claim.id} jobId={jobId} />
          </TabsContent>

          <TabsContent value="communications" className="mt-4">
            <CommunicationsTab claimId={claim.id} jobId={jobId} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}



























