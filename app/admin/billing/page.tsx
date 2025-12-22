"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import Link from "next/link";

export default function BillingAdminPage() {
  const [data, setData] = useState<any>(null);
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const overview = await fetch("/api/admin/billing/overview").then((r) => r.json());
        const ws = await fetch("/api/admin/billing/workspaces").then((r) => r.json());
        setData(overview);
        setWorkspaces(ws.workspaces || []);
      } catch (error) {
        console.error("Failed to load admin billing data:", error);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="p-6">
        <div>Loading...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6">
        <div>Failed to load data</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-3xl font-bold">Billing Admin</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Total MRR</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-bold">${data.mrr}</CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Plan Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              <div>Starter: {data.plans.starter}</div>
              <div>Pro: {data.plans.pro}</div>
              <div>Scale: {data.plans.scale}</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Total Credits Purchased</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{data.creditsPurchased}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Workspaces</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="p-2">Workspace</th>
                  <th className="p-2">Plan</th>
                  <th className="p-2">Sends Today</th>
                  <th className="p-2">Credits</th>
                  <th className="p-2">Status</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {workspaces.map((w) => (
                  <tr key={w.workspace_id} className="border-b hover:bg-gray-50">
                    <td className="p-2 font-mono text-xs">{w.workspace_id}</td>
                    <td className="p-2 capitalize">{w.plan || "N/A"}</td>
                    <td className="p-2">
                      {w.sends_today ?? 0}/{w.daily_send_cap ?? 0}
                    </td>
                    <td className="p-2">{w.credits ?? 0}</td>
                    <td className="p-2">
                      {w.send_cap_hit ? (
                        <span className="text-red-600">Send Cap Hit</span>
                      ) : w.credits_empty ? (
                        <span className="text-orange-600">No Credits</span>
                      ) : (
                        <span className="text-green-600">OK</span>
                      )}
                    </td>
                    <td className="p-2">
                      <Link
                        href={`/admin/billing/workspace/${w.workspace_id}`}
                        className="text-blue-500 underline hover:text-blue-700"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}








