"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import Link from "next/link";
import { CompanyMergeWizard } from "@/components/companies/CompanyMergeWizard";

interface Company {
  id: string;
  name: string | null;
  domain: string;
  website: string | null;
  industry: string | null;
  size: string | null;
}

interface Duplicate {
  id: string;
  company_id: string;
  duplicate_company_id: string;
  score: number;
  match_type: string;
  company: Company;
  duplicate_company: Company;
}

export default function CompanyDuplicatesPage() {
  const [duplicates, setDuplicates] = useState<Duplicate[]>([]);
  const [loading, setLoading] = useState(true);
  const [mergeWizardOpen, setMergeWizardOpen] = useState(false);
  const [selectedPrimaryId, setSelectedPrimaryId] = useState<string | null>(null);
  const [selectedMergedId, setSelectedMergedId] = useState<string | null>(null);

  const loadDuplicates = async () => {
    try {
      const res = await fetch("/api/companies/duplicates?min_score=70");
      const json = await res.json();
      setDuplicates(json.duplicates || []);
    } catch (error) {
      console.error("Error loading duplicates:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDuplicates();
  }, []);

  const handleMerge = (companyId: string, duplicateCompanyId: string) => {
    setSelectedPrimaryId(companyId);
    setSelectedMergedId(duplicateCompanyId);
    setMergeWizardOpen(true);
  };

  const handleDetectDuplicates = async () => {
    try {
      const res = await fetch("/api/companies/duplicates", {
        method: "POST",
      });
      const json = await res.json();
      if (json.success) {
        alert("Duplicate detection completed!");
        loadDuplicates();
      }
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-sm text-muted-foreground">Loading duplicates...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Company Duplicates</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Review and merge duplicate companies to keep your CRM clean
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleDetectDuplicates}>
            Detect Duplicates
          </Button>
          <Link href="/companies">
            <Button variant="outline">Back to Companies</Button>
          </Link>
        </div>
      </div>

      {duplicates.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <p className="text-muted-foreground">No duplicates found.</p>
              <Button onClick={handleDetectDuplicates} className="mt-4">
                Run Duplicate Detection
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {duplicates.map((dup) => {
            const getScoreColor = (score: number) => {
              if (score >= 90) return "bg-green-100 text-green-800";
              if (score >= 70) return "bg-yellow-100 text-yellow-800";
              return "bg-gray-100 text-gray-800";
            };

            return (
              <Card key={dup.id}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 grid grid-cols-2 gap-4">
                      <div>
                        <Link href={`/companies/${dup.company.id}`}>
                          <div className="font-medium hover:underline">
                            {dup.company.name || dup.company.domain}
                          </div>
                        </Link>
                        <div className="text-sm text-muted-foreground mt-1">
                          Domain: {dup.company.domain}
                        </div>
                        {dup.company.website && (
                          <div className="text-sm text-muted-foreground">
                            Website: {dup.company.website}
                          </div>
                        )}
                      </div>
                      <div>
                        <Link href={`/companies/${dup.duplicate_company.id}`}>
                          <div className="font-medium hover:underline">
                            {dup.duplicate_company.name || dup.duplicate_company.domain}
                          </div>
                        </Link>
                        <div className="text-sm text-muted-foreground mt-1">
                          Domain: {dup.duplicate_company.domain}
                        </div>
                        {dup.duplicate_company.website && (
                          <div className="text-sm text-muted-foreground">
                            Website: {dup.duplicate_company.website}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="ml-4 flex flex-col items-end gap-2">
                      <div
                        className={`px-2 py-1 rounded text-xs font-medium ${getScoreColor(dup.score)}`}
                      >
                        Score: {dup.score}
                      </div>
                      <div className="text-xs text-muted-foreground">{dup.match_type}</div>
                      <Button
                        size="sm"
                        onClick={() =>
                          handleMerge(dup.company.id, dup.duplicate_company.id)
                        }
                      >
                        Merge
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Merge Wizard */}
      {selectedPrimaryId && selectedMergedId && (
        <CompanyMergeWizard
          open={mergeWizardOpen}
          onOpenChange={(open) => {
            setMergeWizardOpen(open);
            if (!open) {
              setSelectedPrimaryId(null);
              setSelectedMergedId(null);
              loadDuplicates(); // Reload after merge
            }
          }}
          primaryCompanyId={selectedPrimaryId}
          mergedCompanyId={selectedMergedId}
          onSuccess={() => {
            loadDuplicates();
          }}
        />
      )}
    </div>
  );
}








