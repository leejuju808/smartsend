"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { format } from "date-fns";

export default function CrewDaySheetPage() {
  const params = useParams();
  const jobId = params?.jobId as string;
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId) return;

    async function fetchCrewSheet() {
      try {
        setLoading(true);
        const response = await fetch(`/api/crew-sheet/${jobId}`);
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to load crew sheet");
        }
        const json = await response.json();
        setData(json);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load crew sheet");
      } finally {
        setLoading(false);
      }
    }

    fetchCrewSheet();
  }, [jobId]);

  if (loading) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="text-center py-12">Loading crew sheet…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="text-red-600 bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="font-semibold">Error</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="text-center py-12 text-gray-500">No crew sheet data available.</div>
      </div>
    );
  }

  const { job, materials, deliveries } = data;
  const crew = job.job_crew_assignments?.[0]?.crew;
  const lead = job.address || job.leads; // Support both formats for compatibility

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6 bg-white">
      {/* Print styles */}
      <style jsx global>{`
        @media print {
          body {
            background: white;
          }
          .no-print {
            display: none;
          }
        }
      `}</style>

      <header className="flex justify-between items-start border-b pb-4">
        <div>
          <h1 className="text-xl font-semibold">Crew Day Sheet</h1>
          <p className="text-xs text-gray-500">
            For: {lead?.first_name} {lead?.last_name}
          </p>
        </div>
        <span className="text-xs px-2 py-1 bg-gray-900 text-white rounded">
          {format(new Date(), "MMM d, yyyy")}
        </span>
      </header>

      {/* ADDRESS */}
      <section className="border rounded p-4 space-y-2">
        <h2 className="font-semibold text-sm">Address</h2>
        <p className="text-sm">
          {lead?.address}, {lead?.city}, {lead?.state} {lead?.zip}
        </p>
        <a
          href={`https://maps.google.com/?q=${encodeURIComponent(
            `${lead?.address || ""} ${lead?.city || ""} ${lead?.state || ""}`.trim()
          )}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 underline text-xs"
        >
          Open in Google Maps
        </a>
        {lead?.phone && (
          <p className="text-xs text-gray-600">Homeowner Phone: {lead.phone}</p>
        )}
      </section>

      {/* CREW */}
      <section className="border rounded p-4 space-y-2">
        <h2 className="font-semibold text-sm">Assigned Crew</h2>
        {crew ? (
          <p className="text-sm">{crew.name}</p>
        ) : (
          <p className="text-sm text-gray-400">No crew assigned.</p>
        )}
      </section>

      {/* SCOPE */}
      <section className="border rounded p-4 space-y-2">
        <h2 className="font-semibold text-sm">Scope of Work</h2>
        <p className="text-sm whitespace-pre-wrap">
          {job.scope_of_work || "Not provided"}
        </p>

        {job.shingle_color && (
          <p className="text-sm mt-2">
            <span className="font-semibold">Shingle Color:</span> {job.shingle_color}
          </p>
        )}
      </section>

      {/* MATERIALS */}
      <section className="border rounded p-4 space-y-2">
        <h2 className="font-semibold text-sm">Materials</h2>
        <p className="text-xs text-gray-500">
          Status: {job.material_status || "unknown"} • Supplier:{" "}
          {job.material_supplier_name || "n/a"}
        </p>

        {materials ? (
          <div className="space-y-2">
            <p className="text-xs">
              Expected Delivery: {materials.expected_delivery_date || "Not set"}
            </p>
            <p className="text-xs">
              Actual Delivery: {materials.actual_delivery_date || "—"}
            </p>

            {materials.items && materials.items.length > 0 && (
              <table className="w-full text-xs mt-2 border">
                <thead>
                  <tr className="bg-gray-100 border-b">
                    <th className="p-1 text-left">Item</th>
                    <th className="p-1 text-right">Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {materials.items.map((it: any, idx: number) => (
                    <tr key={idx} className="border-b">
                      <td className="p-1">{it.description}</td>
                      <td className="p-1 text-right">
                        {it.quantity} {it.unit || ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {deliveries && deliveries.length > 0 && (
              <div className="text-xs mt-2">
                <p className="font-semibold mb-1">Deliveries:</p>
                {deliveries.map((d: any) => (
                  <p key={d.id}>
                    {d.delivery_date} — {d.status}
                  </p>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-gray-500">No material order.</p>
        )}
      </section>

      {/* DUMPSTER */}
      {job.dumpster_required && (
        <section className="border rounded p-4 space-y-1">
          <h2 className="font-semibold text-sm">Dumpster</h2>
          <p className="text-sm">
            Dumpster Required: <strong>YES</strong>
          </p>
          {job.dumpster_notes && (
            <p className="text-xs text-gray-600 whitespace-pre-wrap">{job.dumpster_notes}</p>
          )}
        </section>
      )}

      {/* SAFETY */}
      {job.safety_notes && (
        <section className="border rounded p-4">
          <h2 className="font-semibold text-sm mb-1">Safety Notes</h2>
          <p className="text-xs text-gray-700 whitespace-pre-wrap">{job.safety_notes}</p>
        </section>
      )}

      {/* HOMEOWNER NOTES */}
      {job.homeowner_notes && (
        <section className="border rounded p-4">
          <h2 className="font-semibold text-sm mb-1">Homeowner Notes</h2>
          <p className="text-xs text-gray-700 whitespace-pre-wrap">{job.homeowner_notes}</p>
        </section>
      )}

      {/* PHOTO CHECKLIST */}
      <section className="border rounded p-4">
        <h2 className="font-semibold text-sm mb-2">Photo Checklist</h2>
        <ul className="text-xs space-y-1">
          <li>⬜ Before photos (front / back / left / right)</li>
          <li>⬜ Tear-off photos</li>
          <li>⬜ Decking photos (if needed)</li>
          <li>⬜ Underlayment photos</li>
          <li>⬜ Shingle install photos</li>
          <li>⬜ Ridge cap photos</li>
          <li>⬜ Final after photos</li>
        </ul>
      </section>

      {/* WEATHER */}
      <section className="border rounded p-4 space-y-1">
        <h2 className="font-semibold text-sm">Weather Risk</h2>
        <p className="text-xs text-gray-600">
          {job.weather_risk_label || "Unknown"} • Score:{" "}
          {job.weather_risk_score
            ? `${(Number(job.weather_risk_score) * 100).toFixed(0)}%`
            : "N/A"}
        </p>
      </section>

      {/* PRINT BUTTON */}
      <button
        className="no-print bg-black text-white px-4 py-2 rounded text-sm w-full hover:bg-gray-800 transition-colors"
        onClick={() => window.print()}
      >
        Print / Save PDF
      </button>
    </div>
  );
}

