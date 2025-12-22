"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Building2, User, Phone, MapPin, FileText } from "lucide-react";
import { toast } from "sonner";

interface Step5PersonalizeProps {
  onNext: (data: { personalizationData: Record<string, string> }) => void;
  onBack: () => void;
  templateId?: string;
  personalizationData?: Record<string, string>;
}

export function Step5Personalize({
  onNext,
  onBack,
  templateId,
  personalizationData: initialData,
}: Step5PersonalizeProps) {
  const [formData, setFormData] = useState<Record<string, string>>({
    company: "",
    owner_name: "",
    phone: "",
    city: "",
    license_number: "",
    years_serving: "",
    ...initialData,
  });

  useEffect(() => {
    // Try to auto-fill from user profile
    loadUserData();
  }, []);

  const loadUserData = async () => {
    try {
      const res = await fetch("/api/me");
      if (res.ok) {
        const data = await res.json();
        // Auto-fill if available
        setFormData((prev) => ({
          ...prev,
          company: data.company_name || prev.company,
          owner_name: data.name || prev.owner_name,
        }));
      }
    } catch (error) {
      // Silently fail
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleApplyToAll = () => {
    toast.success("Personalization data will be applied to all campaign steps");
  };

  const handleNext = () => {
    // Validate required fields
    if (!formData.company || !formData.city) {
      toast.error("Please fill in at least company name and city");
      return;
    }

    onNext({ personalizationData: formData });
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900">Personalize Your Campaign</h2>
        <p className="text-gray-600 mt-2">
          Fill in your business details. These will be automatically applied to all campaign steps.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Business Information</CardTitle>
          <CardDescription>
            We'll use this information to personalize your campaign emails
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="company">
                <Building2 className="w-4 h-4 inline mr-2" />
                Contractor Business Name *
              </Label>
              <Input
                id="company"
                value={formData.company}
                onChange={(e) => handleChange("company", e.target.value)}
                placeholder="ABC Roofing Company"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="owner_name">
                <User className="w-4 h-4 inline mr-2" />
                Owner Name
              </Label>
              <Input
                id="owner_name"
                value={formData.owner_name}
                onChange={(e) => handleChange("owner_name", e.target.value)}
                placeholder="John Smith"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">
                <Phone className="w-4 h-4 inline mr-2" />
                Phone Number
              </Label>
              <Input
                id="phone"
                type="tel"
                value={formData.phone}
                onChange={(e) => handleChange("phone", e.target.value)}
                placeholder="(555) 123-4567"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="city">
                <MapPin className="w-4 h-4 inline mr-2" />
                City / Service Area *
              </Label>
              <Input
                id="city"
                value={formData.city}
                onChange={(e) => handleChange("city", e.target.value)}
                placeholder="Denver"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="license_number">
                <FileText className="w-4 h-4 inline mr-2" />
                License Number (Optional)
              </Label>
              <Input
                id="license_number"
                value={formData.license_number}
                onChange={(e) => handleChange("license_number", e.target.value)}
                placeholder="CO-12345"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="years_serving">
                Years Serving {formData.city || "City"}
              </Label>
              <Input
                id="years_serving"
                type="number"
                value={formData.years_serving}
                onChange={(e) => handleChange("years_serving", e.target.value)}
                placeholder="10"
              />
            </div>
          </div>

          <div className="pt-4 border-t">
            <p className="text-sm text-muted-foreground mb-2">
              These fields will replace variables like {"{"}{"{"}city{"}"}{"}"}, {"{"}{"{"}company{"}"}{"}"}, {"{"}{"{"}phone{"}"}{"}"} in your campaign template.
            </p>
            <Button onClick={handleApplyToAll} variant="outline" size="sm">
              Apply to All Steps
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Preview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <p>
              <strong>Company:</strong> {formData.company || "Not set"}
            </p>
            <p>
              <strong>City:</strong> {formData.city || "Not set"}
            </p>
            {formData.years_serving && (
              <p>
                <strong>Years Serving:</strong> We've been serving {formData.city || "this area"} for {formData.years_serving} years
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-between pt-4">
        <Button onClick={onBack} variant="outline">
          Back
        </Button>
        <Button onClick={handleNext}>
          Next Step
        </Button>
      </div>
    </div>
  );
}




























































