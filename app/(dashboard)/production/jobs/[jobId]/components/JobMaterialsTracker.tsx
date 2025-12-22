"use client";

import { useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Package, Plus, CheckCircle, Clock } from "lucide-react";
import { format } from "date-fns";

interface JobMaterialsTrackerProps {
  jobId: string;
  materials: Array<{
    id: string;
    supplier: string | null;
    material_type: string | null;
    ordered_at: string | null;
    eta: string | null;
    delivered: boolean;
    notes: string | null;
  }>;
}

export function JobMaterialsTracker({ jobId, materials: initialMaterials }: JobMaterialsTrackerProps) {
  const supabase = createClientComponentClient();
  const [materials, setMaterials] = useState(initialMaterials);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    supplier: '',
    material_type: '',
    ordered_at: '',
    eta: '',
    notes: '',
  });

  const handleAddMaterial = async () => {
    try {
      const { data, error } = await supabase
        .from('job_materials')
        .insert({
          job_id: jobId,
          supplier: formData.supplier || null,
          material_type: formData.material_type || null,
          ordered_at: formData.ordered_at || null,
          eta: formData.eta || null,
          notes: formData.notes || null,
        })
        .select()
        .single();

      if (error) throw error;

      setMaterials([...materials, data]);
      setFormData({
        supplier: '',
        material_type: '',
        ordered_at: '',
        eta: '',
        notes: '',
      });
      setShowForm(false);
    } catch (error) {
      console.error('Error adding material:', error);
      alert('Failed to add material. Please try again.');
    }
  };

  const handleToggleDelivered = async (materialId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('job_materials')
        .update({ delivered: !currentStatus })
        .eq('id', materialId);

      if (error) throw error;

      setMaterials(materials.map(m => 
        m.id === materialId ? { ...m, delivered: !currentStatus } : m
      ));
    } catch (error) {
      console.error('Error updating material:', error);
      alert('Failed to update material status. Please try again.');
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Materials Tracker
          </CardTitle>
          <Button onClick={() => setShowForm(!showForm)} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Add Material
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {showForm && (
          <div className="p-4 border rounded-lg space-y-3">
            <input
              type="text"
              placeholder="Supplier"
              value={formData.supplier}
              onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
              className="w-full px-3 py-2 border rounded-md text-sm"
            />
            <input
              type="text"
              placeholder="Material Type"
              value={formData.material_type}
              onChange={(e) => setFormData({ ...formData, material_type: e.target.value })}
              className="w-full px-3 py-2 border rounded-md text-sm"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                placeholder="Ordered Date"
                value={formData.ordered_at}
                onChange={(e) => setFormData({ ...formData, ordered_at: e.target.value })}
                className="px-3 py-2 border rounded-md text-sm"
              />
              <input
                type="date"
                placeholder="ETA"
                value={formData.eta}
                onChange={(e) => setFormData({ ...formData, eta: e.target.value })}
                className="px-3 py-2 border rounded-md text-sm"
              />
            </div>
            <textarea
              placeholder="Notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="w-full px-3 py-2 border rounded-md text-sm"
              rows={2}
            />
            <div className="flex gap-2">
              <Button onClick={handleAddMaterial} size="sm">Add</Button>
              <Button onClick={() => setShowForm(false)} variant="outline" size="sm">Cancel</Button>
            </div>
          </div>
        )}

        {materials.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No materials tracked yet.
          </p>
        ) : (
          <div className="space-y-3">
            {materials.map((material) => (
              <div
                key={material.id}
                className="p-4 border rounded-lg flex items-start justify-between"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <p className="font-medium">{material.material_type || 'Unknown Material'}</p>
                    <Badge variant={material.delivered ? "default" : "secondary"}>
                      {material.delivered ? (
                        <>
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Delivered
                        </>
                      ) : (
                        <>
                          <Clock className="h-3 w-3 mr-1" />
                          Pending
                        </>
                      )}
                    </Badge>
                  </div>
                  {material.supplier && (
                    <p className="text-sm text-muted-foreground">Supplier: {material.supplier}</p>
                  )}
                  <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                    {material.ordered_at && (
                      <span>Ordered: {format(new Date(material.ordered_at), 'MMM d, yyyy')}</span>
                    )}
                    {material.eta && (
                      <span>ETA: {format(new Date(material.eta), 'MMM d, yyyy')}</span>
                    )}
                  </div>
                  {material.notes && (
                    <p className="text-sm text-muted-foreground mt-2">{material.notes}</p>
                  )}
                </div>
                <Button
                  onClick={() => handleToggleDelivered(material.id, material.delivered)}
                  variant="outline"
                  size="sm"
                >
                  {material.delivered ? 'Mark Pending' : 'Mark Delivered'}
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}


































