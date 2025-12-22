"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";

interface Company {
  id: string;
  name: string | null;
  domain: string;
  website: string | null;
  industry: string | null;
  size: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  owner_id: string | null;
  enrichment_score: number;
}

interface MergePreview {
  primary_company: Company;
  merged_company: Company;
  leads_count: number;
  deals_count: number;
  threads_count: number;
  meetings_count: number;
  notes_count: number;
  tasks_count: number;
  team_activities_count: number;
}

interface CompanyMergeWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  primaryCompanyId: string;
  mergedCompanyId: string;
  onSuccess?: () => void;
}

type Step = "choose-primary" | "field-selection" | "preview" | "confirm";

export function CompanyMergeWizard({
  open,
  onOpenChange,
  primaryCompanyId,
  mergedCompanyId,
  onSuccess,
}: CompanyMergeWizardProps) {
  const [step, setStep] = useState<Step>("choose-primary");
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<MergePreview | null>(null);
  const [fieldSelections, setFieldSelections] = useState<Record<string, "primary" | "merged">>({});
  const [selectedPrimary, setSelectedPrimary] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setStep("choose-primary");
      setSelectedPrimary(primaryCompanyId);
      loadPreview();
    }
  }, [open, primaryCompanyId, mergedCompanyId]);

  const loadPreview = async () => {
    try {
      const res = await fetch(
        `/api/companies/merge/preview?primary_company_id=${primaryCompanyId}&merged_company_id=${mergedCompanyId}`
      );
      const json = await res.json();
      if (json.preview) {
        setPreview(json.preview);
        // Initialize field selections (default to primary)
        const fields = ["name", "website", "industry", "size", "country", "state", "city", "owner_id"];
        const initialSelections: Record<string, "primary" | "merged"> = {};
        fields.forEach((field) => {
          initialSelections[field] = "primary";
        });
        setFieldSelections(initialSelections);
      }
    } catch (error) {
      console.error("Error loading preview:", error);
    }
  };

  const handleMerge = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/companies/merge/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          primary_company_id: selectedPrimary || primaryCompanyId,
          merged_company_id: selectedPrimary === primaryCompanyId ? mergedCompanyId : primaryCompanyId,
          field_selections: fieldSelections,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        alert(`Error: ${json.error}`);
        return;
      }

      alert("Companies merged successfully!");
      onSuccess?.();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error merging companies:", error);
      alert(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const getPrimaryCompany = () => {
    if (!preview) return null;
    return selectedPrimary === primaryCompanyId
      ? preview.primary_company
      : preview.merged_company;
  };

  const getMergedCompany = () => {
    if (!preview) return null;
    return selectedPrimary === primaryCompanyId
      ? preview.merged_company
      : preview.primary_company;
  };

  const primary = getPrimaryCompany();
  const merged = getMergedCompany();

  if (!preview || !primary || !merged) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Merge Companies</DialogTitle>
          <DialogDescription>
            Combine duplicate companies into a single record
          </DialogDescription>
        </DialogHeader>

        {/* Step 1: Choose Primary */}
        {step === "choose-primary" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Select which company should be the primary (surviving) record:
            </p>
            <div className="grid grid-cols-2 gap-4">
              <Card
                className={`cursor-pointer ${
                  selectedPrimary === primaryCompanyId ? "ring-2 ring-primary" : ""
                }`}
                onClick={() => setSelectedPrimary(primaryCompanyId)}
              >
                <CardHeader>
                  <CardTitle>{preview.primary_company.name || preview.primary_company.domain}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    <div>Domain: {preview.primary_company.domain}</div>
                    <div>Website: {preview.primary_company.website || "N/A"}</div>
                    <div>Industry: {preview.primary_company.industry || "N/A"}</div>
                    <div>Size: {preview.primary_company.size || "N/A"}</div>
                  </div>
                </CardContent>
              </Card>
              <Card
                className={`cursor-pointer ${
                  selectedPrimary === mergedCompanyId ? "ring-2 ring-primary" : ""
                }`}
                onClick={() => setSelectedPrimary(mergedCompanyId)}
              >
                <CardHeader>
                  <CardTitle>{preview.merged_company.name || preview.merged_company.domain}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    <div>Domain: {preview.merged_company.domain}</div>
                    <div>Website: {preview.merged_company.website || "N/A"}</div>
                    <div>Industry: {preview.merged_company.industry || "N/A"}</div>
                    <div>Size: {preview.merged_company.size || "N/A"}</div>
                  </div>
                </CardContent>
              </Card>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => setStep("field-selection")}
                disabled={!selectedPrimary}
              >
                Next: Choose Fields
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Step 2: Field Selection */}
        {step === "field-selection" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Choose which values to keep for each field:
            </p>
            <div className="space-y-4">
              {[
                { key: "name", label: "Company Name" },
                { key: "website", label: "Website" },
                { key: "industry", label: "Industry" },
                { key: "size", label: "Size" },
                { key: "country", label: "Country" },
                { key: "state", label: "State" },
                { key: "city", label: "City" },
              ].map((field) => {
                const primaryValue = (primary as any)[field.key] || "N/A";
                const mergedValue = (merged as any)[field.key] || "N/A";
                const selection = fieldSelections[field.key] || "primary";

                return (
                  <div key={field.key} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex-1">
                      <div className="font-medium">{field.label}</div>
                      <div className="text-sm text-muted-foreground mt-1">
                        Primary: {primaryValue} | Merged: {mergedValue}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant={selection === "primary" ? "default" : "outline"}
                        onClick={() =>
                          setFieldSelections({ ...fieldSelections, [field.key]: "primary" })
                        }
                      >
                        Primary
                      </Button>
                      <Button
                        size="sm"
                        variant={selection === "merged" ? "default" : "outline"}
                        onClick={() =>
                          setFieldSelections({ ...fieldSelections, [field.key]: "merged" })
                        }
                      >
                        Merged
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("choose-primary")}>
                Back
              </Button>
              <Button onClick={() => setStep("preview")}>Next: Preview</Button>
            </DialogFooter>
          </div>
        )}

        {/* Step 3: Preview */}
        {step === "preview" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Review what will be merged:
            </p>
            <Card>
              <CardHeader>
                <CardTitle>Merging Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div>
                    <strong>From:</strong> {merged.name || merged.domain} →{" "}
                    <strong>To:</strong> {primary.name || primary.domain}
                  </div>
                  <div className="mt-4 space-y-1">
                    <div>• {preview.leads_count} people (leads)</div>
                    <div>• {preview.deals_count} deals</div>
                    <div>• {preview.threads_count} threads</div>
                    <div>• {preview.meetings_count} meetings</div>
                    <div>• {preview.notes_count} notes</div>
                    <div>• {preview.tasks_count} tasks</div>
                    <div>• {preview.team_activities_count} activity entries</div>
                  </div>
                </div>
              </CardContent>
            </Card>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("field-selection")}>
                Back
              </Button>
              <Button onClick={() => setStep("confirm")}>Confirm Merge</Button>
            </DialogFooter>
          </div>
        )}

        {/* Step 4: Confirm */}
        {step === "confirm" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to merge these companies? This action can be undone within 7 days.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("preview")}>
                Back
              </Button>
              <Button onClick={handleMerge} disabled={loading}>
                {loading ? "Merging..." : "Confirm Merge"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}








