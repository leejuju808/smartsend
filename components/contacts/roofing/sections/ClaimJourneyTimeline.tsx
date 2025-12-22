// Block 21050 — Insurance Timeline Engine v2 — Claim Journey Timeline
// Enhanced timeline with confidence scores, discrepancies, and 13+ claim milestones

"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/badge";
import { Clock, CheckCircle2, XCircle, FileText, User, Calendar, AlertTriangle, DollarSign, Camera, Mail, Phone } from "lucide-react";
import { format } from "date-fns";

interface TimelineEvent {
  id: string;
  event_type: string;
  event_date?: string | null;
  event_time?: string | null;
  event_payload?: any;
  structured_data?: any;
  detected_from?: string | null;
  source_type?: string | null;
  detection_confidence?: number | null;
  confidence_score?: number | null;
  raw_text?: string | null;
  created_at: string;
}

interface Discrepancy {
  id: string;
  discrepancy_type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  detected_value: any;
  detected_at: string;
}

interface ClaimJourneyTimelineProps {
  timeline: TimelineEvent[];
  discrepancies?: Discrepancy[];
}

export function ClaimJourneyTimeline({ timeline, discrepancies = [] }: ClaimJourneyTimelineProps) {
  const formatEventType = (type: string) => {
    const typeMap: Record<string, string> = {
      // Original v1 events
      STORM_EVENT: "Storm Detected",
      CLAIM_FILED: "Claim Filed",
      ADJUSTER_ASSIGNED: "Adjuster Assigned",
      ADJUSTER_VISIT: "Adjuster Visit",
      CLAIM_APPROVED: "Approved",
      CLAIM_DENIED: "Denied",
      SCOPE_PARSED: "Scope Parsed",
      INSTALL_READY: "Install Ready",
      FOLLOW_UP_SENT: "Follow-Up Sent",
      QUOTE_SENT: "Quote Sent",
      DEPRECIATION_RELEASED: "Depreciation Released",
      SUPPLEMENT_SUBMITTED: "Supplement Submitted",
      MANUAL_STAGE_UPDATE: "Stage Updated",
      ADJUSTER_CONTACTED: "Adjuster Contacted",
      // New v2 events
      STORM_DATE: "Storm Date",
      CLAIM_FILED_DATE: "Claim Filed Date",
      FIRST_CONTACT_FROM_CARRIER: "First Contact from Carrier",
      ADJUSTER_ASSIGNED_DESK: "Desk Adjuster Assigned",
      ADJUSTER_ASSIGNED_FIELD: "Field Adjuster Assigned",
      ADJUSTER_APPOINTMENT: "Adjuster Appointment",
      PHOTOS_REQUESTED: "Photos Requested",
      DOCUMENTS_REQUESTED: "Documents Requested",
      SCOPE_SENT: "Scope Sent",
      PRICING_UPDATED: "Pricing Updated",
      SUPPLEMENT_REQUESTED: "Supplement Requested",
      SUPPLEMENT_APPROVED: "Supplement Approved",
      CLAIM_APPROVED_ACV: "Claim Approved (ACV)",
      CLAIM_APPROVED_RCV: "Claim Approved (RCV)",
      PAYMENT_SENT: "Payment Sent",
      FUNDS_DISBURSED: "Funds Disbursed",
    };
    return typeMap[type] || type.replace(/_/g, " ");
  };

  const getEventIcon = (type: string) => {
    if (type === "CLAIM_APPROVED" || type === "CLAIM_APPROVED_RCV" || type === "INSTALL_READY") {
      return <CheckCircle2 className="h-4 w-4 text-green-600" />;
    }
    if (type === "CLAIM_DENIED") {
      return <XCircle className="h-4 w-4 text-red-600" />;
    }
    if (type.includes("ADJUSTER")) {
      return <User className="h-4 w-4 text-blue-600" />;
    }
    if (type.includes("STORM")) {
      return <Calendar className="h-4 w-4 text-orange-600" />;
    }
    if (type.includes("PAYMENT") || type.includes("FUNDS") || type.includes("DISBURSED")) {
      return <DollarSign className="h-4 w-4 text-green-600" />;
    }
    if (type.includes("PHOTO")) {
      return <Camera className="h-4 w-4 text-purple-600" />;
    }
    if (type.includes("DOCUMENT") || type.includes("SCOPE")) {
      return <FileText className="h-4 w-4 text-blue-600" />;
    }
    return <Clock className="h-4 w-4 text-gray-600" />;
  };

  const getEventColor = (type: string) => {
    if (type === "CLAIM_APPROVED" || type === "CLAIM_APPROVED_RCV" || type === "INSTALL_READY") {
      return "bg-green-50 border-green-200";
    }
    if (type === "CLAIM_DENIED") {
      return "bg-red-50 border-red-200";
    }
    if (type.includes("ADJUSTER")) {
      return "bg-blue-50 border-blue-200";
    }
    if (type.includes("PAYMENT") || type.includes("FUNDS")) {
      return "bg-emerald-50 border-emerald-200";
    }
    if (type.includes("STORM")) {
      return "bg-orange-50 border-orange-200";
    }
    return "bg-gray-50 border-gray-200";
  };

  const getSourceIcon = (sourceType?: string | null) => {
    if (!sourceType) return null;
    if (sourceType.includes('email')) return <Mail className="h-3 w-3" />;
    if (sourceType.includes('phone')) return <Phone className="h-3 w-3" />;
    if (sourceType.includes('pdf')) return <FileText className="h-3 w-3" />;
    return null;
  };

  const getConfidenceColor = (score?: number | null) => {
    if (!score) return "text-gray-500";
    if (score >= 0.9) return "text-green-600";
    if (score >= 0.7) return "text-blue-600";
    if (score >= 0.5) return "text-yellow-600";
    return "text-red-600";
  };

  const formatDiscrepancyType = (type: string) => {
    const typeMap: Record<string, string> = {
      APPROVAL_AMOUNT_MISMATCH: "Approval Amount Mismatch",
      APPROVAL_STATUS_MISMATCH: "Approval Status Conflict",
      ADJUSTER_DATE_CONFLICT: "Adjuster Date Conflict",
      SUPPLEMENT_STATUS_MISMATCH: "Supplement Status Mismatch",
      PAYMENT_MISSING_DEPRECIATION: "Payment Missing Depreciation",
      SCOPE_MISSING_ITEMS: "Scope Missing Items",
      MULTIPLE_APPROVAL_DATES: "Multiple Approval Dates",
      CLAIM_NUMBER_MISMATCH: "Claim Number Mismatch",
      ADJUSTER_NAME_MISMATCH: "Adjuster Name Mismatch",
      CARRIER_MISMATCH: "Carrier Mismatch",
    };
    return typeMap[type] || type.replace(/_/g, " ");
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-100 border-red-300 text-red-800';
      case 'high': return 'bg-orange-100 border-orange-300 text-orange-800';
      case 'medium': return 'bg-yellow-100 border-yellow-300 text-yellow-800';
      case 'low': return 'bg-blue-100 border-blue-300 text-blue-800';
      default: return 'bg-gray-100 border-gray-300';
    }
  };

  // Sort timeline by date/time
  const sortedTimeline = [...timeline].sort((a, b) => {
    const dateA = a.event_time ? new Date(a.event_time) : (a.event_date ? new Date(a.event_date) : new Date(a.created_at));
    const dateB = b.event_time ? new Date(b.event_time) : (b.event_date ? new Date(b.event_date) : new Date(b.created_at));
    return dateA.getTime() - dateB.getTime();
  });

  if (!timeline || timeline.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Insurance Claim Timeline (SmartSend v2)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Discrepancies Alert */}
        {discrepancies && discrepancies.length > 0 && (
          <div className="space-y-2">
            {discrepancies.map((disc) => (
              <div
                key={disc.id}
                className={`flex items-start gap-2 p-3 rounded-lg border ${getSeverityColor(disc.severity)}`}
              >
                <AlertTriangle className="h-4 w-4 mt-0.5" />
                <div className="flex-1">
                  <div className="font-medium text-sm">{formatDiscrepancyType(disc.discrepancy_type)}</div>
                  <div className="text-xs mt-1 opacity-90">
                    Detected: {format(new Date(disc.detected_at), "MMM d, yyyy")}
                  </div>
                  {disc.detected_value && typeof disc.detected_value === 'object' && (
                    <div className="text-xs mt-1 opacity-75">
                      {disc.detected_value.amounts && `Amounts: ${disc.detected_value.amounts.join(', ')}`}
                      {disc.detected_value.dates && `Dates: ${disc.detected_value.dates.join(', ')}`}
                    </div>
                  )}
                </div>
                <Badge variant="outline" className="text-xs capitalize">
                  {disc.severity}
                </Badge>
              </div>
            ))}
          </div>
        )}

        {/* Timeline Events */}
        <div className="space-y-2">
          {sortedTimeline.map((event, idx) => {
            const confidence = event.confidence_score ?? event.detection_confidence;
            const displayDate = event.event_time 
              ? new Date(event.event_time)
              : (event.event_date ? new Date(event.event_date) : new Date(event.created_at));
            
            return (
              <div
                key={event.id}
                className={`flex items-start gap-3 p-3 rounded-lg border ${getEventColor(event.event_type)}`}
              >
                <div className="mt-0.5">{getEventIcon(event.event_type)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-medium text-sm">{formatEventType(event.event_type)}</span>
                    {confidence !== null && confidence !== undefined && (
                      <Badge 
                        variant="outline" 
                        className={`text-xs ${getConfidenceColor(confidence)}`}
                        title={`Confidence: ${Math.round(confidence * 100)}%`}
                      >
                        {Math.round(confidence * 100)}%
                      </Badge>
                    )}
                    {event.source_type && (
                      <Badge variant="outline" className="text-xs flex items-center gap-1">
                        {getSourceIcon(event.source_type)}
                        {event.source_type.replace('email_', '').replace('pdf_', '').replace('_', ' ')}
                      </Badge>
                    )}
                    {event.detected_from && !event.source_type && (
                      <Badge variant="outline" className="text-xs">
                        {event.detected_from}
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {event.event_time 
                      ? format(displayDate, "MMM d, yyyy 'at' h:mm a")
                      : format(displayDate, "MMM d, yyyy")}
                  </div>
                  {(event.event_payload || event.structured_data) && (
                    <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                      {event.event_payload?.rcv_total && (
                        <div>RCV: ${event.event_payload.rcv_total.toLocaleString()}</div>
                      )}
                      {event.event_payload?.acv_total && (
                        <div>ACV: ${event.event_payload.acv_total.toLocaleString()}</div>
                      )}
                      {event.structured_data?.amount && (
                        <div>Amount: ${event.structured_data.amount.toLocaleString()}</div>
                      )}
                      {event.event_payload?.adjuster_name || event.structured_data?.adjuster_name ? (
                        <div>Adjuster: {event.event_payload?.adjuster_name || event.structured_data?.adjuster_name}</div>
                      ) : null}
                      {event.event_payload?.claim_number || event.structured_data?.claim_number ? (
                        <div>Claim #: {event.event_payload?.claim_number || event.structured_data?.claim_number}</div>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

