"use client";

// Block 16800 — Step 3: Import Your First List

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, FileText, Sparkles } from "lucide-react";
import Link from "next/link";

export function OnboardingStep3({
  onComplete,
}: {
  onComplete: (data: any) => void;
}) {
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/contacts/import/upload", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        setImported(true);
        // Update progress
        await fetch("/api/onboarding/v2/progress", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            step: 3,
            stepData: {
              step_3_list_imported: true,
            },
            win: "win_2_list_imported",
          }),
        });

        onComplete({ list_imported: true });
      }
    } catch (error) {
      console.error("Error importing list:", error);
    } finally {
      setImporting(false);
    }
  };

  const handleSampleList = async () => {
    setImporting(true);

    try {
      // Create a sample list
      const res = await fetch("/api/contacts/import/sample", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "roofing",
        }),
      });

      if (res.ok) {
        setImported(true);
        await fetch("/api/onboarding/v2/progress", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            step: 3,
            stepData: {
              step_3_list_imported: true,
            },
            win: "win_2_list_imported",
          }),
        });

        onComplete({ list_imported: true });
      }
    } catch (error) {
      console.error("Error creating sample list:", error);
    } finally {
      setImporting(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center gap-2 mb-2">
          <Upload className="h-6 w-6 text-primary" />
          <CardTitle className="text-2xl">Step 3: Import Your First List</CardTitle>
        </div>
        <CardDescription>
          Import your old quotes, storm lists, or homeowner list. SmartSend will run list intelligence and create tasks automatically.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {!imported ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border-2 border-dashed rounded-lg p-8 text-center hover:border-primary transition-colors">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="font-semibold mb-2">Upload CSV</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Import your existing homeowner list
                </p>
                <label className="cursor-pointer">
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleFileUpload}
                    className="hidden"
                    disabled={importing}
                  />
                  <Button variant="outline" disabled={importing} asChild>
                    <span>Choose File</span>
                  </Button>
                </label>
              </div>

              <div className="border-2 border-dashed rounded-lg p-8 text-center hover:border-primary transition-colors">
                <Sparkles className="h-12 w-12 mx-auto text-primary mb-4" />
                <h3 className="font-semibold mb-2">Try Sample Roofing List</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  For cold start - we'll create a sample list for you
                </p>
                <Button
                  variant="outline"
                  onClick={handleSampleList}
                  disabled={importing}
                >
                  Use Sample List
                </Button>
              </div>
            </div>

            {importing && (
              <div className="text-center py-4">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Processing your list...
                </p>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 rounded-lg p-6">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-5 w-5 text-green-600" />
                <h3 className="font-semibold text-green-800 dark:text-green-400">
                  List Imported Successfully!
                </h3>
              </div>
              <p className="text-sm text-green-700 dark:text-green-300">
                SmartSend has run list intelligence, applied storm data, built personalization data, created tasks, and populated your pipeline.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button onClick={() => onComplete({ list_imported: true })}>
                Continue to Launch Campaign →
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}





















































