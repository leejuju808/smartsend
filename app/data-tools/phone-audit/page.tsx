// Block 17900 — SmartSend Phone Number Intelligence v1
// Bulk Phone Audit Tool

"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Phone,
  Search,
  Download,
  Filter,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Smartphone,
  Landline,
  MessageSquare,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface PhoneAuditResult {
  contactId: string;
  phone: string;
  email: string;
  name: string;
  address: string;
  lineType: string;
  carrier: string | null;
  smsReadiness: string;
  qualityScore: number;
  spamRiskScore: number;
  homeownerLikelihood: string;
  tags: string[];
  isValid: boolean;
  isDisconnected: boolean;
  error?: string;
}

interface AuditSummary {
  mobile: number;
  landline: number;
  voip: number;
  disconnected: number;
  smsReady: number;
  highQuality: number;
  lowQuality: number;
  spamRisk: number;
}

export default function PhoneAuditPage() {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<PhoneAuditResult[]>([]);
  const [summary, setSummary] = useState<AuditSummary | null>(null);
  const [filters, setFilters] = useState({
    minQualityScore: "",
    lineTypes: [] as string[],
  });
  const [filteredResults, setFilteredResults] = useState<PhoneAuditResult[]>([]);

  useEffect(() => {
    // Apply filters
    let filtered = [...results];

    if (filters.minQualityScore) {
      const minScore = parseInt(filters.minQualityScore);
      if (!isNaN(minScore)) {
        filtered = filtered.filter((r) => r.qualityScore >= minScore);
      }
    }

    if (filters.lineTypes.length > 0) {
      filtered = filtered.filter((r) => filters.lineTypes.includes(r.lineType));
    }

    setFilteredResults(filtered);
  }, [results, filters]);

  const handleAudit = async () => {
    setLoading(true);
    setResults([]);
    setSummary(null);

    try {
      const response = await fetch("/api/phone/audit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          limit: 1000,
          minQualityScore: filters.minQualityScore
            ? parseInt(filters.minQualityScore)
            : undefined,
          lineTypes: filters.lineTypes.length > 0 ? filters.lineTypes : undefined,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to audit phone numbers");
      }

      const data = await response.json();
      setResults(data.results || []);
      setSummary(data.summary || null);
    } catch (error: any) {
      console.error("Error auditing phones:", error);
      alert(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    const csv = [
      [
        "Phone",
        "Email",
        "Name",
        "Address",
        "Line Type",
        "Carrier",
        "SMS Readiness",
        "Quality Score",
        "Spam Risk Score",
        "Homeowner Likelihood",
        "Tags",
        "Valid",
        "Disconnected",
      ].join(","),
      ...filteredResults.map((r) =>
        [
          r.phone,
          r.email,
          `"${r.name}"`,
          `"${r.address}"`,
          r.lineType,
          r.carrier || "",
          r.smsReadiness,
          r.qualityScore,
          r.spamRiskScore,
          r.homeownerLikelihood,
          `"${r.tags.join(", ")}"`,
          r.isValid ? "Yes" : "No",
          r.isDisconnected ? "Yes" : "No",
        ].join(",")
      ),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `phone-audit-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const getLineTypeIcon = (lineType: string) => {
    switch (lineType) {
      case "mobile":
        return <Smartphone className="h-4 w-4" />;
      case "landline":
        return <Landline className="h-4 w-4" />;
      case "voip":
        return <Phone className="h-4 w-4" />;
      default:
        return <Phone className="h-4 w-4" />;
    }
  };

  const getQualityScoreColor = (score: number) => {
    if (score >= 90) return "text-green-600";
    if (score >= 70) return "text-blue-600";
    if (score >= 50) return "text-yellow-600";
    return "text-red-600";
  };

  const getQualityBadge = (score: number) => {
    if (score >= 90) return <Badge className="bg-green-100 text-green-800">High Quality</Badge>;
    if (score >= 70) return <Badge className="bg-blue-100 text-blue-800">Normal</Badge>;
    if (score >= 50) return <Badge className="bg-yellow-100 text-yellow-800">Low Quality</Badge>;
    return <Badge className="bg-red-100 text-red-800">Suspect</Badge>;
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Phone Number Audit Tool</h1>
        <p className="text-muted-foreground">
          Scan your entire database, flag bad numbers, and identify high-quality leads
        </p>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Mobile Numbers
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.mobile}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {results.length > 0
                  ? Math.round((summary.mobile / results.length) * 100)
                  : 0}
                % of total
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                SMS Ready
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.smsReady}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {results.length > 0
                  ? Math.round((summary.smsReady / results.length) * 100)
                  : 0}
                % of total
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                High Quality
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{summary.highQuality}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Score ≥ 90
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Spam Risk
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{summary.spamRisk}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Needs review
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters and Actions */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Audit Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="text-sm font-medium mb-1 block">
                Minimum Quality Score
              </label>
              <Input
                type="number"
                placeholder="e.g., 70"
                value={filters.minQualityScore}
                onChange={(e) =>
                  setFilters({ ...filters, minQualityScore: e.target.value })
                }
              />
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleAudit}
                disabled={loading}
                className="flex items-center gap-2"
              >
                <Search className="h-4 w-4" />
                {loading ? "Auditing..." : "Run Audit"}
              </Button>

              {results.length > 0 && (
                <Button
                  onClick={handleExport}
                  variant="outline"
                  className="flex items-center gap-2"
                >
                  <Download className="h-4 w-4" />
                  Export CSV
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results Table */}
      {results.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              Audit Results ({filteredResults.length} of {results.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Phone</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Line Type</TableHead>
                    <TableHead>Carrier</TableHead>
                    <TableHead>SMS</TableHead>
                    <TableHead>Quality Score</TableHead>
                    <TableHead>Homeowner</TableHead>
                    <TableHead>Tags</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredResults.map((result) => (
                    <TableRow key={result.contactId}>
                      <TableCell className="font-mono text-sm">
                        {result.phone}
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{result.name || "N/A"}</div>
                          <div className="text-xs text-muted-foreground">
                            {result.email}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getLineTypeIcon(result.lineType)}
                          <span className="capitalize">{result.lineType}</span>
                        </div>
                      </TableCell>
                      <TableCell>{result.carrier || "—"}</TableCell>
                      <TableCell>
                        {result.smsReadiness === "sms_ready" ? (
                          <Badge className="bg-green-100 text-green-800">
                            <MessageSquare className="h-3 w-3 mr-1" />
                            Ready
                          </Badge>
                        ) : (
                          <Badge variant="outline">Not Supported</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className={`font-bold ${getQualityScoreColor(result.qualityScore)}`}>
                            {result.qualityScore}
                          </span>
                          {getQualityBadge(result.qualityScore)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="capitalize">{result.homeownerLikelihood}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {result.tags.slice(0, 2).map((tag, i) => (
                            <Badge key={i} variant="outline" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                          {result.tags.length > 2 && (
                            <Badge variant="outline" className="text-xs">
                              +{result.tags.length - 2}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {result.isDisconnected ? (
                          <Badge className="bg-red-100 text-red-800">
                            <XCircle className="h-3 w-3 mr-1" />
                            Disconnected
                          </Badge>
                        ) : result.isValid ? (
                          <Badge className="bg-green-100 text-green-800">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Valid
                          </Badge>
                        ) : (
                          <Badge variant="outline">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            Invalid
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {results.length === 0 && !loading && (
        <Card>
          <CardContent className="py-12 text-center">
            <Phone className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No audit results yet</h3>
            <p className="text-muted-foreground mb-4">
              Click "Run Audit" to scan your contacts and analyze phone numbers
            </p>
            <Button onClick={handleAudit} className="flex items-center gap-2 mx-auto">
              <Search className="h-4 w-4" />
              Run Audit
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Loading State */}
      {loading && (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-muted-foreground">Auditing phone numbers...</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}





















































