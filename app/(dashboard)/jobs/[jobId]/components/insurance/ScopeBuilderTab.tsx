// Block 91000 — Scope Builder Tab
// Auto-generate and edit insurance scopes with line items

"use client";

import { useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  FileText,
  Sparkles,
  Edit,
  Trash2,
  Download,
  Calculator,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
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

interface ScopeLineItem {
  id?: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total: number;
  category?: string;
}

interface InsuranceScope {
  id: string;
  claim_id: string;
  scope_json: ScopeLineItem[];
  subtotal: number;
  tax: number;
  total: number;
  rc_value: number;
  acv_value: number;
  depreciation: number;
  is_auto_generated: boolean;
  created_at: string;
}

export function ScopeBuilderTab({
  claimId,
  jobId,
}: {
  claimId: string;
  jobId: string;
}) {
  const [isGenerateDialogOpen, setIsGenerateDialogOpen] = useState(false);
  const { data, error, mutate } = useSWR<InsuranceScope[]>(
    `/api/jobs/${jobId}/insurance/scopes?claimId=${claimId}`,
    fetcher
  );

  const scopes = data || [];
  const latestScope = scopes[0]; // Most recent scope

  const handleGenerateScope = async () => {
    const response = await fetch(`/api/jobs/${jobId}/insurance/scopes/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ claim_id: claimId }),
    });

    if (response.ok) {
      mutate();
      setIsGenerateDialogOpen(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-zinc-50">Insurance Scope</h3>
          <p className="text-xs text-zinc-400 mt-1">
            Auto-generate or manually create insurance scope with line items
          </p>
        </div>
        <div className="flex gap-2">
          <Dialog open={isGenerateDialogOpen} onOpenChange={setIsGenerateDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="border-zinc-700">
                <Sparkles className="w-4 h-4 mr-2" />
                Auto-Generate
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-zinc-900 border-zinc-800">
              <DialogHeader>
                <DialogTitle className="text-zinc-50">Generate Scope</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <p className="text-sm text-zinc-400">
                  SmartSend will analyze damage items and generate a complete insurance
                  scope with line items, pricing, and calculations.
                </p>
                <Button
                  onClick={handleGenerateScope}
                  className="w-full bg-blue-600 hover:bg-blue-700"
                >
                  Generate Scope
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <Button className="bg-blue-600 hover:bg-blue-700">
            <Plus className="w-4 h-4 mr-2" />
            Create Manual
          </Button>
        </div>
      </div>

      {!latestScope ? (
        <Card className="border-zinc-800 bg-zinc-900">
          <CardContent className="p-8 text-center">
            <FileText className="w-12 h-12 mx-auto text-zinc-600 mb-4" />
            <p className="text-sm text-zinc-400 mb-4">
              No scope created yet. Generate one automatically or create manually.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <Card className="border-zinc-800 bg-zinc-900">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm text-zinc-50">Scope Details</CardTitle>
                {latestScope.is_auto_generated && (
                  <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20">
                    Auto-Generated
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <ScopeLineItemsList
                scope={latestScope}
                jobId={jobId}
                onUpdate={mutate}
              />
            </CardContent>
          </Card>

          {/* Financial Summary */}
          <Card className="border-zinc-800 bg-zinc-900">
            <CardHeader>
              <CardTitle className="text-sm text-zinc-50">Financial Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-400">Subtotal</span>
                  <span className="text-zinc-50 font-semibold">
                    {formatCurrency(latestScope.subtotal || 0)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-400">Tax</span>
                  <span className="text-zinc-50 font-semibold">
                    {formatCurrency(latestScope.tax || 0)}
                  </span>
                </div>
                <div className="flex justify-between text-sm border-t border-zinc-800 pt-3">
                  <span className="text-zinc-50 font-semibold">Total</span>
                  <span className="text-zinc-50 font-bold text-lg">
                    {formatCurrency(latestScope.total || 0)}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-4 pt-3 border-t border-zinc-800">
                  <div>
                    <div className="text-xs text-zinc-400 mb-1">RC Value</div>
                    <div className="text-sm font-semibold text-zinc-50">
                      {formatCurrency(latestScope.rc_value || 0)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-400 mb-1">ACV Value</div>
                    <div className="text-sm font-semibold text-zinc-50">
                      {formatCurrency(latestScope.acv_value || 0)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-400 mb-1">Depreciation</div>
                    <div className="text-sm font-semibold text-zinc-50">
                      {formatCurrency(latestScope.depreciation || 0)}
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function ScopeLineItemsList({
  scope,
  jobId,
  onUpdate,
}: {
  scope: InsuranceScope;
  jobId: string;
  onUpdate: () => void;
}) {
  const lineItems: ScopeLineItem[] = Array.isArray(scope.scope_json)
    ? scope.scope_json
    : [];

  const handleUpdateLineItem = async (item: ScopeLineItem, index: number) => {
    const updatedItems = [...lineItems];
    updatedItems[index] = item;
    updatedItems[index].total = item.quantity * item.unit_price;

    await fetch(`/api/jobs/${jobId}/insurance/scopes/${scope.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scope_json: updatedItems,
      }),
    });

    onUpdate();
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-6 gap-2 text-xs font-semibold text-zinc-400 pb-2 border-b border-zinc-800">
        <div>Description</div>
        <div>Qty</div>
        <div>Unit</div>
        <div>Unit Price</div>
        <div>Total</div>
        <div></div>
      </div>
      {lineItems.map((item, index) => (
        <ScopeLineItemRow
          key={index}
          item={item}
          index={index}
          onUpdate={(updated) => handleUpdateLineItem(updated, index)}
        />
      ))}
      {lineItems.length === 0 && (
        <div className="text-center py-8 text-sm text-zinc-400">
          No line items yet. Add items to build your scope.
        </div>
      )}
    </div>
  );
}

function ScopeLineItemRow({
  item,
  index,
  onUpdate,
}: {
  item: ScopeLineItem;
  index: number;
  onUpdate: (item: ScopeLineItem) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState(item);

  if (isEditing) {
    return (
      <div className="grid grid-cols-6 gap-2 items-center p-2 bg-zinc-800 rounded">
        <Input
          value={editData.description}
          onChange={(e) =>
            setEditData({ ...editData, description: e.target.value })
          }
          className="bg-zinc-900 border-zinc-700 text-xs"
          placeholder="Description"
        />
        <Input
          type="number"
          value={editData.quantity}
          onChange={(e) =>
            setEditData({
              ...editData,
              quantity: parseFloat(e.target.value) || 0,
            })
          }
          className="bg-zinc-900 border-zinc-700 text-xs"
        />
        <Input
          value={editData.unit}
          onChange={(e) => setEditData({ ...editData, unit: e.target.value })}
          className="bg-zinc-900 border-zinc-700 text-xs"
        />
        <Input
          type="number"
          value={editData.unit_price}
          onChange={(e) =>
            setEditData({
              ...editData,
              unit_price: parseFloat(e.target.value) || 0,
            })
          }
          className="bg-zinc-900 border-zinc-700 text-xs"
        />
        <div className="text-xs text-zinc-50">
          {formatCurrency((editData.quantity || 0) * (editData.unit_price || 0))}
        </div>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              onUpdate(editData);
              setIsEditing(false);
            }}
          >
            ✓
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setIsEditing(false)}
          >
            ✕
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-6 gap-2 items-center p-2 bg-zinc-800 rounded text-xs">
      <div className="text-zinc-50">{item.description}</div>
      <div className="text-zinc-400">{item.quantity}</div>
      <div className="text-zinc-400">{item.unit}</div>
      <div className="text-zinc-400">{formatCurrency(item.unit_price || 0)}</div>
      <div className="text-zinc-50 font-semibold">
        {formatCurrency(item.total || 0)}
      </div>
      <div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setIsEditing(true)}
        >
          <Edit className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
}



























