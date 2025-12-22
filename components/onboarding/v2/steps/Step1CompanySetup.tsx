"use client";

// Block 16800 — Step 1: Company Setup
// Company name, city, service areas, logo, owner name

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, Building2 } from "lucide-react";

interface Step1Data {
  company_name: string;
  company_city: string;
  service_areas: string[];
  owner_name: string;
  logo_url?: string;
}

export function OnboardingStep1({
  onComplete,
}: {
  onComplete: (data: Step1Data) => void;
}) {
  const [formData, setFormData] = useState<Step1Data>({
    company_name: "",
    company_city: "",
    service_areas: [],
    owner_name: "",
  });
  const [serviceAreaInput, setServiceAreaInput] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Update progress
      await fetch("/api/onboarding/v2/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: 1,
          stepData: {
            step_1_company_setup: true,
            ...formData,
          },
        }),
      });

      // Record milestone
      await fetch("/api/onboarding/v2/milestones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          milestone_type: "win_1_email_connected", // This will be updated when email is connected
        }),
      });

      onComplete(formData);
    } catch (error) {
      console.error("Error saving step 1:", error);
    } finally {
      setLoading(false);
    }
  };

  const addServiceArea = () => {
    if (serviceAreaInput.trim() && !formData.service_areas.includes(serviceAreaInput.trim())) {
      setFormData({
        ...formData,
        service_areas: [...formData.service_areas, serviceAreaInput.trim()],
      });
      setServiceAreaInput("");
    }
  };

  const removeServiceArea = (area: string) => {
    setFormData({
      ...formData,
      service_areas: formData.service_areas.filter((a) => a !== area),
    });
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center gap-2 mb-2">
          <Building2 className="h-6 w-6 text-primary" />
          <CardTitle className="text-2xl">Step 1: Company Setup</CardTitle>
        </div>
        <CardDescription>
          Tell us about your roofing company. This takes under 2 minutes.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="company_name">Company Name *</Label>
            <Input
              id="company_name"
              value={formData.company_name}
              onChange={(e) =>
                setFormData({ ...formData, company_name: e.target.value })
              }
              placeholder="ABC Roofing"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="owner_name">Owner/Rep Name *</Label>
            <Input
              id="owner_name"
              value={formData.owner_name}
              onChange={(e) =>
                setFormData({ ...formData, owner_name: e.target.value })
              }
              placeholder="John Smith"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="company_city">City *</Label>
            <Input
              id="company_city"
              value={formData.company_city}
              onChange={(e) =>
                setFormData({ ...formData, company_city: e.target.value })
              }
              placeholder="Dallas"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="service_areas">Service Areas</Label>
            <div className="flex gap-2">
              <Input
                id="service_areas"
                value={serviceAreaInput}
                onChange={(e) => setServiceAreaInput(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addServiceArea();
                  }
                }}
                placeholder="Add a city or ZIP code"
              />
              <Button type="button" onClick={addServiceArea} variant="outline">
                Add
              </Button>
            </div>
            {formData.service_areas.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {formData.service_areas.map((area) => (
                  <span
                    key={area}
                    className="inline-flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary rounded-md text-sm"
                  >
                    {area}
                    <button
                      type="button"
                      onClick={() => removeServiceArea(area)}
                      className="hover:text-primary/70"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Company Logo (Optional)</Label>
            <div className="border-2 border-dashed rounded-lg p-8 text-center">
              <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                Upload your logo to improve conversions by 12%
              </p>
              <Button type="button" variant="outline" className="mt-2" size="sm">
                Upload Logo
              </Button>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="submit" disabled={loading}>
              Continue to Email Setup →
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}





















































