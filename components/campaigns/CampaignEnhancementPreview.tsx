"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sparkles, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface EnhancementReport {
  personalization_applied: boolean;
  storm_context_added: boolean;
  insurance_optimized: boolean;
  deliverability_fixes: string[];
  tone_adjusted: string;
  cta_optimized: boolean;
  subject_generated: boolean;
  local_references: string[];
  improvements: string[];
}

interface CampaignEnhancementPreviewProps {
  campaignId: string;
  originalSubject: string;
  originalBodyHtml: string;
  originalBodyText: string;
  onEnhancementApplied?: (enhanced: {
    subject: string;
    bodyHtml: string;
    bodyText: string;
    report: EnhancementReport;
  }) => void;
}

export function CampaignEnhancementPreview({
  campaignId,
  originalSubject,
  originalBodyHtml,
  originalBodyText,
  onEnhancementApplied,
}: CampaignEnhancementPreviewProps) {
  const [enhancing, setEnhancing] = React.useState(false);
  const [enhancedSubject, setEnhancedSubject] = React.useState<string | null>(null);
  const [enhancedBodyHtml, setEnhancedBodyHtml] = React.useState<string | null>(null);
  const [enhancedBodyText, setEnhancedBodyText] = React.useState<string | null>(null);
  const [enhancementReport, setEnhancementReport] = React.useState<EnhancementReport | null>(null);
  const [viewMode, setViewMode] = React.useState<"side-by-side" | "toggle">("toggle");

  const handleEnhance = async () => {
    setEnhancing(true);
    try {
      const response = await fetch("/api/campaign/enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId,
        }),
      });

      if (!response.ok) {
        throw new Error("Enhancement failed");
      }

      const data = await response.json();
      setEnhancedSubject(data.enhanced_subject);
      setEnhancedBodyHtml(data.enhanced_body_html);
      setEnhancedBodyText(data.enhanced_body_text);
      setEnhancementReport(data.enhancement_report);

      if (onEnhancementApplied) {
        onEnhancementApplied({
          subject: data.enhanced_subject,
          bodyHtml: data.enhanced_body_html,
          bodyText: data.enhanced_body_text,
          report: data.enhancement_report,
        });
      }

      toast.success("Campaign enhanced successfully!");
    } catch (error: any) {
      console.error("Enhancement error:", error);
      toast.error(error.message || "Failed to enhance campaign");
    } finally {
      setEnhancing(false);
    }
  };

  const hasEnhancement = enhancedSubject !== null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-blue-500" />
              SmartSend AI Campaign Enhancer
            </CardTitle>
            <CardDescription>
              Automatically improve your campaign with AI-powered enhancements
            </CardDescription>
          </div>
          {!hasEnhancement && (
            <Button onClick={handleEnhance} disabled={enhancing}>
              {enhancing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Enhancing...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Enhance Campaign
                </>
              )}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {enhancementReport && (
          <div className="mb-6 space-y-3">
            <div className="flex flex-wrap gap-2">
              {enhancementReport.personalization_applied && (
                <Badge variant="default" className="bg-green-100 text-green-800">
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  Personalization
                </Badge>
              )}
              {enhancementReport.storm_context_added && (
                <Badge variant="default" className="bg-blue-100 text-blue-800">
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  Storm Context
                </Badge>
              )}
              {enhancementReport.insurance_optimized && (
                <Badge variant="default" className="bg-purple-100 text-purple-800">
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  Insurance Optimized
                </Badge>
              )}
              {enhancementReport.cta_optimized && (
                <Badge variant="default" className="bg-orange-100 text-orange-800">
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  CTA Optimized
                </Badge>
              )}
              {enhancementReport.subject_generated && (
                <Badge variant="default" className="bg-pink-100 text-pink-800">
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  Subject Generated
                </Badge>
              )}
              {enhancementReport.deliverability_fixes.length > 0 && (
                <Badge variant="default" className="bg-yellow-100 text-yellow-800">
                  <AlertCircle className="mr-1 h-3 w-3" />
                  {enhancementReport.deliverability_fixes.length} Deliverability Fixes
                </Badge>
              )}
            </div>
            {enhancementReport.improvements.length > 0 && (
              <div className="rounded-lg bg-green-50 p-4">
                <h4 className="text-sm font-semibold text-green-900 mb-2">Improvements Applied:</h4>
                <ul className="list-disc list-inside space-y-1 text-sm text-green-800">
                  {enhancementReport.improvements.map((improvement, idx) => (
                    <li key={idx}>{improvement}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {hasEnhancement ? (
          <Tabs defaultValue="subject" className="w-full">
            <TabsList>
              <TabsTrigger value="subject">Subject Line</TabsTrigger>
              <TabsTrigger value="body">Email Body</TabsTrigger>
            </TabsList>
            <TabsContent value="subject" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">Original</label>
                  <div className="p-3 bg-gray-50 rounded-lg border text-sm">
                    {originalSubject}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-green-700 mb-2 block flex items-center gap-2">
                    Enhanced
                    <Badge variant="outline" className="text-xs">AI Improved</Badge>
                  </label>
                  <div className="p-3 bg-green-50 rounded-lg border border-green-200 text-sm">
                    {enhancedSubject}
                  </div>
                </div>
              </div>
            </TabsContent>
            <TabsContent value="body" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">Original</label>
                  <div className="p-4 bg-gray-50 rounded-lg border text-sm prose prose-sm max-w-none">
                    <div dangerouslySetInnerHTML={{ __html: originalBodyHtml }} />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-green-700 mb-2 block flex items-center gap-2">
                    Enhanced
                    <Badge variant="outline" className="text-xs">AI Improved</Badge>
                  </label>
                  <div className="p-4 bg-green-50 rounded-lg border border-green-200 text-sm prose prose-sm max-w-none">
                    <div dangerouslySetInnerHTML={{ __html: enhancedBodyHtml || "" }} />
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <Sparkles className="h-12 w-12 mx-auto mb-4 text-gray-400" />
            <p className="text-sm">
              Click "Enhance Campaign" to see AI-powered improvements to your campaign.
            </p>
            <p className="text-xs mt-2 text-gray-400">
              SmartSend will automatically improve personalization, add local references, optimize deliverability, and more.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}





















































