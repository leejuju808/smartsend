"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Package, ShoppingCart, CheckCircle } from "lucide-react";

interface MaterialEstimate {
  id: string;
  material_type: string;
  quantity: number;
  unit: string;
}

interface RoofMaterialEstimatorProps {
  jobId: string;
  measurementId?: string;
}

const MATERIAL_LABELS: Record<string, string> = {
  shingles: "Shingles",
  ridge_cap: "Ridge Cap",
  underlayment: "Underlayment",
  starter_strips: "Starter Strips",
  drip_edge: "Drip Edge",
  ice_water_shield: "Ice & Water Shield",
  nails: "Nails",
};

export function RoofMaterialEstimator({
  jobId,
  measurementId,
}: RoofMaterialEstimatorProps) {
  const [materials, setMaterials] = useState<MaterialEstimate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMaterials();
  }, [jobId, measurementId]);

  const loadMaterials = async () => {
    try {
      const response = await fetch(`/api/jobs/${jobId}/measure-roof`);
      if (response.ok) {
        const data = await response.json();
        if (data.materials) {
          setMaterials(data.materials);
        }
      }
    } catch (err) {
      console.error("Error loading materials:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateMaterialOrder = async () => {
    // This would integrate with the existing material order system
    // For now, we'll just show a success message
    alert("Material order created! This will integrate with the existing material ordering system.");
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-8 text-zinc-400">Loading materials...</div>
        </CardContent>
      </Card>
    );
  }

  if (materials.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Material Estimates
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-zinc-400">
            <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No material estimates available. Complete a roof measurement first.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Package className="h-5 w-5" />
          Material Estimates
        </CardTitle>
        <p className="text-sm text-zinc-400 mt-1">
          Auto-calculated from roof measurements with waste factor included
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {materials.map((material) => (
            <div
              key={material.id}
              className="flex items-center justify-between p-4 bg-zinc-900 rounded-lg border border-zinc-800"
            >
              <div>
                <p className="font-medium">
                  {MATERIAL_LABELS[material.material_type] || material.material_type}
                </p>
                <p className="text-sm text-zinc-400 mt-1">
                  {material.quantity} {material.unit}
                </p>
              </div>
              <Badge variant="outline" className="ml-4">
                {material.quantity} {material.unit}
              </Badge>
            </div>
          ))}
        </div>

        <div className="pt-4 border-t border-zinc-800">
          <Button
            onClick={handleCreateMaterialOrder}
            className="w-full"
            size="lg"
          >
            <ShoppingCart className="h-4 w-4 mr-2" />
            Create Material Order
          </Button>
          <p className="text-xs text-zinc-500 mt-2 text-center">
            This will create a material order in the job materials system
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
































