"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const CATEGORIES = [
  "Outreach",
  "Follow-Ups",
  "Objections",
  "Intros",
  "Meeting Requests",
  "Other",
];

export default function NewTemplatePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [body, setBody] = useState("");
  const [shared, setShared] = useState(true);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim() || !body.trim()) {
      alert("Name and body are required");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/templates/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          category: category || null,
          body: body.trim(),
          shared,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        router.push(`/templates/${data.template.id}`);
      } else {
        const error = await res.json();
        alert(error.error || "Failed to create template");
      }
    } catch (error) {
      alert("Failed to create template");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-bold">New Template</h1>

      <Card>
        <CardHeader>
          <CardTitle>Template Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Cold Intro v1"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">Category (optional)</Label>
            <Input
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g., Outreach, Follow-Ups, Objections"
              list="categories"
            />
            <datalist id="categories">
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat} />
              ))}
            </datalist>
          </div>

          <div className="space-y-2">
            <Label htmlFor="body">Body</Label>
            <Textarea
              id="body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={12}
              placeholder={`Hi {{first_name}},\n\nI noticed {{company}} is growing fast.\n\nWe help SMBs book more demos with a done-for-you inbox.\n\nWorth a quick chat this week?\n\n– {{your_name}}`}
              className="font-mono text-sm"
            />
            <p className="text-xs text-gray-500">
              Available variables: {`{{first_name}}, {{last_name}}, {{company}}, {{email}}, {{your_name}}, {{your_company}}`}
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <Switch
              id="shared"
              checked={shared}
              onCheckedChange={setShared}
            />
            <Label htmlFor="shared">Shared with team</Label>
          </div>

          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save Template"}
            </Button>
            <Button
              variant="outline"
              onClick={() => router.back()}
              disabled={saving}
            >
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}










