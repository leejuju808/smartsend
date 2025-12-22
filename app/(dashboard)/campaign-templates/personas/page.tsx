"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Edit, Trash2 } from "lucide-react";
import { toast } from "sonner";

type Persona = {
  id: string;
  name: string;
  description: string | null;
  voice_guidelines: string;
  example_phrases: string | null;
  is_global: boolean;
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function PersonasPage() {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    voice_guidelines: "",
    example_phrases: "",
  });

  const { data, error, mutate } = useSWR<{ personas: Persona[] }>(
    "/api/campaign-templates/personas",
    fetcher
  );

  const personas = data?.personas || [];

  const handleCreate = () => {
    setIsCreating(true);
    setFormData({
      name: "",
      description: "",
      voice_guidelines: "",
      example_phrases: "",
    });
  };

  const handleEdit = (persona: Persona) => {
    setEditingId(persona.id);
    setFormData({
      name: persona.name,
      description: persona.description || "",
      voice_guidelines: persona.voice_guidelines,
      example_phrases: persona.example_phrases || "",
    });
  };

  const handleSave = async () => {
    if (!formData.name || !formData.voice_guidelines) {
      toast.error("Name and voice guidelines are required");
      return;
    }

    try {
      const url = editingId
        ? `/api/campaign-templates/personas/${editingId}`
        : "/api/campaign-templates/personas";
      const method = editingId ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!response.ok) throw new Error("Failed to save persona");

      toast.success(editingId ? "Persona updated" : "Persona created");
      mutate();
      setIsCreating(false);
      setEditingId(null);
      setFormData({
        name: "",
        description: "",
        voice_guidelines: "",
        example_phrases: "",
      });
    } catch (error: any) {
      toast.error(error.message || "Failed to save persona");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this persona?")) return;

    try {
      const response = await fetch(`/api/campaign-templates/personas/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete persona");

      toast.success("Persona deleted");
      mutate();
    } catch (error: any) {
      toast.error(error.message || "Failed to delete persona");
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">AI Personas</h1>
          <p className="text-muted-foreground mt-2">
            Manage AI writing personas for email rewriting
          </p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="mr-2 h-4 w-4" />
          New Persona
        </Button>
      </div>

      {/* Create/Edit Form */}
      {(isCreating || editingId) && (
        <Card>
          <CardHeader>
            <CardTitle>{editingId ? "Edit Persona" : "Create New Persona"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Name</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Friendly Neighbor"
              />
            </div>
            <div>
              <Label>Description</Label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Brief description of this persona"
              />
            </div>
            <div>
              <Label>Voice Guidelines</Label>
              <Textarea
                value={formData.voice_guidelines}
                onChange={(e) => setFormData({ ...formData, voice_guidelines: e.target.value })}
                placeholder="Detailed instructions for how this persona should write..."
                rows={6}
              />
            </div>
            <div>
              <Label>Example Phrases (JSON array)</Label>
              <Textarea
                value={formData.example_phrases}
                onChange={(e) => setFormData({ ...formData, example_phrases: e.target.value })}
                placeholder='["Example phrase 1", "Example phrase 2"]'
                rows={3}
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSave}>Save</Button>
              <Button
                variant="outline"
                onClick={() => {
                  setIsCreating(false);
                  setEditingId(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {error && (
        <div className="text-red-500 p-4 bg-red-50 rounded-lg">
          Failed to load personas
        </div>
      )}

      {/* Personas Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {personas.map((persona) => (
          <Card key={persona.id}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <CardTitle className="text-lg">{persona.name}</CardTitle>
                {persona.is_global && (
                  <Badge variant="secondary">Global</Badge>
                )}
              </div>
              {persona.description && (
                <CardDescription>{persona.description}</CardDescription>
              )}
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div>
                  <div className="text-sm font-medium mb-1">Voice Guidelines:</div>
                  <p className="text-sm text-muted-foreground line-clamp-3">
                    {persona.voice_guidelines}
                  </p>
                </div>
                {!persona.is_global && (
                  <div className="flex gap-2 pt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleEdit(persona)}
                    >
                      <Edit className="h-4 w-4 mr-1" />
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDelete(persona.id)}
                      className="text-red-500"
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Delete
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}



























