"use client";

// Block 27340 — SmartSend Roofing Collections & Overdue Chase Brain v1
// Collections & Overdue Payments Page
// Shows who owes money, how late they are, and who to contact first

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

type CollectionsPriorityRow = {
  payment_request_id: string;
  job_id: string;
  job_name: string;
  customer_name: string;
  customer_email: string;
  request_type: string;
  amount: number;
  due_date: string;
  days_overdue: number;
  severity: "high" | "medium" | "low";
  recommended_channel: "call" | "email+call" | "email";
};

export default function CollectionsPage() {
  const [rows, setRows] = useState<CollectionsPriorityRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/collections/priority");
      const data = await res.json();
      setRows(data.items || []);
    } catch (error) {
      console.error("Error loading collections:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case "high":
        return (
          <Badge variant="destructive" className="font-semibold">
            HIGH
          </Badge>
        );
      case "medium":
        return (
          <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 font-semibold">
            MEDIUM
          </Badge>
        );
      case "low":
        return (
          <Badge variant="outline" className="text-gray-600">
            LOW
          </Badge>
        );
      default:
        return <Badge variant="outline">{severity.toUpperCase()}</Badge>;
    }
  };

  const getRecommendedAction = (channel: string) => {
    switch (channel) {
      case "call":
        return <span className="text-red-600 font-medium">Call today</span>;
      case "email+call":
        return <span className="text-yellow-600">Email and follow with call</span>;
      case "email":
        return <span className="text-gray-600">Send reminder email</span>;
      default:
        return channel;
    }
  };

  const totalOverdue = rows.reduce((sum, r) => sum + Number(r.amount || 0), 0);
  const highSeverityCount = rows.filter((r) => r.severity === "high").length;
  const highSeverityAmount = rows
    .filter((r) => r.severity === "high")
    .reduce((sum, r) => sum + Number(r.amount || 0), 0);

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-sm text-gray-500">Loading collections...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Collections & Overdue Payments</h1>
        <p className="text-sm text-gray-500 mt-1">
          SmartSend shows who owes you money, how late they are, and who to contact first.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              Total Overdue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {formatCurrency(totalOverdue)}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {rows.length} payment request{rows.length !== 1 ? "s" : ""} overdue
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              High Priority
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{highSeverityCount}</div>
            <div className="text-xs text-gray-500 mt-1">
              {formatCurrency(highSeverityAmount)} needs immediate attention
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              Average Days Overdue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {rows.length > 0
                ? Math.round(
                    rows.reduce((sum, r) => sum + r.days_overdue, 0) / rows.length
                  )
                : 0}
            </div>
            <div className="text-xs text-gray-500 mt-1">days</div>
          </CardContent>
        </Card>
      </div>

      {/* Collections Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Overdue Payment Requests</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No overdue payments. Great job staying on top of collections!
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-500 border-b">
                    <th align="left" className="pb-3">Customer</th>
                    <th align="left" className="pb-3">Job</th>
                    <th align="right" className="pb-3">Amount</th>
                    <th align="left" className="pb-3">Type</th>
                    <th align="left" className="pb-3">Due</th>
                    <th align="right" className="pb-3">Days Overdue</th>
                    <th align="left" className="pb-3">Severity</th>
                    <th align="left" className="pb-3">Recommended Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.payment_request_id}
                      className="border-b last:border-0 hover:bg-gray-50"
                    >
                      <td className="py-3">
                        <div className="font-medium">{r.customer_name || "—"}</div>
                        {r.customer_email && (
                          <div className="text-xs text-gray-500">{r.customer_email}</div>
                        )}
                      </td>
                      <td className="py-3">
                        <div>{r.job_name || "—"}</div>
                        {r.job_id && (
                          <Link
                            href={`/jobs/${r.job_id}`}
                            className="text-xs text-blue-600 hover:underline"
                          >
                            View Job
                          </Link>
                        )}
                      </td>
                      <td align="right" className="py-3 font-medium">
                        {formatCurrency(Number(r.amount || 0))}
                      </td>
                      <td className="py-3">
                        <Badge variant="outline">
                          {r.request_type.toUpperCase()}
                        </Badge>
                      </td>
                      <td className="py-3">
                        {r.due_date
                          ? new Date(r.due_date).toLocaleDateString()
                          : "—"}
                      </td>
                      <td align="right" className="py-3">
                        <span
                          className={
                            r.days_overdue >= 30
                              ? "text-red-600 font-semibold"
                              : r.days_overdue >= 14
                              ? "text-yellow-600 font-semibold"
                              : "text-gray-600"
                          }
                        >
                          {r.days_overdue}
                        </span>
                      </td>
                      <td className="py-3">{getSeverityBadge(r.severity)}</td>
                      <td className="py-3 text-xs text-gray-700">
                        {getRecommendedAction(r.recommended_channel)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}



































