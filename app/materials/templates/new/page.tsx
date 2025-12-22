"use client";

// Block 89000 — Create New Material Template

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, X } from "lucide-react";

type TemplateItem = {
  item_name: string;
  unit: string;
  quantity_per_sq: number;
  cost_per_unit: number | null;
};

export default function NewTemplatePage() {
  const router = useRouter();
  const [teams, setTeams] = useState<any[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const [name, setName] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [shingleLine, setShingleLine] = useState("");
  const [wasteFactor, setWasteFactor] = useState("10");
  const [roofType, setRoofType] = useState("");
  const [color, setColor] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<TemplateItem[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadTeams();
  }, []);

  const loadTeams = async () => {
    try {
      const res = await fetch("/api/teams");
      if (res.ok) {
        const json = await res.json();
        setTeams(json.teams || []);
        if (json.teams && json.teams.length > 0) {
          setSelectedTeamId(json.teams[0].id);
        }
      }
    } catch (error) {
      console.error("Error loading teams:", error);
    }
  };

  const addItem = () => {
    setItems([
      ...items,
      {
        item_name: "",
        unit: "bundle",
        quantity_per_sq: 0,
        cost_per_unit: null,
      },
    ]);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: keyof TemplateItem, value: any) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };

  const handleSave = async () => {
    if (!selectedTeamId || !name) {
      alert("Please select a team and enter a template name");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/materials/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          team_id: selectedTeamId,
          name,
          manufacturer: manufacturer || null,
          shingle_line: shingleLine || null,
          waste_factor: parseFloat(wasteFactor) / 100,
          roof_type: roofType || null,
          color: color || null,
          notes: notes || null,
          items: items.filter(
            (item) => item.item_name && item.quantity_per_sq > 0
          ),
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to create template");
      }

      router.push("/materials/templates");
    } catch (error: any) {
      console.error("Error creating template:", error);
      alert(error.message || "Failed to create template");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Create Material Template</h1>
        <p className="text-gray-600 mt-1">
          Create a reusable template for material calculations
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Template Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Team</label>
            <select
              value={selectedTeamId}
              onChange={(e) => setSelectedTeamId(e.target.value)}
              className="w-full p-2 border rounded"
            >
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Template Name *
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., 30 sq Architectural Roof"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Manufacturer</label>
              <Input
                value={manufacturer}
                onChange={(e) => setManufacturer(e.target.value)}
                placeholder="e.g., GAF, Owens Corning"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Shingle Line</label>
              <Input
                value={shingleLine}
                onChange={(e) => setShingleLine(e.target.value)}
                placeholder="e.g., Timberline HD"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Waste Factor (%)</label>
              <Input
                type="number"
                value={wasteFactor}
                onChange={(e) => setWasteFactor(e.target.value)}
                placeholder="10"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Roof Type</label>
              <Input
                value={roofType}
                onChange={(e) => setRoofType(e.target.value)}
                placeholder="e.g., architectural"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Color</label>
              <Input
                value={color}
                onChange={(e) => setColor(e.target.value)}
                placeholder="e.g., Weathered Wood"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full p-2 border rounded"
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex justify-between items-center">
          <CardTitle>Material Items</CardTitle>
          <Button onClick={addItem} size="sm">
            <Plus className="w-4 h-4 mr-2" />
            Add Item
          </Button>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>No items added yet. Click "Add Item" to get started.</p>
              <p className="text-sm mt-2">
                Or leave empty to use default items (Shingles, Ridge Cap, Underlayment, etc.)
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {items.map((item, index) => (
                <div key={index} className="flex gap-2 items-end p-4 border rounded-lg">
                  <div className="flex-1">
                    <label className="block text-xs font-medium mb-1">Item Name</label>
                    <Input
                      value={item.item_name}
                      onChange={(e) =>
                        updateItem(index, "item_name", e.target.value)
                      }
                      placeholder="e.g., Shingles - Architectural"
                    />
                  </div>
                  <div className="w-32">
                    <label className="block text-xs font-medium mb-1">Unit</label>
                    <select
                      value={item.unit}
                      onChange={(e) => updateItem(index, "unit", e.target.value)}
                      className="w-full p-2 border rounded"
                    >
                      <option value="bundle">Bundle</option>
                      <option value="roll">Roll</option>
                      <option value="piece">Piece</option>
                      <option value="linear_feet">Linear Feet</option>
                      <option value="box">Box</option>
                      <option value="each">Each</option>
                    </select>
                  </div>
                  <div className="w-32">
                    <label className="block text-xs font-medium mb-1">
                      Qty per Sq
                    </label>
                    <Input
                      type="number"
                      step="0.1"
                      value={item.quantity_per_sq}
                      onChange={(e) =>
                        updateItem(
                          index,
                          "quantity_per_sq",
                          parseFloat(e.target.value) || 0
                        )
                      }
                    />
                  </div>
                  <div className="w-32">
                    <label className="block text-xs font-medium mb-1">
                      Cost/Unit ($)
                    </label>
                    <Input
                      type="number"
                      step="0.01"
                      value={item.cost_per_unit || ""}
                      onChange={(e) =>
                        updateItem(
                          index,
                          "cost_per_unit",
                          e.target.value ? parseFloat(e.target.value) : null
                        )
                      }
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => removeItem(index)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Create Template"}
        </Button>
      </div>
    </div>
  );
}



























