"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import Link from "next/link";
import { useParams } from "next/navigation";

export default function WorkspacePage() {
  const params = useParams();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const workspaceId = Array.isArray(params.id) ? params.id[0] : params.id;

  useEffect(() => {
    if (!workspaceId) return;

    async function load() {
      try {
        const response = await fetch(`/api/admin/billing/workspace/${workspaceId}`);
        const json = await response.json();
        setData(json);
      } catch (error) {
        console.error("Failed to load workspace data:", error);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [workspaceId]);

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
        <div>Failed to load workspace data</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin/billing" className="text-blue-500 underline hover:text-blue-700">
          ← Back to Billing Admin
        </Link>
        <h1 className="text-2xl font-bold">Workspace Billing: {workspaceId}</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Workspace Health</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="text-xs bg-gray-50 p-4 rounded overflow-auto">
            {JSON.stringify(data.workspace, null, 2)}
          </pre>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Billing Events ({data.events?.length || 0})</CardTitle>
        </CardHeader>
        <CardContent>
          {data.events && data.events.length > 0 ? (
            <div className="space-y-2">
              {data.events.map((event: any) => (
                <div key={event.id} className="border-b pb-2">
                  <div className="font-semibold">{event.type}</div>
                  <div className="text-sm text-gray-600">{event.detail}</div>
                  <div className="text-xs text-gray-400">
                    {new Date(event.created_at).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-gray-500">No billing events</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Credit Transactions ({data.creditTransactions?.length || 0})</CardTitle>
        </CardHeader>
        <CardContent>
          {data.creditTransactions && data.creditTransactions.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    <th className="p-2">Date</th>
                    <th className="p-2">Delta</th>
                    <th className="p-2">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {data.creditTransactions.map((tx: any) => (
                    <tr key={tx.id} className="border-b">
                      <td className="p-2 text-xs">
                        {new Date(tx.created_at).toLocaleString()}
                      </td>
                      <td className={`p-2 font-semibold ${tx.delta > 0 ? "text-green-600" : "text-red-600"}`}>
                        {tx.delta > 0 ? "+" : ""}{tx.delta}
                      </td>
                      <td className="p-2">{tx.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-gray-500">No credit transactions</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

