// Block 91000 — Damage Documentation Tab
// Component for documenting damage items from inspection

"use client";

import { useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Camera,
  Trash2,
  Edit,
  CheckCircle,
  AlertTriangle,
  XCircle,
} from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface DamageItem {
  id: string;
  claim_id: string;
  item_type: string;
  severity: string;
  quantity: number;
  unit: string;
  photos: string[];
  notes: string;
  location_description: string;
  created_at: string;
}

export function DamageDocumentationTab({
  claimId,
  jobId,
}: {
  claimId: string;
  jobId: string;
}) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { data, error, mutate } = useSWR<DamageItem[]>(
    `/api/jobs/${jobId}/insurance/damage-items?claimId=${claimId}`,
    fetcher
  );

  const damageItems = data || [];

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical":
        return "bg-red-500/10 text-red-400 border-red-500/20";
      case "severe":
        return "bg-orange-500/10 text-orange-400 border-orange-500/20";
      case "moderate":
        return "bg-yellow-500/10 text-yellow-400 border-yellow-500/20";
      case "minor":
        return "bg-blue-500/10 text-blue-400 border-blue-500/20";
      default:
        return "bg-gray-500/10 text-gray-400 border-gray-500/20";
    }
  };

  const getItemTypeLabel = (type: string) => {
    return type
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-zinc-50">Damage Documentation</h3>
          <p className="text-xs text-zinc-400 mt-1">
            Document all damage found during inspection
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-blue-600 hover:bg-blue-700">
              <Plus className="w-4 h-4 mr-2" />
              Add Damage Item
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-zinc-900 border-zinc-800 max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-zinc-50">Add Damage Item</DialogTitle>
            </DialogHeader>
            <DamageItemForm
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

      {damageItems.length === 0 ? (
        <Card className="border-zinc-800 bg-zinc-900">
          <CardContent className="p-8 text-center">
            <Camera className="w-12 h-12 mx-auto text-zinc-600 mb-4" />
            <p className="text-sm text-zinc-400">
              No damage items documented yet. Add your first damage item to get started.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {damageItems.map((item) => (
            <Card key={item.id} className="border-zinc-800 bg-zinc-900">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-semibold text-zinc-50">
                        {getItemTypeLabel(item.item_type)}
                      </span>
                      <Badge className={getSeverityColor(item.severity || "minor")}>
                        {item.severity || "minor"}
                      </Badge>
                      <span className="text-sm text-zinc-400">
                        {item.quantity} {item.unit}
                      </span>
                    </div>
                    {item.location_description && (
                      <p className="text-sm text-zinc-400 mb-2">
                        {item.location_description}
                      </p>
                    )}
                    {item.notes && (
                      <p className="text-sm text-zinc-300">{item.notes}</p>
                    )}
                    {item.photos && item.photos.length > 0 && (
                      <div className="mt-3 flex gap-2 flex-wrap">
                        {item.photos.map((photo, idx) => (
                          <img
                            key={idx}
                            src={photo}
                            alt={`Damage photo ${idx + 1}`}
                            className="w-20 h-20 object-cover rounded border border-zinc-800"
                          />
                        ))}
                      </div>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      if (confirm("Delete this damage item?")) {
                        await fetch(
                          `/api/jobs/${jobId}/insurance/damage-items/${item.id}`,
                          { method: "DELETE" }
                        );
                        mutate();
                      }
                    }}
                  >
                    <Trash2 className="w-4 h-4 text-red-400" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function DamageItemForm({
  claimId,
  jobId,
  onSuccess,
}: {
  claimId: string;
  jobId: string;
  onSuccess: () => void;
}) {
  const [formData, setFormData] = useState({
    item_type: "",
    severity: "moderate",
    quantity: "",
    unit: "sq",
    location_description: "",
    notes: "",
    photos: [] as string[],
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const response = await fetch(`/api/jobs/${jobId}/insurance/damage-items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        claim_id: claimId,
        ...formData,
        quantity: parseFloat(formData.quantity) || 0,
      }),
    });

    if (response.ok) {
      onSuccess();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="text-zinc-300">Damage Type</Label>
          <Select
            value={formData.item_type}
            onValueChange={(value) =>
              setFormData({ ...formData, item_type: value })
            }
          >
            <SelectTrigger className="bg-zinc-800 border-zinc-700">
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="shingles">Shingles</SelectItem>
              <SelectItem value="flashing">Flashing</SelectItem>
              <SelectItem value="ridge">Ridge</SelectItem>
              <SelectItem value="decking">Decking</SelectItem>
              <SelectItem value="soft_metal">Soft Metal</SelectItem>
              <SelectItem value="ice_water">Ice & Water Shield</SelectItem>
              <SelectItem value="chimney">Chimney</SelectItem>
              <SelectItem value="drip_edge">Drip Edge</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-zinc-300">Severity</Label>
          <Select
            value={formData.severity}
            onValueChange={(value) =>
              setFormData({ ...formData, severity: value })
            }
          >
            <SelectTrigger className="bg-zinc-800 border-zinc-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="minor">Minor</SelectItem>
              <SelectItem value="moderate">Moderate</SelectItem>
              <SelectItem value="severe">Severe</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="text-zinc-300">Quantity</Label>
          <Input
            type="number"
            step="0.01"
            value={formData.quantity}
            onChange={(e) =>
              setFormData({ ...formData, quantity: e.target.value })
            }
            className="bg-zinc-800 border-zinc-700"
            required
          />
        </div>

        <div>
          <Label className="text-zinc-300">Unit</Label>
          <Select
            value={formData.unit}
            onValueChange={(value) =>
              setFormData({ ...formData, unit: value })
            }
          >
            <SelectTrigger className="bg-zinc-800 border-zinc-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sq">Square (sq)</SelectItem>
              <SelectItem value="lnft">Linear Feet (lnft)</SelectItem>
              <SelectItem value="ea">Each (ea)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label className="text-zinc-300">Location Description</Label>
        <Input
          value={formData.location_description}
          onChange={(e) =>
            setFormData({ ...formData, location_description: e.target.value })
          }
          className="bg-zinc-800 border-zinc-700"
          placeholder="e.g., North side, upper section"
        />
      </div>

      <div>
        <Label className="text-zinc-300">Notes</Label>
        <Textarea
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          className="bg-zinc-800 border-zinc-700"
          rows={3}
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
          Add Damage Item
        </Button>
      </div>
    </form>
  );
}



























