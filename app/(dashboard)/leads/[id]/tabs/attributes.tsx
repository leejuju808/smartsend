"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import useSWR from "swr";
import { useParams } from "next/navigation";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function AttributesTab({ lead }: { lead: any }) {
  const params = useParams();
  const leadId = params.id as string;
  const { mutate } = useSWR(`/api/leads/${leadId}`, fetcher);

  const [editing, setEditing] = useState<string | null>(null);
  const [values, setValues] = useState({
    email: lead.email || "",
    first_name: lead.first_name || "",
    last_name: lead.last_name || "",
    company: lead.company || "",
    phone: lead.phone || "",
    title: lead.title || "",
    website: lead.website || "",
    linkedin: lead.linkedin || "",
  });

  const handleSave = async (field: string) => {
    const updateData: Record<string, any> = {};
    updateData[field] = values[field as keyof typeof values];

    const res = await fetch(`/api/leads/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updateData),
    });

    if (res.ok) {
      setEditing(null);
      mutate();
    } else {
      const error = await res.json();
      alert(error.error || "Failed to update");
    }
  };

  const handleCancel = () => {
    setValues({
      email: lead.email || "",
      first_name: lead.first_name || "",
      last_name: lead.last_name || "",
      company: lead.company || "",
      phone: lead.phone || "",
      title: lead.title || "",
      website: lead.website || "",
      linkedin: lead.linkedin || "",
    });
    setEditing(null);
  };

  const fields = [
    { key: "email", label: "Email", type: "email" },
    { key: "first_name", label: "First Name", type: "text" },
    { key: "last_name", label: "Last Name", type: "text" },
    { key: "company", label: "Company", type: "text" },
    { key: "title", label: "Title", type: "text" },
    { key: "phone", label: "Phone", type: "tel" },
    { key: "website", label: "Website", type: "url" },
    { key: "linkedin", label: "LinkedIn", type: "url" },
  ];

  return (
    <div className="mt-4 space-y-4">
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">Lead Attributes</h2>
        <div className="space-y-4">
          {fields.map((field) => (
            <div key={field.key}>
              <label className="text-sm font-medium text-muted-foreground mb-1 block">
                {field.label}
              </label>
              {editing === field.key ? (
                <div className="flex gap-2">
                  <Input
                    type={field.type}
                    value={values[field.key as keyof typeof values]}
                    onChange={(e) =>
                      setValues({ ...values, [field.key]: e.target.value })
                    }
                    className="flex-1"
                  />
                  <Button
                    size="sm"
                    onClick={() => handleSave(field.key)}
                  >
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleCancel}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-between p-2 rounded border">
                  <span className="text-sm">
                    {values[field.key as keyof typeof values] || (
                      <span className="text-muted-foreground">Not set</span>
                    )}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditing(field.key)}
                  >
                    Edit
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}



