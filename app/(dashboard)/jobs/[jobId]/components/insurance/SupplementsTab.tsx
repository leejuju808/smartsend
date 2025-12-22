// Block 91000 — Supplements Tab
// Supplement opportunities detector and supplement builder

"use client";

import { useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Clock,
  XCircle,
  FileText,
  Sparkles,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Supplement {
  id: string;
  claim_id: string;
  reason: string;
  amount: number;
  documentation: {
    photos?: string[];
    explanation?: string;
    line_items?: any[];
  };
  status: "pending" | "submitted" | "approved" | "denied";
  submitted_at: string | null;
  approved_at: string | null;
  denied_at: string | null;
  denial_reason: string | null;
  created_at: string;
}

interface SupplementOpportunity {
  type: string;
  description: string;
  estimated_amount: number;
  reason: string;
}

export function SupplementsTab({
  claimId,
  jobId,
}: {
  claimId: string;
  jobId: string;
}) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { data, error, mutate } = useSWR<Supplement[]>(
    `/api/jobs/${jobId}/insurance/supplements?claimId=${claimId}`,
    fetcher
  );

  const { data: opportunities } = useSWR<SupplementOpportunity[]>(
    `/api/jobs/${jobId}/insurance/supplements/opportunities?claimId=${claimId}`,
    fetcher
  );

  const supplements = data || [];
  const supplementOpportunities = opportunities || [];

  const getStatusColor = (status: string) => {
    switch (status) {
      case "approved":
        return "bg-green-500/10 text-green-400 border-green-500/20";
      case "submitted":
        return "bg-blue-500/10 text-blue-400 border-blue-500/20";
      case "pending":
        return "bg-yellow-500/10 text-yellow-400 border-yellow-500/20";
      case "denied":
        return "bg-red-500/10 text-red-400 border-red-500/20";
      default:
        return "bg-gray-500/10 text-gray-400 border-gray-500/20";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "approved":
        return <CheckCircle className="w-4 h-4" />;
      case "submitted":
        return <Clock className="w-4 h-4" />;
      case "pending":
        return <AlertCircle className="w-4 h-4" />;
      case "denied":
        return <XCircle className="w-4 h-4" />;
      default:
        return null;
    }
  };

  const totalPending = supplements
    .filter((s) => s.status === "pending")
    .reduce((sum, s) => sum + (s.amount || 0), 0);
  const totalApproved = supplements
    .filter((s) => s.status === "approved")
    .reduce((sum, s) => sum + (s.amount || 0), 0);

  return (
    <div className="space-y-4">
      {/* Supplement Opportunities */}
      {supplementOpportunities.length > 0 && (
        <Card className="border-zinc-800 bg-zinc-900">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm text-zinc-50 flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                Supplement Opportunities
              </CardTitle>
              <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20">
                {supplementOpportunities.length} detected
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {supplementOpportunities.map((opp, idx) => (
                <div
                  key={idx}
                  className="flex items-start justify-between p-3 bg-zinc-800 rounded border border-zinc-700"
                >
                  <div className="flex-1">
                    <div className="font-semibold text-zinc-50 mb-1">
                      {opp.description}
                    </div>
                    <div className="text-xs text-zinc-400 mb-2">{opp.reason}</div>
                    <div className="text-sm font-semibold text-green-400">
                      Estimated: {formatCurrency(opp.estimated_amount)}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      // Auto-populate supplement form with opportunity data
                      setIsDialogOpen(true);
                    }}
                    className="border-zinc-700"
                  >
                    Add Supplement
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="border-zinc-800 bg-zinc-900">
          <CardContent className="p-4">
            <div className="text-xs text-zinc-400 mb-1">Total Supplements</div>
            <div className="text-2xl font-bold text-zinc-50">
              {supplements.length}
            </div>
          </CardContent>
        </Card>
        <Card className="border-zinc-800 bg-zinc-900">
          <CardContent className="p-4">
            <div className="text-xs text-zinc-400 mb-1">Pending</div>
            <div className="text-2xl font-bold text-yellow-400">
              {formatCurrency(totalPending)}
            </div>
          </CardContent>
        </Card>
        <Card className="border-zinc-800 bg-zinc-900">
          <CardContent className="p-4">
            <div className="text-xs text-zinc-400 mb-1">Approved</div>
            <div className="text-2xl font-bold text-green-400">
              {formatCurrency(totalApproved)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Add Supplement Button */}
      <div className="flex justify-end">
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-blue-600 hover:bg-blue-700">
              <Plus className="w-4 h-4 mr-2" />
              Add Supplement
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-zinc-900 border-zinc-800 max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-zinc-50">Add Supplement Request</DialogTitle>
            </DialogHeader>
            <SupplementForm
              claimId={claimId}
              jobId={jobId}
              onSuccess={() => {
                setIsDialogOpen(false);
                mutate();
              }}
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* Supplements List */}
      {supplements.length === 0 ? (
        <Card className="border-zinc-800 bg-zinc-900">
          <CardContent className="p-8 text-center">
            <TrendingUp className="w-12 h-12 mx-auto text-zinc-600 mb-4" />
            <p className="text-sm text-zinc-400">
              No supplements created yet. Add your first supplement request.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {supplements.map((supplement) => (
            <Card key={supplement.id} className="border-zinc-800 bg-zinc-900">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-semibold text-zinc-50">
                        {formatCurrency(supplement.amount)}
                      </span>
                      <Badge className={getStatusColor(supplement.status)}>
                        <span className="flex items-center gap-1">
                          {getStatusIcon(supplement.status)}
                          {supplement.status}
                        </span>
                      </Badge>
                    </div>
                    <p className="text-sm text-zinc-300 mb-2">{supplement.reason}</p>
                    {supplement.documentation?.explanation && (
                      <p className="text-xs text-zinc-400">
                        {supplement.documentation.explanation}
                      </p>
                    )}
                    {supplement.denial_reason && (
                      <div className="mt-2 p-2 bg-red-500/10 border border-red-500/20 rounded text-xs text-red-400">
                        Denied: {supplement.denial_reason}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs text-zinc-400">
                  {supplement.submitted_at && (
                    <span>Submitted: {format(new Date(supplement.submitted_at), "MMM d, yyyy")}</span>
                  )}
                  {supplement.approved_at && (
                    <span className="text-green-400">
                      Approved: {format(new Date(supplement.approved_at), "MMM d, yyyy")}
                    </span>
                  )}
                  {supplement.denied_at && (
                    <span className="text-red-400">
                      Denied: {format(new Date(supplement.denied_at), "MMM d, yyyy")}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function SupplementForm({
  claimId,
  jobId,
  onSuccess,
}: {
  claimId: string;
  jobId: string;
  onSuccess: () => void;
}) {
  const [formData, setFormData] = useState({
    reason: "",
    amount: "",
    explanation: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const response = await fetch(`/api/jobs/${jobId}/insurance/supplements`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        claim_id: claimId,
        reason: formData.reason,
        amount: parseFloat(formData.amount) || 0,
        documentation: {
          explanation: formData.explanation,
        },
      }),
    });

    if (response.ok) {
      onSuccess();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label className="text-zinc-300">Reason for Supplement</Label>
        <Input
          value={formData.reason}
          onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
          className="bg-zinc-800 border-zinc-700"
          placeholder="e.g., Additional decking replacement needed"
          required
        />
      </div>

      <div>
        <Label className="text-zinc-300">Amount</Label>
        <Input
          type="number"
          step="0.01"
          value={formData.amount}
          onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
          className="bg-zinc-800 border-zinc-700"
          required
        />
      </div>

      <div>
        <Label className="text-zinc-300">Explanation</Label>
        <Textarea
          value={formData.explanation}
          onChange={(e) => setFormData({ ...formData, explanation: e.target.value })}
          className="bg-zinc-800 border-zinc-700"
          rows={4}
          placeholder="Detailed explanation for the adjuster..."
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onSuccess}
          className="border-zinc-700"
        >
          Cancel
        </Button>
        <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
          Create Supplement
        </Button>
      </div>
    </form>
  );
}



























