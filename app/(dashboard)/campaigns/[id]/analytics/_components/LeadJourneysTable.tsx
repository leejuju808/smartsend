"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CampaignAnalytics } from "../types";
import { Button } from "@/components/ui/button";
import { ChevronRight } from "lucide-react";
import { useState } from "react";

interface LeadJourneysTableProps {
  contacts: CampaignAnalytics["contacts"];
}

export function LeadJourneysTable({ contacts }: LeadJourneysTableProps) {
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const formatCurrency = (num: number | null) => {
    if (num === null) return "—";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(num);
  };

  const getIntentColor = (intent: string) => {
    switch (intent.toLowerCase()) {
      case "hot":
        return "text-red-600 bg-red-50";
      case "warm":
        return "text-orange-600 bg-orange-50";
      default:
        return "text-gray-600 bg-gray-50";
    }
  };

  const getOutcomeColor = (outcome: string) => {
    switch (outcome) {
      case "Customer":
        return "text-emerald-600 font-semibold";
      case "Estimate Booked":
        return "text-purple-600";
      case "Hot Lead":
        return "text-red-600";
      case "Warm Lead":
        return "text-orange-600";
      case "Replied":
        return "text-green-600";
      default:
        return "text-gray-600";
    }
  };

  return (
    <Card className="rounded-lg">
      <CardHeader>
        <CardTitle>Lead Journeys</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Contact</TableHead>
              <TableHead>Step Replied</TableHead>
              <TableHead>Intent</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Outcome</TableHead>
              <TableHead className="text-right">Revenue</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contacts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  No contacts found
                </TableCell>
              </TableRow>
            ) : (
              contacts.map((contact) => (
                <>
                  <TableRow
                    key={contact.contactId}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() =>
                      setExpandedRow(
                        expandedRow === contact.contactId ? null : contact.contactId
                      )
                    }
                  >
                    <TableCell>
                      <div>
                        <p className="font-medium">{contact.name}</p>
                        <p className="text-sm text-muted-foreground">{contact.email}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      {contact.stepReplied
                        ? `Step ${contact.stepReplied}`
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {contact.latestIntent !== "unclassified" ? (
                        <span
                          className={`px-2 py-1 rounded text-xs font-medium ${getIntentColor(
                            contact.latestIntent
                          )}`}
                        >
                          {contact.latestIntent.toUpperCase()}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{contact.status}</span>
                    </TableCell>
                    <TableCell>
                      <span className={`text-sm ${getOutcomeColor(contact.outcome)}`}>
                        {contact.outcome}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="font-semibold">
                        {formatCurrency(contact.revenue)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedRow(
                            expandedRow === contact.contactId ? null : contact.contactId
                          );
                        }}
                      >
                        <ChevronRight
                          className={`h-4 w-4 transition-transform ${
                            expandedRow === contact.contactId ? "rotate-90" : ""
                          }`}
                        />
                      </Button>
                    </TableCell>
                  </TableRow>
                  {expandedRow === contact.contactId && (
                    <TableRow>
                      <TableCell colSpan={7} className="bg-muted/30">
                        <div className="p-4 space-y-2">
                          <p className="text-sm font-medium mb-2">Journey Timeline</p>
                          <div className="space-y-1 text-sm">
                            {contact.replied ? (
                              <>
                                <div className="flex items-center gap-2">
                                  <span className="text-green-600">✓</span>
                                  <span>
                                    Replied at {contact.replyStepName || "Step 1"}
                                  </span>
                                  {contact.lastActivity && (
                                    <span className="text-muted-foreground">
                                      ({new Date(contact.lastActivity).toLocaleDateString()})
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-blue-600">→</span>
                                  <span>
                                    Marked as {contact.latestIntent.toUpperCase()}
                                  </span>
                                </div>
                                {contact.outcome === "Customer" && (
                                  <div className="flex items-center gap-2">
                                    <span className="text-emerald-600">✓</span>
                                    <span>Won Job</span>
                                    {contact.revenue && (
                                      <span className="font-semibold text-emerald-600">
                                        {formatCurrency(contact.revenue)}
                                      </span>
                                    )}
                                  </div>
                                )}
                                {contact.outcome === "Estimate Booked" && (
                                  <div className="flex items-center gap-2">
                                    <span className="text-purple-600">✓</span>
                                    <span>Estimate Booked</span>
                                  </div>
                                )}
                              </>
                            ) : (
                              <div className="flex items-center gap-2">
                                <span className="text-gray-400">○</span>
                                <span className="text-muted-foreground">No reply yet</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

