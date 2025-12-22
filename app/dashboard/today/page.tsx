"use client";

import { useEffect, useState } from "react";

export default function TodayPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchToday() {
      try {
        setLoading(true);
        const response = await fetch("/api/dashboard/today");
        if (!response.ok) {
          throw new Error("Failed to load today's ops");
        }
        const json = await response.json();
        setData(json);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load data");
      } finally {
        setLoading(false);
      }
    }

    fetchToday();
  }, []);

  if (loading) return <div className="p-6">Loading today&apos;s ops…</div>;
  if (error) return <div className="p-6 text-red-600">Error loading data: {error}</div>;
  if (!data) return <div className="p-6">No data available.</div>;

  const { meta, jobsToday, unpaidDeposits, hotProposals } = data;

  return (
    <div className="p-6 space-y-6">
      {/* HEADER + SUMMARY */}
      <header className="flex justify-between items-start gap-4">
        <div>
          <h1 className="text-xl font-semibold">Today</h1>
          <p className="text-xs text-gray-500">
            Daily command center for your roofing jobs.
          </p>
          {meta?.totalJobsToday > 0 && Number(meta?.autoHomeownersContactedToday || 0) > 0 && (
            <p className="mt-2 text-xs text-gray-700">
              {meta.autoHomeownersContactedToday} homeowner
              {meta.autoHomeownersContactedToday === 1 ? "" : "s"} contacted while you were working today.
            </p>
          )}
          <div className="mt-2 text-xs text-gray-500 space-y-1">
            <div>Roofing companies use SmartSend to stay booked.</div>
            <div>Average homeowners responding: 8–12%</div>
            <div>Most jobs close within 7–14 days</div>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <SummaryCard label="Jobs Today" value={meta.totalJobsToday} />
          <SummaryCard label="Value on Roofs" value={`$${meta.totalValueToday || 0}`} />
          <SummaryCard label="Unpaid Deposits" value={meta.unpaidDepositsCount} />
          <SummaryCard label="HOT Homeowners" value={meta.hotProposalsCount} />
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT: TODAY'S JOBS */}
        <section className="lg:col-span-2 space-y-3">
          <SectionTitle title="Today's Jobs" subtitle="Who's on which roof and where." />
          <div className="space-y-2">
            {jobsToday.length === 0 && (
              <p className="text-xs text-gray-500">
                No jobs scheduled today. Use this time to follow up on HOT proposals.
              </p>
            )}
            {jobsToday.map((job: any) => (
              <JobRow key={job.id} job={job} />
            ))}
          </div>
        </section>

        {/* RIGHT: DEPOSITS + HOT CALLS */}
        <section className="space-y-4">
          <div>
            <SectionTitle
              title="Unpaid Deposits"
              subtitle="Jobs starting today / tomorrow with missing deposit."
            />
            <div className="border rounded-lg bg-white p-3 space-y-2 max-h-[260px] overflow-y-auto">
              {unpaidDeposits.length === 0 && (
                <p className="text-xs text-gray-500">
                  No unpaid deposits for today/tomorrow.
                </p>
              )}
              {unpaidDeposits.map((job: any) => {
                const required = Number(job.deposit_required || 0);
                const paid = Number(job.deposit_paid || 0);
                const due = required - paid;

                return (
                  <div key={job.id} className="border rounded p-2 text-xs">
                    <p className="font-semibold truncate">
                      {job.title || "Roof Job"}
                    </p>
                    <p className="text-gray-600">
                      {job.leads?.first_name} {job.leads?.last_name} •{" "}
                      {job.leads?.city}
                    </p>
                    <p className="text-gray-500">
                      Start: {job.scheduled_start_date || "TBD"}
                    </p>
                    <p className="mt-1">
                      Deposit due:{" "}
                      <span className="font-semibold">${due}</span>
                    </p>
                    {job.leads?.phone && (
                      <p className="text-[10px] text-gray-500 mt-1">
                        Phone: {job.leads.phone}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <SectionTitle
              title="HOT Homeowners to Call"
              subtitle="People who looked serious and need a quick touch."
            />
            <div className="border rounded-lg bg-white p-3 space-y-2 max-h-[260px] overflow-y-auto">
              {hotProposals.length === 0 && (
                <p className="text-xs text-gray-500">
                  No HOT proposals waiting. Keep sending outreach.
                </p>
              )}
              {hotProposals.map((p: any) => (
                <HotProposalRow key={p.id} proposal={p} />
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white border rounded-lg px-3 py-2 shadow-sm">
      <p className="text-[11px] text-gray-500">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-1">
      <h2 className="text-sm font-semibold">{title}</h2>
      {subtitle && <p className="text-[11px] text-gray-500">{subtitle}</p>}
    </div>
  );
}

function JobRow({ job }: any) {
  const crew = job.job_crew_assignments?.[0]?.crew;
  const riskLabel =
    job.weather_risk_label ||
    (job.weather_risk_score >= 0.75
      ? "high"
      : job.weather_risk_score >= 0.4
      ? "medium"
      : "low");

  const riskColor =
    riskLabel === "high"
      ? "bg-red-100 text-red-700"
      : riskLabel === "medium"
      ? "bg-amber-100 text-amber-700"
      : "bg-emerald-100 text-emerald-700";

  return (
    <div className="bg-white border rounded-lg px-3 py-2 shadow-sm text-xs flex justify-between gap-3">
      <div className="space-y-1">
        <p className="font-semibold text-sm truncate">
          {job.title || "Roof Job"}
        </p>
        {job.leads && (
          <p className="text-gray-600 truncate">
            {job.leads.first_name} {job.leads.last_name} • {job.leads.city},{" "}
            {job.leads.state}
          </p>
        )}
        {job.leads?.address && (
          <p className="text-[11px] text-gray-500 truncate">{job.leads.address}</p>
        )}
        <p className="text-gray-600">
          Value: <span className="font-semibold">${job.job_value}</span>
        </p>
        {crew && (
          <p className="text-gray-600">
            Crew: <span className="font-semibold">{crew.name}</span>
          </p>
        )}
      </div>

      <div className="flex flex-col items-end justify-between">
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
          {job.status}
        </span>
        <span
          className={`mt-1 text-[10px] px-2 py-0.5 rounded-full ${riskColor}`}
        >
          Weather: {riskLabel}
        </span>
        {job.leads?.phone && (
          <p className="mt-1 text-[10px] text-gray-500">
            {job.leads.phone}
          </p>
        )}
      </div>
    </div>
  );
}

function HotProposalRow({ proposal }: any) {
  const heat = proposal.view_heat_score || 0;
  const heatLabel =
    heat >= 0.75 ? "Hot" : heat >= 0.4 ? "Warm" : "Cold";

  return (
    <div className="border rounded p-2 text-xs bg-white">
      <p className="font-semibold truncate">
        ${proposal.amount} proposal
      </p>
      {proposal.leads && (
        <p className="text-gray-600 truncate">
          {proposal.leads.first_name} {proposal.leads.last_name} •{" "}
          {proposal.leads.city}, {proposal.leads.state}
        </p>
      )}
      <p className="text-gray-500 mt-1">
        Intent: <span className="font-semibold">HOT</span> • View heat:{" "}
        {heatLabel} ({Math.round(heat * 100)}%)
      </p>
      {proposal.leads?.phone && (
        <p className="text-[10px] text-gray-500 mt-1">
          Phone: {proposal.leads.phone}
        </p>
      )}
      {proposal.leads?.email && (
        <p className="text-[10px] text-gray-500">
          Email: {proposal.leads.email}
        </p>
      )}
    </div>
  );
}
