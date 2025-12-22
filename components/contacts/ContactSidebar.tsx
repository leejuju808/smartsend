"use client";

import { Contact, ContactCampaign, ContactOwner } from "@/lib/types/contact";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "../ui/button";
import { Plus, X, CheckSquare, RefreshCw, Home, MapPin, Cloud, AlertTriangle, DollarSign, TrendingUp } from "lucide-react";
import { useState } from "react";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { CreateTaskModal } from "@/components/tasks/CreateTaskModal";
import { CallActivity } from "@/components/calls/CallActivity";
import { ContactDealPanel } from "@/components/contacts/ContactDealPanel";
import { ContactTasksCard } from "@/components/contacts/ContactTasksCard";
import { ContactOwnerSelect } from "@/components/contacts/ContactOwnerSelect";

interface ContactSidebarProps {
  contact: Contact;
  tags: string[];
  campaigns: ContactCampaign[];
  owner: ContactOwner | null;
  onTagUpdate: (tags: string[]) => void;
}

export function ContactSidebar({
  contact,
  tags,
  campaigns,
  owner,
  onTagUpdate,
}: ContactSidebarProps) {
  const [newTag, setNewTag] = useState("");
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [createTaskModalOpen, setCreateTaskModalOpen] = useState(false);
  const [isEnriching, setIsEnriching] = useState(false);

  const addTag = () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      onTagUpdate([...tags, newTag.trim()]);
      setNewTag("");
      setIsAddingTag(false);
    }
  };

  const removeTag = (tagToRemove: string) => {
    onTagUpdate(tags.filter((t) => t !== tagToRemove));
  };

  const handleEnrich = async () => {
    setIsEnriching(true);
    try {
      const response = await fetch(`/api/contacts/enrich`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact_id: contact.id,
          address: contact.address,
          zip_code: contact.zip,
        }),
      });
      
      if (response.ok) {
        // Reload page to show updated enrichment data
        window.location.reload();
      } else {
        const error = await response.json();
        console.error("Enrichment failed:", error);
        alert("Failed to enrich contact. Please try again.");
      }
    } catch (error) {
      console.error("Enrichment error:", error);
      alert("Failed to enrich contact. Please try again.");
    } finally {
      setIsEnriching(false);
    }
  };

  const formatEnrichmentValue = (value: string | null | undefined): string => {
    if (!value || value === "unknown") return "—";
    return value
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  const getStormRiskBadgeColor = (risk: string | null | undefined): string => {
    switch (risk) {
      case "hail":
        return "bg-yellow-100 text-yellow-800";
      case "wind":
        return "bg-blue-100 text-blue-800";
      case "hurricane":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  // Block 15300: Format lead source for display
  const formatLeadSource = (source: string): string => {
    const sourceMap: Record<string, string> = {
      storm_outreach: "Storm Outreach",
      insurance_lead: "Insurance Lead",
      retail_lead: "Retail Lead",
      past_customer: "Past Customer",
      quote_reactivation: "Quote Reactivation",
      website_inquiry: "Website Inquiry",
      referral: "Referral",
      unknown: "Unknown",
    };
    return sourceMap[source] || source.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
  };

  // Monopoly framing: SmartSend is the default "job source" foundation.
  const computeJobSource = (raw: string | null | undefined) => {
    const source = (raw || "").trim();
    const s = source.toLowerCase();
    const primary = "SmartSend Outreach";

    if (!source) return { primary, secondary: null as string | null };

    // Treat these as SmartSend-driven outreach flows (no secondary needed)
    const isSmartSend =
      s.includes("smartsend") ||
      s.includes("storm_outreach") ||
      s.includes("quote_reactivation") ||
      s.includes("past_customer") ||
      s.includes("storm outreach") ||
      s.includes("quote reactivation") ||
      s.includes("past customer") ||
      s.includes("outreach") ||
      s.includes("campaign") ||
      s.includes("sequence") ||
      s.includes("follow-up") ||
      s.includes("autopilot");

    if (isSmartSend) return { primary, secondary: null as string | null };

    // Everything else becomes secondary context (referrals as bonus, ads as background noise, etc.)
    return { primary, secondary: formatLeadSource(source) };
  };

  const formatTemplateKey = (key: string): string => {
    const keyMap: Record<string, string> = {
      storm_damage: "Storm Damage",
      annual_inspection: "Annual Inspection",
      reactivation: "Reactivation",
    };
    return keyMap[key] || key.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
  };

  // Block 13400: Confidence badge helper
  const getConfidenceBadge = (confidence: number | null | undefined) => {
    if (!confidence) return null;
    if (confidence >= 0.7) {
      return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-[10px]">High</Badge>;
    } else if (confidence >= 0.4) {
      return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200 text-[10px]">Medium</Badge>;
    } else {
      return <Badge variant="outline" className="bg-gray-50 text-gray-600 border-gray-200 text-[10px]">Low</Badge>;
    }
  };

  // Block 13400: Format property type
  const formatPropertyType = (type: string): string => {
    const typeMap: Record<string, string> = {
      single_family: "Single Family",
      multi_family: "Multi-Family",
      commercial: "Commercial",
      unknown: "Unknown",
    };
    return typeMap[type] || type.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
  };

  const hasEnrichmentData =
    contact.county ||
    contact.roof_type_guess ||
    contact.property_type_guess ||
    contact.homeowner_likelihood ||
    contact.storm_risk_level;

  return (
    <div className="space-y-4">
      {/* Contact Info Card */}
      <Card>
        <CardHeader>
          <CardTitle>Contact Info</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <div className="text-sm text-muted-foreground">Name</div>
            <div className="font-medium">
              {contact.first_name || contact.last_name
                ? `${contact.first_name || ""} ${contact.last_name || ""}`.trim()
                : "—"}
            </div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Email</div>
            <div className="font-medium">{contact.email}</div>
          </div>
          {contact.phone && (
            <div>
              <div className="text-sm text-muted-foreground">Phone</div>
              <div className="font-medium">{contact.phone}</div>
            </div>
          )}
          {(contact.address || contact.city || contact.state || contact.zip) && (
            <div>
              <div className="text-sm text-muted-foreground">Address</div>
              <div className="font-medium">
                {[
                  contact.address,
                  contact.city,
                  contact.state,
                  contact.zip,
                ]
                  .filter(Boolean)
                  .join(", ")}
              </div>
            </div>
          )}
          {contact.timezone && (
            <div>
              <div className="text-sm text-muted-foreground">Time Zone</div>
              <div className="font-medium">{contact.timezone}</div>
            </div>
          )}
          {/* Block 15300: Lead Source */}
          {(contact as any).lead_source && (
            <div>
              <div className="text-[11px] text-gray-600 uppercase mb-1">
                Job Source
              </div>
              <div className="font-semibold text-sm">SmartSend Outreach</div>
              {computeJobSource((contact as any).lead_source).secondary && (
                <div className="mt-0.5 text-xs text-gray-500">
                  {computeJobSource((contact as any).lead_source).secondary}
                </div>
              )}
              {(contact as any).source_meta && (
                <div className="mt-2 space-y-1 text-xs text-gray-500">
                  {((contact as any).source_meta as any).campaign_id && (
                    <div>Campaign: {((contact as any).source_meta as any).campaign_id.slice(0, 8)}...</div>
                  )}
                  {((contact as any).source_meta as any).list_name && (
                    <div>List: {((contact as any).source_meta as any).list_name}</div>
                  )}
                  {((contact as any).source_meta as any).storm_name && (
                    <div>Storm: &quot;{((contact as any).source_meta as any).storm_name}&quot;</div>
                  )}
                  {((contact as any).source_meta as any).template_key && (
                    <div>Template: {formatTemplateKey(((contact as any).source_meta as any).template_key)}</div>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Block 13400: Enriched Data Card */}
      {(contact as any).enrichment && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span>Enriched Data</span>
              <Badge variant="outline" className="text-xs">
                Auto
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(contact as any).enrichment.inferred_city && (
              <div>
                <div className="text-sm text-muted-foreground flex items-center gap-2">
                  <MapPin className="h-3 w-3" />
                  City
                  {getConfidenceBadge((contact as any).enrichment.city_confidence)}
                </div>
                <div className="font-medium">
                  {(contact as any).enrichment.inferred_city}
                </div>
              </div>
            )}
            {(contact as any).enrichment.inferred_zip && (
              <div>
                <div className="text-sm text-muted-foreground flex items-center gap-2">
                  <MapPin className="h-3 w-3" />
                  ZIP Code
                  {getConfidenceBadge((contact as any).enrichment.zip_confidence)}
                </div>
                <div className="font-medium">
                  {(contact as any).enrichment.inferred_zip}
                </div>
              </div>
            )}
            {(contact as any).enrichment.inferred_neighborhood && (
              <div>
                <div className="text-sm text-muted-foreground flex items-center gap-2">
                  <MapPin className="h-3 w-3" />
                  Neighborhood
                  {getConfidenceBadge((contact as any).enrichment.neighborhood_confidence)}
                </div>
                <div className="font-medium">
                  {(contact as any).enrichment.inferred_neighborhood}
                </div>
              </div>
            )}
            {(contact as any).enrichment.property_type && (contact as any).enrichment.property_type !== 'unknown' && (
              <div>
                <div className="text-sm text-muted-foreground flex items-center gap-2">
                  <Home className="h-3 w-3" />
                  Property Type
                  {getConfidenceBadge((contact as any).enrichment.property_type_confidence)}
                </div>
                <div className="font-medium">
                  {formatPropertyType((contact as any).enrichment.property_type)}
                </div>
              </div>
            )}
            {(contact as any).enrichment.insurance_interest && (
              <div>
                <div className="text-sm text-muted-foreground flex items-center gap-2">
                  <AlertTriangle className="h-3 w-3" />
                  Insurance Interest
                </div>
                <Badge variant="outline" className="bg-yellow-50 text-yellow-800 border-yellow-200">
                  Detected
                </Badge>
              </div>
            )}
            {(contact as any).enrichment.last_enriched_at && (
              <div className="text-xs text-muted-foreground pt-2 border-t">
                Last enriched: {new Date((contact as any).enrichment.last_enriched_at).toLocaleDateString()}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Block 14400: Revenue Estimate Card */}
      {((contact as any).estimated_value_min || (contact as any).estimated_value_max || (contact as any).job_type) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              <span>Estimated Job Value</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(contact as any).estimated_value_min && (contact as any).estimated_value_max && (
              <div>
                <div className="text-sm text-muted-foreground mb-1">Value Range</div>
                <div className="text-xl font-bold text-gray-900">
                  ${((contact as any).estimated_value_min).toLocaleString()}–${((contact as any).estimated_value_max).toLocaleString()}
                </div>
                {(contact as any).job_type && (contact as any).job_type !== 'unknown' && (
                  <div className="text-xs text-gray-500 mt-1 capitalize">
                    {(contact as any).job_type === 'insurance_claim' ? 'Insurance Claim' : (contact as any).job_type.replace('_', ' ')}
                  </div>
                )}
              </div>
            )}
            {(contact as any).estimated_value_confidence && (
              <div>
                <div className="text-sm text-muted-foreground mb-1">Confidence</div>
                {getConfidenceBadge((contact as any).estimated_value_confidence)}
              </div>
            )}
            {(contact as any).revenue_category && (
              <div>
                <div className="text-sm text-muted-foreground mb-1">Revenue Category</div>
                <Badge variant="outline" className="capitalize">
                  {(contact as any).revenue_category}
                </Badge>
              </div>
            )}
            {/* Breakdown */}
            <div className="pt-3 border-t space-y-2 text-xs">
              {(contact as any).job_type === 'storm_damage' && (
                <div className="flex items-center gap-2 text-gray-600">
                  <Cloud className="h-3 w-3" />
                  <span>Storm damage detected</span>
                </div>
              )}
              {(contact as any).job_type === 'insurance_claim' && (
                <div className="flex items-center gap-2 text-gray-600">
                  <AlertTriangle className="h-3 w-3" />
                  <span>Insurance claim possible</span>
                </div>
              )}
              {(contact as any).enrichment?.inferred_neighborhood && (
                <div className="flex items-center gap-2 text-gray-600">
                  <MapPin className="h-3 w-3" />
                  <span>Neighborhood: {(contact as any).enrichment.inferred_neighborhood}</span>
                </div>
              )}
              {(contact as any).lead_score !== null &&
                (contact as any).lead_score !== undefined && (
                <div className="flex items-center gap-2 text-gray-600">
                  <TrendingUp className="h-3 w-3" />
                  <span>
                    Lead Score: {(contact as any).lead_score}{" "}
                    {(contact as any).lead_score >= 80
                      ? "(HOT)"
                      : (contact as any).lead_score >= 40
                        ? "(WARM)"
                        : "(COLD)"}
                  </span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lead Details Card */}
      <Card>
        <CardHeader>
          <CardTitle>Lead Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Block 16300: Owner selector */}
          <ContactOwnerSelect
            contactId={contact.id}
            currentOwnerId={(contact as any).owner_user_id || owner?.id || null}
            onOwnerChange={() => {
              // Reload page to show updated owner
              window.location.reload();
            }}
          />
          {/* Pipeline Stage - Block 14900 */}
          {contact.pipeline_stage && (
            <div>
              <div className="text-sm text-muted-foreground mb-1">Pipeline Stage</div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] bg-slate-100 text-gray-700 uppercase">
                  {contact.pipeline_stage.label}
                </span>
                <Link
                  href="/pipeline"
                  className="text-[10px] text-blue-600 hover:underline"
                >
                  View in pipeline
                </Link>
              </div>
            </div>
          )}
          {campaigns.length > 0 && (
            <div>
              <div className="text-sm text-muted-foreground mb-2">Campaigns</div>
              <div className="space-y-1">
                {campaigns.map((campaign) => (
                  <a
                    key={campaign.id}
                    href={`/campaigns/${campaign.id}`}
                    className="block text-sm text-blue-500 hover:underline"
                  >
                    {campaign.name}
                  </a>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Deal Panel - Block 14400 */}
      <ContactDealPanel
        contactId={contact.id}
        initialLeadStatus={contact.lead_status || "new"}
        initialEst={contact.est_job_value ?? null}
        initialActual={contact.actual_job_value ?? null}
      />

      {/* Tasks Card - Block 14700 */}
      <ContactTasksCard contactId={contact.id} />

      {/* Tags Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Tags</CardTitle>
            <Dialog open={isAddingTag} onOpenChange={setIsAddingTag}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="xs">
                  <Plus className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Tag</DialogTitle>
                  <DialogDescription>
                    Add a new tag to this contact
                  </DialogDescription>
                </DialogHeader>
                <div className="flex gap-2">
                  <Input
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        addTag();
                      }
                    }}
                    placeholder="Enter tag name"
                  />
                  <Button onClick={addTag}>Add</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {tags.length === 0 ? (
            <div className="text-sm text-muted-foreground">No tags</div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="flex items-center gap-1">
                  {tag}
                  <button
                    onClick={() => removeTag(tag)}
                    className="ml-1 hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Call Activity Card */}
      <Card>
        <CardHeader>
          <CardTitle>Call Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <CallActivity contactId={contact.id} contactPhone={contact.phone} />
        </CardContent>
      </Card>

      {/* Property Enrichment Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Property Enrichment</CardTitle>
            <Button
              variant="ghost"
              size="xs"
              onClick={handleEnrich}
              disabled={isEnriching}
            >
              <RefreshCw className={`h-4 w-4 ${isEnriching ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {!hasEnrichmentData ? (
            <div className="text-sm text-muted-foreground">
              {contact.address || contact.zip
                ? "Click refresh to enrich this contact"
                : "Add an address to enable enrichment"}
            </div>
          ) : (
            <>
              {contact.roof_type_guess && (
                <div>
                  <div className="text-sm text-muted-foreground flex items-center gap-1">
                    <Home className="h-3 w-3" />
                    Roof Type (guess)
                  </div>
                  <div className="font-medium">
                    {formatEnrichmentValue(contact.roof_type_guess)}
                  </div>
                </div>
              )}
              {contact.property_type_guess && (
                <div>
                  <div className="text-sm text-muted-foreground flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    Property Type
                  </div>
                  <div className="font-medium">
                    {formatEnrichmentValue(contact.property_type_guess)}
                  </div>
                </div>
              )}
              {contact.homeowner_likelihood && (
                <div>
                  <div className="text-sm text-muted-foreground">Homeowner Likelihood</div>
                  <div className="font-medium">
                    {formatEnrichmentValue(contact.homeowner_likelihood)}
                  </div>
                </div>
              )}
              {contact.county && (
                <div>
                  <div className="text-sm text-muted-foreground">County</div>
                  <div className="font-medium">{contact.county}</div>
                </div>
              )}
              {contact.timezone && (
                <div>
                  <div className="text-sm text-muted-foreground">Timezone</div>
                  <div className="font-medium">{contact.timezone}</div>
                </div>
              )}
              {contact.storm_risk_level && contact.storm_risk_level !== "low" && (
                <div>
                  <div className="text-sm text-muted-foreground flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    Storm Region
                  </div>
                  <Badge className={getStormRiskBadgeColor(contact.storm_risk_level)}>
                    {formatEnrichmentValue(contact.storm_risk_level)}
                  </Badge>
                </div>
              )}
              {contact.enriched_at && (
                <div className="pt-2 border-t">
                  <div className="text-xs text-muted-foreground">
                    Enriched: {new Date(contact.enriched_at).toLocaleDateString()}
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Upcoming Tasks */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Tasks</CardTitle>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => setCreateTaskModalOpen(true)}
            >
              <CheckSquare className="h-4 w-4 mr-1" />
              Add Task
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">
            <a
              href={`/tasks?contactId=${contact.id}`}
              className="text-blue-500 hover:underline"
            >
              View all tasks →
            </a>
          </div>
        </CardContent>
      </Card>

      <CreateTaskModal
        open={createTaskModalOpen}
        onClose={() => setCreateTaskModalOpen(false)}
        onTaskCreated={() => {
          setCreateTaskModalOpen(false);
          // Optionally reload tasks or show success message
        }}
        contactId={contact.id}
        campaignId={campaigns[0]?.id}
        defaultPriority="normal"
      />
    </div>
  );
}

