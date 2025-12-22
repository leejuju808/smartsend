"use client";

import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function CollectionsDashboard() {
  const { data, error } = useSWR("/api/dashboard/collections", fetcher);

  if (!data && !error) {
    return <div className="p-6">Loading collections...</div>;
  }

  if (error) {
    return (
      <div className="p-6 text-red-600">Error loading data: {error.message}</div>
    );
  }

  if (!data) {
    return <div className="p-6">No data available.</div>;
  }

  const { overdue, partial, unpaid_completed, buckets } = data;

  return (
    <div className="p-6 space-y-8">
      <div>
        <h1 className="text-xl font-semibold">
          Collections & Overdue Invoices
        </h1>
        <p className="text-xs text-gray-500 mt-1">
          Track unpaid balances, overdue invoices, and aging accounts
        </p>
      </div>

      {/* OVERDUE */}
      <section className="border-l-4 border-red-600 bg-white p-4 shadow rounded">
        <h2 className="font-semibold text-sm mb-2 text-red-700">
          Overdue Jobs ({overdue?.length || 0})
        </h2>
        {(!overdue || overdue.length === 0) && (
          <p className="text-xs text-gray-500">No overdue invoices.</p>
        )}
        <div className="space-y-2">
          {overdue?.map((j: any) => (
            <div
              key={j.id}
              className="border rounded p-2 text-xs bg-red-50"
            >
              <p className="font-semibold">
                {j.title || "Untitled Job"} — ${j.balance_due?.toFixed(2) || "0.00"}
              </p>
              <p className="text-gray-600">
                {j.lead?.first_name || ""} {j.lead?.last_name || ""}
                {j.lead?.city ? ` — ${j.lead.city}` : ""}
              </p>
              <p className="text-red-700">
                Overdue {j.days_overdue || 0} days
              </p>
              {(j.lead?.phone || j.lead?.email) && (
                <p className="text-gray-600">
                  {j.lead?.phone && `Phone: ${j.lead.phone}`}
                  {j.lead?.phone && j.lead?.email && " • "}
                  {j.lead?.email && `Email: ${j.lead.email}`}
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* PARTIAL */}
      <section className="border-l-4 border-yellow-500 bg-white p-4 shadow rounded">
        <h2 className="font-semibold text-sm mb-2 text-yellow-700">
          Partially Paid Jobs ({partial?.length || 0})
        </h2>
        {(!partial || partial.length === 0) && (
          <p className="text-xs text-gray-500">No partially paid jobs.</p>
        )}
        <div className="space-y-2">
          {partial?.map((j: any) => (
            <div
              key={j.id}
              className="border rounded p-2 text-xs bg-yellow-50"
            >
              <p className="font-semibold">
                {j.title || "Untitled Job"} — Balance: $
                {j.balance_due?.toFixed(2) || "0.00"}
              </p>
              <p className="text-gray-600">
                {j.lead?.first_name || ""} {j.lead?.last_name || ""}
                {j.lead?.city ? ` — ${j.lead.city}` : ""}
              </p>
              <p className="text-gray-500 text-[11px]">
                Paid: ${j.total_paid?.toFixed(2) || "0.00"} of $
                {j.job_value?.toFixed(2) || "0.00"}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* UNPAID COMPLETED */}
      <section className="border-l-4 border-orange-500 bg-white p-4 shadow rounded">
        <h2 className="font-semibold text-sm mb-2 text-orange-700">
          Completed but Unpaid ({unpaid_completed?.length || 0})
        </h2>
        {(!unpaid_completed || unpaid_completed.length === 0) && (
          <p className="text-xs text-gray-500">
            No completed but unpaid jobs.
          </p>
        )}
        <div className="space-y-2">
          {unpaid_completed?.map((j: any) => (
            <div
              key={j.id}
              className="border rounded p-2 text-xs bg-orange-50"
            >
              <p className="font-semibold">
                {j.title || "Untitled Job"} — $
                {j.balance_due?.toFixed(2) || "0.00"}
              </p>
              <p className="text-gray-600">
                {j.lead?.first_name || ""} {j.lead?.last_name || ""}
                {j.lead?.city ? ` — ${j.lead.city}` : ""}
              </p>
              {j.scheduled_end_date && (
                <p className="text-gray-500 text-[11px]">
                  Completed: {new Date(j.scheduled_end_date).toLocaleDateString()}
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* AGING BUCKETS */}
      <section className="bg-white p-4 shadow rounded">
        <h2 className="font-semibold text-sm mb-3">Aging Buckets</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          <div className="border rounded p-2 bg-gray-50">
            <p className="font-semibold mb-1">0–30 Days</p>
            {(!buckets?.bucket_0_30 || buckets.bucket_0_30.length === 0) && (
              <p className="text-gray-500 text-[11px]">None</p>
            )}
            {buckets?.bucket_0_30?.map((j: any) => (
              <div key={j.id} className="text-[11px] mb-1">
                • {j.title || "Untitled"} (${j.balance_due?.toFixed(2) || "0.00"})
              </div>
            ))}
          </div>
          <div className="border rounded p-2 bg-gray-50">
            <p className="font-semibold mb-1">30–60 Days</p>
            {(!buckets?.bucket_30_60 || buckets.bucket_30_60.length === 0) && (
              <p className="text-gray-500 text-[11px]">None</p>
            )}
            {buckets?.bucket_30_60?.map((j: any) => (
              <div key={j.id} className="text-[11px] mb-1">
                • {j.title || "Untitled"} (${j.balance_due?.toFixed(2) || "0.00"})
              </div>
            ))}
          </div>
          <div className="border rounded p-2 bg-gray-50">
            <p className="font-semibold mb-1">60–90 Days</p>
            {(!buckets?.bucket_60_90 || buckets.bucket_60_90.length === 0) && (
              <p className="text-gray-500 text-[11px]">None</p>
            )}
            {buckets?.bucket_60_90?.map((j: any) => (
              <div key={j.id} className="text-[11px] mb-1">
                • {j.title || "Untitled"} (${j.balance_due?.toFixed(2) || "0.00"})
              </div>
            ))}
          </div>
          <div className="border rounded p-2 bg-gray-50">
            <p className="font-semibold mb-1 text-red-700">90+ Days</p>
            {(!buckets?.bucket_90_plus || buckets.bucket_90_plus.length === 0) && (
              <p className="text-gray-500 text-[11px]">None</p>
            )}
            {buckets?.bucket_90_plus?.map((j: any) => (
              <div
                key={j.id}
                className="text-red-700 text-[11px] mb-1 font-semibold"
              >
                • {j.title || "Untitled"} (${j.balance_due?.toFixed(2) || "0.00"})
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}








































