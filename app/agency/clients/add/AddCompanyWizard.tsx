"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, ArrowRight, ArrowLeft, Check } from "lucide-react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { toast } from "sonner";

interface AddCompanyWizardProps {
  agencyId: string;
}

type WizardStep = "basic" | "contact" | "settings" | "review";

interface CompanyData {
  name: string;
  legal_name: string;
  email_domain: string;
  phone_number: string;
  website: string;
  address: string;
  city: string;
  state: string;
  zip_code: string;
  company_type: string;
  messaging_style: string;
}

export function AddCompanyWizard({ agencyId }: AddCompanyWizardProps) {
  const router = useRouter();
  const supabase = createClientComponentClient();
  const [step, setStep] = useState<WizardStep>("basic");
  const [loading, setLoading] = useState(false);
  const [companyData, setCompanyData] = useState<CompanyData>({
    name: "",
    legal_name: "",
    email_domain: "",
    phone_number: "",
    website: "",
    address: "",
    city: "",
    state: "",
    zip_code: "",
    company_type: "hybrid",
    messaging_style: "casual",
  });

  const updateField = (field: keyof CompanyData, value: string) => {
    setCompanyData((prev) => ({ ...prev, [field]: value }));
  };

  const handleNext = () => {
    if (step === "basic") {
      if (!companyData.name) {
        toast.error("Company name is required");
        return;
      }
      setStep("contact");
    } else if (step === "contact") {
      setStep("settings");
    } else if (step === "settings") {
      setStep("review");
    }
  };

  const handleBack = () => {
    if (step === "contact") setStep("basic");
    else if (step === "settings") setStep("contact");
    else if (step === "review") setStep("settings");
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Not authenticated");
        return;
      }

      // Create roofing company
      const { data: company, error: companyError } = await supabase
        .from("roofing_companies")
        .insert({
          owner_id: user.id,
          name: companyData.name,
          legal_name: companyData.legal_name || companyData.name,
          email_domain: companyData.email_domain,
          phone_number: companyData.phone_number,
          website: companyData.website,
          address: companyData.address,
          city: companyData.city,
          state: companyData.state,
          zip_code: companyData.zip_code,
          company_type: companyData.company_type,
          messaging_style: companyData.messaging_style,
          is_active: true,
        })
        .select()
        .single();

      if (companyError) {
        throw companyError;
      }

      // Link company to agency
      const { error: linkError } = await supabase
        .from("agency_companies")
        .insert({
          agency_id: agencyId,
          company_id: company.id,
        });

      if (linkError) {
        throw linkError;
      }

      toast.success("Company added successfully!");
      router.push(`/agency/dashboard`);
    } catch (error: any) {
      console.error("Error adding company:", error);
      toast.error(error.message || "Failed to add company");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Add New Company</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Onboard a new roofing company client in 60 seconds
        </p>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center justify-between mb-8">
        {(["basic", "contact", "settings", "review"] as WizardStep[]).map((s, idx) => (
          <div key={s} className="flex items-center flex-1">
            <div
              className={`flex items-center justify-center w-10 h-10 rounded-full border-2 ${
                step === s
                  ? "bg-primary text-primary-foreground border-primary"
                  : idx < (["basic", "contact", "settings", "review"] as WizardStep[]).indexOf(step)
                  ? "bg-green-500 text-white border-green-500"
                  : "bg-background border-muted"
              }`}
            >
              {idx < (["basic", "contact", "settings", "review"] as WizardStep[]).indexOf(step) ? (
                <Check className="w-5 h-5" />
              ) : (
                <span>{idx + 1}</span>
              )}
            </div>
            {idx < 3 && (
              <div
                className={`flex-1 h-0.5 mx-2 ${
                  idx < (["basic", "contact", "settings", "review"] as WizardStep[]).indexOf(step)
                    ? "bg-green-500"
                    : "bg-muted"
                }`}
              />
            )}
          </div>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {step === "basic" && "Company Information"}
            {step === "contact" && "Contact Details"}
            {step === "settings" && "Company Settings"}
            {step === "review" && "Review & Create"}
          </CardTitle>
          <CardDescription>
            {step === "basic" && "Enter basic company information"}
            {step === "contact" && "Add contact and location details"}
            {step === "settings" && "Configure company type and messaging"}
            {step === "review" && "Review all information before creating"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Step 1: Basic Info */}
          {step === "basic" && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Company Name *</Label>
                <Input
                  id="name"
                  value={companyData.name}
                  onChange={(e) => updateField("name", e.target.value)}
                  placeholder="ABC Roofing"
                />
              </div>
              <div>
                <Label htmlFor="legal_name">Legal Name</Label>
                <Input
                  id="legal_name"
                  value={companyData.legal_name}
                  onChange={(e) => updateField("legal_name", e.target.value)}
                  placeholder="ABC Roofing LLC"
                />
              </div>
            </div>
          )}

          {/* Step 2: Contact */}
          {step === "contact" && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="email_domain">Email Domain</Label>
                <Input
                  id="email_domain"
                  value={companyData.email_domain}
                  onChange={(e) => updateField("email_domain", e.target.value)}
                  placeholder="abcroofing.com"
                />
              </div>
              <div>
                <Label htmlFor="phone_number">Phone Number</Label>
                <Input
                  id="phone_number"
                  value={companyData.phone_number}
                  onChange={(e) => updateField("phone_number", e.target.value)}
                  placeholder="(555) 123-4567"
                />
              </div>
              <div>
                <Label htmlFor="website">Website</Label>
                <Input
                  id="website"
                  value={companyData.website}
                  onChange={(e) => updateField("website", e.target.value)}
                  placeholder="https://abcroofing.com"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    value={companyData.city}
                    onChange={(e) => updateField("city", e.target.value)}
                    placeholder="Dallas"
                  />
                </div>
                <div>
                  <Label htmlFor="state">State</Label>
                  <Input
                    id="state"
                    value={companyData.state}
                    onChange={(e) => updateField("state", e.target.value)}
                    placeholder="TX"
                    maxLength={2}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="zip_code">ZIP Code</Label>
                <Input
                  id="zip_code"
                  value={companyData.zip_code}
                  onChange={(e) => updateField("zip_code", e.target.value)}
                  placeholder="75201"
                />
              </div>
              <div>
                <Label htmlFor="address">Address</Label>
                <Textarea
                  id="address"
                  value={companyData.address}
                  onChange={(e) => updateField("address", e.target.value)}
                  placeholder="123 Main St"
                />
              </div>
            </div>
          )}

          {/* Step 3: Settings */}
          {step === "settings" && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="company_type">Company Type</Label>
                <Select
                  value={companyData.company_type}
                  onValueChange={(value) => updateField("company_type", value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="retail">Retail</SelectItem>
                    <SelectItem value="insurance">Insurance</SelectItem>
                    <SelectItem value="storm">Storm</SelectItem>
                    <SelectItem value="hybrid">Hybrid</SelectItem>
                    <SelectItem value="franchise">Franchise</SelectItem>
                    <SelectItem value="division">Division</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="messaging_style">Messaging Style</Label>
                <Select
                  value={companyData.messaging_style}
                  onValueChange={(value) => updateField("messaging_style", value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="professional">Professional</SelectItem>
                    <SelectItem value="casual">Casual</SelectItem>
                    <SelectItem value="friendly">Friendly</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Step 4: Review */}
          {step === "review" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-muted-foreground">Company Name</div>
                  <div className="font-semibold">{companyData.name}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Company Type</div>
                  <div className="font-semibold">{companyData.company_type}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Email Domain</div>
                  <div className="font-semibold">{companyData.email_domain || "N/A"}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Phone</div>
                  <div className="font-semibold">{companyData.phone_number || "N/A"}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Location</div>
                  <div className="font-semibold">
                    {[companyData.city, companyData.state, companyData.zip_code]
                      .filter(Boolean)
                      .join(", ") || "N/A"}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Messaging Style</div>
                  <div className="font-semibold">{companyData.messaging_style}</div>
                </div>
              </div>
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="flex justify-between pt-4">
            <Button
              variant="outline"
              onClick={handleBack}
              disabled={step === "basic" || loading}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            {step !== "review" ? (
              <Button onClick={handleNext}>
                Next
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            ) : (
              <Button onClick={handleSubmit} disabled={loading}>
                {loading ? "Creating..." : "Create Company"}
                <Check className="w-4 h-4 ml-2" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}



























