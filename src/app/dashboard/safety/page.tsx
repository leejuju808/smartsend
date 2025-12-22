"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Shield, ClipboardCheck, AlertTriangle, Award, CheckCircle2, XCircle } from "lucide-react";
import Link from "next/link";
import { ToolboxTalkModal } from "@/components/safety/ToolboxTalkModal";
import { PPECheckModal } from "@/components/safety/PPECheckModal";
import { IncidentReportModal } from "@/components/safety/IncidentReportModal";
import { CertificationsList } from "@/components/safety/CertificationsList";

interface SafetySummary {
  today_toolbox_talk: {
    done: boolean;
    topic?: string;
    id?: string;
  };
  ppe_compliance: {
    total_checks: number;
    passed: number;
    failed: number;
  };
  open_incidents: number;
  expiring_certifications: number;
  incidents: Array<{
    id: string;
    type: string;
    severity: string;
    date: string;
  }>;
  certifications: Array<{
    id: string;
    user_id: string;
    type: string;
    expiration_date: string;
  }>;
}

export default function SafetyPage() {
  const [summary, setSummary] = useState<SafetySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [showToolboxModal, setShowToolboxModal] = useState(false);
  const [showPPEModal, setShowPPEModal] = useState(false);
  const [showIncidentModal, setShowIncidentModal] = useState(false);

  useEffect(() => {
    fetchSummary();
  }, []);

  const fetchSummary = async () => {
    try {
      const res = await fetch("/api/safety/summary");
      const data = await res.json();
      if (data.ok) {
        setSummary(data.data);
      }
    } catch (error) {
      console.error("Error fetching safety summary:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-32 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Safety Compliance</h1>
          <p className="text-muted-foreground mt-1">
            Stay compliant, avoid fines, protect your crew
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setShowToolboxModal(true)}>
            <ClipboardCheck className="mr-2 h-4 w-4" />
            Start Toolbox Talk
          </Button>
          <Button variant="outline" onClick={() => setShowPPEModal(true)}>
            <Shield className="mr-2 h-4 w-4" />
            PPE Check
          </Button>
          <Button variant="outline" onClick={() => setShowIncidentModal(true)}>
            <AlertTriangle className="mr-2 h-4 w-4" />
            Report Incident
          </Button>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Today's Toolbox Talk */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4" />
              Today's Toolbox Talk
            </CardTitle>
          </CardHeader>
          <CardContent>
            {summary?.today_toolbox_talk.done ? (
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <div>
                  <p className="text-sm font-medium">Done</p>
                  <p className="text-xs text-muted-foreground">
                    {summary.today_toolbox_talk.topic}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <XCircle className="h-5 w-5 text-red-600" />
                <div>
                  <p className="text-sm font-medium">Not Done</p>
                  <p className="text-xs text-muted-foreground">
                    Start your daily safety meeting
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* PPE Compliance */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Shield className="h-4 w-4" />
              PPE Compliance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              <p className="text-2xl font-bold">
                {summary?.ppe_compliance.total_checks || 0}
              </p>
              <p className="text-xs text-muted-foreground">
                {summary?.ppe_compliance.passed || 0} passed,{" "}
                {summary?.ppe_compliance.failed || 0} failed
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Open Incidents */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Open Incidents
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              <p className="text-2xl font-bold">
                {summary?.open_incidents || 0}
              </p>
              <p className="text-xs text-muted-foreground">
                Requiring follow-up
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Expiring Certifications */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Award className="h-4 w-4" />
              Expiring Certifications
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              <p className="text-2xl font-bold">
                {summary?.expiring_certifications || 0}
              </p>
              <p className="text-xs text-muted-foreground">
                Within 30 days
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Incidents */}
      {summary && summary.incidents.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent High-Priority Incidents</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {summary.incidents.slice(0, 5).map((incident) => (
                <div
                  key={incident.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div>
                    <p className="text-sm font-medium">{incident.type}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(incident.date).toLocaleDateString()}
                    </p>
                  </div>
                  <span
                    className={`px-2 py-1 rounded text-xs font-medium ${
                      incident.severity === "Critical"
                        ? "bg-red-100 text-red-700"
                        : "bg-orange-100 text-orange-700"
                    }`}
                  >
                    {incident.severity}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Certifications */}
      <Card>
        <CardHeader>
          <CardTitle>Certification Tracking</CardTitle>
        </CardHeader>
        <CardContent>
          <CertificationsList />
        </CardContent>
      </Card>

      {/* Modals */}
      {showToolboxModal && (
        <ToolboxTalkModal
          open={showToolboxModal}
          onClose={() => {
            setShowToolboxModal(false);
            fetchSummary();
          }}
        />
      )}

      {showPPEModal && (
        <PPECheckModal
          open={showPPEModal}
          onClose={() => {
            setShowPPEModal(false);
            fetchSummary();
          }}
        />
      )}

      {showIncidentModal && (
        <IncidentReportModal
          open={showIncidentModal}
          onClose={() => {
            setShowIncidentModal(false);
            fetchSummary();
          }}
        />
      )}
    </div>
  );
}



























