// Block 16500 — SmartSend Contact Profile v2
"use client";

import React, { useState, useEffect } from "react";
import { Skeleton } from "@/src/components/ui/skeleton";
import { HomeownerSnapshot } from "@/components/contacts/v2/HomeownerSnapshot";
import { AISummaryBox } from "@/components/contacts/v2/AISummaryBox";
import { ConversationThread } from "@/components/contacts/v2/ConversationThread";
import { IntelligenceModules } from "@/components/contacts/v2/IntelligenceModules";
import { OneClickActions } from "@/components/contacts/v2/OneClickActions";
import { InsuranceToolkit } from "@/components/contacts/v2/InsuranceToolkit";
import { InsuranceIntelligencePanel } from "@/components/contacts/v2/InsuranceIntelligencePanel";
import { AIAssistedNote } from "@/components/contacts/v2/AIAssistedNote";
import { MaterialSummaryPanel } from "@/components/contacts/MaterialSummaryPanel";
import { ContactTimeline } from "@/components/contacts/ContactTimeline";
import { ContactFilesTab } from "@/components/contacts/ContactFilesTab";
import { RoofValueSummary } from "@/components/contacts/RoofValueSummary";
import { RoofAgePanel } from "@/components/contacts/RoofAgePanel";
import { TerminologyTranslatorPanel } from "@/components/contacts/TerminologyTranslatorPanel";
import { SmartSummaryCard } from "@/components/contacts/SmartSummaryCard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useContactTimeline } from "@/lib/hooks/useContactTimeline";
import { Badge } from "@/components/ui/badge";
import { VisualBadge, getContactBadges } from "@/components/contacts/v2/VisualBadges";
import { 
  Flame, 
  FileText, 
  Image, 
  Clock,
  CloudLightning,
  Shield,
  DollarSign
} from "lucide-react";

export default function ContactProfileV2Page({
  params,
}: {
  params: { contactId: string };
}) {
  const [fullData, setFullData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timelineFilters, setTimelineFilters] = React.useState<{ types?: string[]; dateFilter?: string }>({});
  const { events, loading: timelineLoading, hasMore, loadNextPage, reload: reloadTimeline } = useContactTimeline(params.contactId, timelineFilters);

  useEffect(() => {
    async function loadFullData() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/contacts/${params.contactId}/full`, {
          cache: "no-store",
        });
        const json = await res.json();
        if (!res.ok) {
          setError(json?.error ?? "Failed to load contact");
          setFullData(null);
        } else {
          setFullData(json);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load contact");
        setFullData(null);
      } finally {
        setLoading(false);
      }
    }

    void loadFullData();
  }, [params.contactId]);

  const handleActionComplete = () => {
    // Reload data after action
    window.location.reload();
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <Skeleton className="h-20 w-full" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-3">
            <Skeleton className="h-96" />
          </div>
          <div className="lg:col-span-6">
            <Skeleton className="h-96" />
          </div>
          <div className="lg:col-span-3">
            <Skeleton className="h-96" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !fullData) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-12">
          <h2 className="text-2xl font-semibold mb-2">Contact not found</h2>
          <p className="text-muted-foreground">{error || "Unable to load contact"}</p>
        </div>
      </div>
    );
  }

  const contact = fullData.contact;
  const displayName =
    contact.first_name || contact.last_name
      ? `${contact.first_name || ""} ${contact.last_name || ""}`.trim()
      : contact.email;

  // Prepare storm impact data
  const stormImpact = fullData.weatherEvents && fullData.weatherEvents.length > 0 ? {
    last_storm_date: fullData.weatherEvents[0].storm_started_at,
    storm_type: fullData.weatherEvents[0].storm_type,
    severity: fullData.weatherEvents[0].severity,
    storm_risk_level: contact.storm_risk_level,
    hail_size: fullData.weatherEvents[0].hail_size || null,
  } : null;

  // Prepare insurance signals
  const insuranceSignals = fullData.aiSummary?.insurance_likelihood || {
    claim_likelihood: "Low",
    adjuster_mentioned: false,
    deductible_noted: false,
    claim_filed: false,
    acv_rcv_hints: false,
  };

  // Prepare job value data
  const jobValue = {
    estimated_job_value: contact.estimated_job_value,
    estimated_value_min: contact.estimated_value_min,
    estimated_value_max: contact.estimated_value_max,
    job_type: contact.job_type,
  };

  // Get visual badges for this contact
  const contactBadges = getContactBadges(
    contact,
    fullData.heatScore,
    fullData.insuranceMetadata,
    fullData.weatherEvents || []
  );

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header with Visual Badges */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{displayName}</h1>
          <div className="flex items-center gap-2 mt-2">
            {contactBadges.map((badge, idx) => (
              <VisualBadge key={idx} type={badge.type} label={badge.label} />
            ))}
          </div>
        </div>
      </div>

      {/* One-Click Action Buttons */}
      <OneClickActions
        contactId={params.contactId}
        contactEmail={contact.email}
        contactName={displayName}
        onActionComplete={handleActionComplete}
      />

      {/* Main Layout - 3 Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Panel - Homeowner Snapshot */}
        <div className="lg:col-span-3 space-y-4">
          <HomeownerSnapshot
            contact={contact}
            tags={fullData.tags}
            enrichment={fullData.enrichment}
          />
          
          {/* Material Summary Panel - Block 18300 */}
          <MaterialSummaryPanel contactId={params.contactId} />
          
          {/* Roof Age Panel - Block 18900 */}
          <RoofAgePanel contactId={params.contactId} />
          
          {/* Roof Value Summary Panel - Block 18600 */}
          <RoofValueSummary contactId={params.contactId} />
          
          {/* Terminology Translator Panel - Block 18800 */}
          <TerminologyTranslatorPanel contactId={params.contactId} />
        </div>

        {/* Middle Panel - Conversation + AI Summary */}
        <div className="lg:col-span-6 space-y-4">
          {/* Smart Summary Card - Block 19100 */}
          <SmartSummaryCard contactId={params.contactId} />
          
          {/* AI Summary Box */}
          {fullData.aiSummary && (
            <AISummaryBox aiSummary={fullData.aiSummary} />
          )}

          {/* Conversation Thread */}
          <ConversationThread
            threads={fullData.threads || []}
            contactEmail={contact.email}
          />

          {/* AI-Assisted Note Writing */}
          <AIAssistedNote
            contactId={params.contactId}
            onNoteAdded={() => {
              reloadTimeline();
              handleActionComplete();
            }}
          />

          {/* Bottom Panel - Files, Notes, Photos & Timeline */}
          <Tabs defaultValue="timeline" className="w-full">
            <TabsList>
              <TabsTrigger value="timeline">
                <Clock className="h-4 w-4 mr-2" />
                Timeline
              </TabsTrigger>
              <TabsTrigger value="files">
                <FileText className="h-4 w-4 mr-2" />
                Files & Photos
              </TabsTrigger>
            </TabsList>
            <TabsContent value="timeline" className="mt-4">
              <ContactTimeline
                events={events}
                loading={timelineLoading}
                hasMore={hasMore}
                onLoadMore={loadNextPage}
                contactId={params.contactId}
                onNoteAdded={() => {
                  reloadTimeline();
                  handleActionComplete();
                }}
                onFilterChange={(types, dateFilter) => setTimelineFilters({ types, dateFilter })}
              />
            </TabsContent>
            <TabsContent value="files" className="mt-4">
              <ContactFilesTab contactId={params.contactId} />
            </TabsContent>
          </Tabs>
        </div>

        {/* Right Panel - Intelligence Modules */}
        <div className="lg:col-span-3 space-y-4">
          <IntelligenceModules
            heatScore={fullData.heatScore}
            stormImpact={stormImpact}
            insuranceSignals={insuranceSignals}
            jobValue={jobValue}
            pipelineStage={contact.pipeline_stage}
            tasks={fullData.tasks || []}
          />

          {/* Insurance Intelligence Panel (Block 19000) */}
          <InsuranceIntelligencePanel contactId={params.contactId} />

          {/* Insurance Toolkit (conditional) */}
          {fullData.insuranceMetadata && fullData.insuranceMetadata.has_insurance_claim && (
            <InsuranceToolkit
              contactId={params.contactId}
              insuranceMetadata={fullData.insuranceMetadata}
            />
          )}
        </div>
      </div>
    </div>
  );
}

