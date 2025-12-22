// Block 16500 — Insurance Toolkit Panel
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/Button";
import { 
  Shield, 
  CheckSquare, 
  FileText, 
  Clock, 
  AlertCircle,
  CheckCircle2
} from "lucide-react";
import { useState } from "react";

interface InsuranceToolkitProps {
  contactId: string;
  insuranceMetadata: {
    has_insurance_claim: boolean;
    claim_number: string | null;
    adjuster_name: string | null;
    adjuster_phone: string | null;
    adjuster_email: string | null;
    claim_date: string | null;
    claim_status: string | null;
  } | null;
}

export function InsuranceToolkit({ contactId, insuranceMetadata }: InsuranceToolkitProps) {
  const [completedItems, setCompletedItems] = useState<Set<string>>(new Set());

  const checklistItems = [
    { id: "prep", label: "Pre-inspection checklist completed", icon: CheckSquare },
    { id: "adjuster", label: "Adjuster contact info documented", icon: Shield },
    { id: "claim", label: "Claim number recorded", icon: FileText },
    { id: "timeline", label: "Claim timeline established", icon: Clock },
    { id: "deductible", label: "Deductible amount confirmed", icon: AlertCircle },
    { id: "followup", label: "Follow-up tasks scheduled", icon: CheckCircle2 },
  ];

  const toggleItem = (itemId: string) => {
    const newCompleted = new Set(completedItems);
    if (newCompleted.has(itemId)) {
      newCompleted.delete(itemId);
    } else {
      newCompleted.add(itemId);
    }
    setCompletedItems(newCompleted);
  };

  if (!insuranceMetadata || !insuranceMetadata.has_insurance_claim) {
    return null;
  }

  return (
    <Card className="border-2 border-purple-300 bg-gradient-to-br from-purple-50 to-white">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Shield className="h-5 w-5 text-purple-600" />
          <span>Insurance Toolkit</span>
          <Badge variant="outline" className="ml-auto bg-purple-100 text-purple-700">
            High-Value Opportunity
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Adjuster Prep Checklist */}
        <div>
          <h3 className="font-semibold text-sm mb-2">Adjuster Prep Checklist</h3>
          <div className="space-y-2">
            {checklistItems.map((item) => {
              const Icon = item.icon;
              const isCompleted = completedItems.has(item.id);
              return (
                <div
                  key={item.id}
                  className="flex items-center gap-2 p-2 bg-white rounded border cursor-pointer hover:bg-gray-50"
                  onClick={() => toggleItem(item.id)}
                >
                  <input
                    type="checkbox"
                    checked={isCompleted}
                    readOnly
                    className="rounded"
                  />
                  <Icon className={`h-4 w-4 ${isCompleted ? "text-green-600" : "text-gray-400"}`} />
                  <span className={`text-sm ${isCompleted ? "line-through text-muted-foreground" : ""}`}>
                    {item.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Insurance Info Display */}
        {insuranceMetadata.claim_number && (
          <div className="p-3 bg-purple-100 rounded-lg">
            <div className="text-xs text-muted-foreground mb-1">Claim Number</div>
            <div className="font-mono font-semibold">{insuranceMetadata.claim_number}</div>
          </div>
        )}

        {insuranceMetadata.adjuster_name && (
          <div className="p-3 bg-purple-100 rounded-lg space-y-2">
            <div>
              <div className="text-xs text-muted-foreground mb-1">Adjuster</div>
              <div className="font-semibold">{insuranceMetadata.adjuster_name}</div>
            </div>
            {insuranceMetadata.adjuster_phone && (
              <div>
                <div className="text-xs text-muted-foreground mb-1">Phone</div>
                <a href={`tel:${insuranceMetadata.adjuster_phone}`} className="text-sm text-blue-600 hover:underline">
                  {insuranceMetadata.adjuster_phone}
                </a>
              </div>
            )}
            {insuranceMetadata.adjuster_email && (
              <div>
                <div className="text-xs text-muted-foreground mb-1">Email</div>
                <a href={`mailto:${insuranceMetadata.adjuster_email}`} className="text-sm text-blue-600 hover:underline">
                  {insuranceMetadata.adjuster_email}
                </a>
              </div>
            )}
          </div>
        )}

        {/* Insurance Templates */}
        <div>
          <h3 className="font-semibold text-sm mb-2">Recommended Templates</h3>
          <div className="space-y-2">
            <Button variant="outline" size="sm" className="w-full justify-start">
              <FileText className="h-4 w-4 mr-2" />
              Insurance Claim Follow-Up
            </Button>
            <Button variant="outline" size="sm" className="w-full justify-start">
              <Shield className="h-4 w-4 mr-2" />
              Deductible Explanation
            </Button>
            <Button variant="outline" size="sm" className="w-full justify-start">
              <Clock className="h-4 w-4 mr-2" />
              Pre-Inspection Reminder
            </Button>
          </div>
        </div>

        {/* Recommended Timelines */}
        <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
          <h3 className="font-semibold text-sm mb-2">Recommended Timeline</h3>
          <div className="text-xs space-y-1 text-muted-foreground">
            <div>• Contact adjuster within 24 hours</div>
            <div>• Schedule inspection within 48 hours</div>
            <div>• Submit estimate within 7 days</div>
            <div>• Follow up on claim status weekly</div>
          </div>
        </div>

        {/* Claim Follow-Up Tasks */}
        <div>
          <h3 className="font-semibold text-sm mb-2">Claim Follow-Up Tasks</h3>
          <Button
            variant="default"
            size="sm"
            className="w-full"
            onClick={() => {
              // Create follow-up tasks
              fetch(`/api/contacts/${contactId}/tasks`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  title: "Follow up on insurance claim",
                  due_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                }),
              });
            }}
          >
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Create Follow-Up Tasks
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}





















































