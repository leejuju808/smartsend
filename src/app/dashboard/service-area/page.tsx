"use client";

// Block 72000 — Service Area Mapping Page
// Main page for managing service areas and viewing heatmaps

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ServiceAreaMap } from "@/components/service-area/ServiceAreaMap";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/badge";
import {
  MapPin,
  Plus,
  Trash2,
  Edit,
  TrendingUp,
  Users,
  Target,
  AlertCircle,
} from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getActiveWorkspaceId } from "@/lib/workspace/context";

interface ServiceArea {
  id: string;
  name: string;
  center_lat: number;
  center_lng: number;
  radius_miles: number;
  is_primary: boolean;
  is_active: boolean;
  estimated_homeowner_count: number | null;
  created_at: string;
}

export default function ServiceAreaPage() {
  const router = useRouter();
  const [areas, setAreas] = useState<ServiceArea[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingArea, setEditingArea] = useState<ServiceArea | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formLat, setFormLat] = useState(47.6062);
  const [formLng, setFormLng] = useState(-122.3321);
  const [formRadius, setFormRadius] = useState(10);
  const [formIsPrimary, setFormIsPrimary] = useState(false);

  useEffect(() => {
    loadWorkspaceId();
  }, []);

  useEffect(() => {
    if (workspaceId) {
      loadServiceAreas();
    }
  }, [workspaceId]);

  const loadWorkspaceId = async () => {
    const wid = await getActiveWorkspaceId();
    setWorkspaceId(wid);
  };

  const loadServiceAreas = async () => {
    if (!workspaceId) return;

    setLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("service_areas")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("is_primary", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) throw error;
      setAreas(data || []);
    } catch (error) {
      console.error("Error loading service areas:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!workspaceId || !formName.trim()) return;

    try {
      const response = await fetch("/api/service-areas", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-workspace-id": workspaceId,
        },
        body: JSON.stringify({
          name: formName,
          center_lat: formLat,
          center_lng: formLng,
          radius_miles: formRadius,
          is_primary: formIsPrimary,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create service area");
      }

      // Reset form and reload
      setFormName("");
      setFormLat(47.6062);
      setFormLng(-122.3321);
      setFormRadius(10);
      setFormIsPrimary(false);
      setShowCreateForm(false);
      loadServiceAreas();
    } catch (error) {
      console.error("Error creating service area:", error);
      alert(error instanceof Error ? error.message : "Failed to create service area");
    }
  };

  const handleDelete = async (id: string) => {
    if (!workspaceId || !confirm("Are you sure you want to delete this service area?")) return;

    try {
      const response = await fetch(`/api/service-areas/${id}`, {
        method: "DELETE",
        headers: {
          "x-workspace-id": workspaceId,
        },
      });

      if (!response.ok) throw new Error("Failed to delete service area");

      loadServiceAreas();
    } catch (error) {
      console.error("Error deleting service area:", error);
      alert("Failed to delete service area");
    }
  };

  const handleEdit = (area: ServiceArea) => {
    setEditingArea(area);
    setFormName(area.name);
    setFormLat(area.center_lat);
    setFormLng(area.center_lng);
    setFormRadius(area.radius_miles);
    setFormIsPrimary(area.is_primary);
    setShowCreateForm(true);
  };

  const handleUpdate = async () => {
    if (!workspaceId || !editingArea || !formName.trim()) return;

    try {
      const response = await fetch(`/api/service-areas/${editingArea.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-workspace-id": workspaceId,
        },
        body: JSON.stringify({
          name: formName,
          center_lat: formLat,
          center_lng: formLng,
          radius_miles: formRadius,
          is_primary: formIsPrimary,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update service area");
      }

      // Reset form and reload
      setEditingArea(null);
      setFormName("");
      setFormLat(47.6062);
      setFormLng(-122.3321);
      setFormRadius(10);
      setFormIsPrimary(false);
      setShowCreateForm(false);
      loadServiceAreas();
    } catch (error) {
      console.error("Error updating service area:", error);
      alert(error instanceof Error ? error.message : "Failed to update service area");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading service areas...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Service Areas</h1>
          <p className="text-muted-foreground mt-1">
            Define your service radius to focus on profitable neighborhoods
          </p>
        </div>
        <Button
          onClick={() => {
            setEditingArea(null);
            setShowCreateForm(true);
          }}
          size="md"
        >
          <Plus className="h-4 w-4 mr-2" />
          Create Service Area
        </Button>
      </div>

      {/* Create/Edit Form */}
      {showCreateForm && (
        <Card>
          <CardHeader>
            <CardTitle>{editingArea ? "Edit Service Area" : "Create Service Area"}</CardTitle>
            <CardDescription>
              Set your service area center point and radius. Only leads within this area will be
              included in campaigns.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Service Area Name</label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g., Primary Zone, North Expansion"
              />
            </div>

            <ServiceAreaMap
              centerLat={formLat}
              centerLng={formLng}
              radiusMiles={formRadius}
              onLocationChange={(lat, lng) => {
                setFormLat(lat);
                setFormLng(lng);
              }}
              onRadiusChange={(radius) => setFormRadius(radius)}
              onSave={editingArea ? handleUpdate : handleCreate}
              isEditing={true}
            />

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is-primary"
                checked={formIsPrimary}
                onChange={(e) => setFormIsPrimary(e.target.checked)}
                className="h-4 w-4"
              />
              <label htmlFor="is-primary" className="text-sm font-medium">
                Set as primary service area
              </label>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={editingArea ? handleUpdate : handleCreate}
                disabled={!formName.trim()}
                className="flex-1"
              >
                {editingArea ? "Update" : "Create"} Service Area
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowCreateForm(false);
                  setEditingArea(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Service Areas List */}
      {!showCreateForm && (
        <div className="grid gap-4">
          {areas.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <MapPin className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No service areas yet</h3>
                <p className="text-muted-foreground text-center mb-4">
                  Create your first service area to start filtering leads by location
                </p>
                <Button onClick={() => setShowCreateForm(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Service Area
                </Button>
              </CardContent>
            </Card>
          ) : (
            areas.map((area) => (
              <Card key={area.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <CardTitle className="text-lg">{area.name}</CardTitle>
                      {area.is_primary && (
                        <Badge variant="default">Primary</Badge>
                      )}
                      {!area.is_active && (
                        <Badge variant="outline">Inactive</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEdit(area)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(area.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="flex items-center gap-2">
                      <Target className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <div className="text-sm font-medium">Radius</div>
                        <div className="text-sm text-muted-foreground">{area.radius_miles} miles</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <div className="text-sm font-medium">Location</div>
                        <div className="text-sm text-muted-foreground">
                          {area.center_lat.toFixed(4)}, {area.center_lng.toFixed(4)}
                        </div>
                      </div>
                    </div>
                    {area.estimated_homeowner_count && (
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <div className="text-sm font-medium">Estimated Reach</div>
                          <div className="text-sm text-muted-foreground">
                            {area.estimated_homeowner_count.toLocaleString()} homeowners
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Quick Map Preview */}
                  <div className="mt-4">
                    <ServiceAreaMap
                      centerLat={area.center_lat}
                      centerLng={area.center_lng}
                      radiusMiles={area.radius_miles}
                      isEditing={false}
                    />
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {/* Info Card */}
      {!showCreateForm && areas.length > 0 && (
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-blue-900 mb-1">
                  How Service Areas Work
                </h3>
                <p className="text-sm text-blue-800">
                  SmartSend will automatically filter leads based on your service areas. Only
                  homeowners within your defined radius will receive emails. This helps you focus
                  on profitable neighborhoods and avoid wasting time on leads that are too far away.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}



























