"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";

export default function MoneyTodayPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchMoneyToday() {
      try {
        setLoading(true);
        const response = await fetch("/api/dashboard/money-today");
        if (!response.ok) {
          throw new Error("Failed to load money view");
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

    fetchMoneyToday();
  }, []);

  if (loading) return <div className="p-6">Loading money view…</div>;
  if (error) return <div className="p-6 text-red-600">Error loading data: {error}</div>;
  if (!data) return <div className="p-6">No data available.</div>;

  const { meta, depositsDue, finalsDueSoon, finalsOverdue, paymentsWeek } = data;

  return (
    <div className="p-6 space-y-6">
      {/* HEADER */}
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Money Today</h1>
          <p className="text-xs text-gray-500">
            A focused radar for deposits, balances, and cash this week.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <SummaryCard
            label="Cash Collected This Week"
            value={`$${meta.totalCollectedWeek || 0}`}
          />
          <SummaryCard
            label="Deposits Due (Today + Tomorrow)"
            value={`$${meta.totalDepositsDue || 0}`}
            sub={`${meta.depositsCount} jobs`}
          />
          <SummaryCard
            label="Finals Due"
            value={`$${meta.totalFinalsDue || 0}`}
            sub={`${meta.finalsDueCount} jobs`}
          />
          <SummaryCard
            label="Overdue Money"
            value={`$${meta.totalFinalsOverdue || 0}`}
            sub={`${meta.finalsOverdueCount} jobs`}
          />
        </div>
      </header>

      {/* MAIN GRID */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* LEFT: DEPOSITS */}
        <section className="xl:col-span-1 space-y-2">
          <SectionTitle
            title="Deposits to Collect"
            subtitle="Jobs starting today/tomorrow that need money before work."
          />
          <div className="border rounded-lg bg-white p-3 space-y-2 max-h-[360px] overflow-y-auto">
            {depositsDue.length === 0 && (
              <p className="text-xs text-gray-500">
                No outstanding deposits for today or tomorrow.
              </p>
            )}
            {depositsDue.map((job: any) => {
              const required = Number(job.deposit_required || 0);
              const paid = Number(job.deposit_paid || 0);
              const due = required - paid;

              return (
                <div key={job.job_id} className="border rounded p-2 text-xs">
                  <p className="font-semibold truncate">
                    {job.title || "Roof Job"}
                  </p>
                  <p className="text-gray-600">
                    {job.first_name} {job.last_name} • {job.city}
                  </p>
                  <p className="text-gray-500">
                    Start: {job.scheduled_start_date || "TBD"}
                  </p>
                  <p className="mt-1">
                    Deposit required: ${required} • Paid: ${paid}
                  </p>
                  <p className="text-amber-700 text-[11px] font-semibold">
                    Due now: ${due}
                  </p>
                  {job.phone && (
                    <p className="text-[10px] text-gray-500 mt-1">
                      Phone: {job.phone}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* MIDDLE: FINALS DUE */}
        <section className="space-y-3">
          <SectionTitle
            title="Final Balances to Close"
            subtitle="Jobs done or nearly done where the rest of the money is due."
          />
          <div className="border rounded-lg bg-white p-3 space-y-3 max-h-[360px] overflow-y-auto">
            {finalsDueSoon.length === 0 && (
              <p className="text-xs text-gray-500">
                No final balances due today. Check overdue list next.
              </p>
            )}
            {finalsDueSoon.map((job: any) => (
              <FinalBalanceRow key={job.job_id} job={job} overdue={false} />
            ))}
          </div>

          <SectionTitle
            title="Overdue Money"
            subtitle="Jobs completed where money is still outstanding."
          />
          <div className="border rounded-lg bg-white p-3 space-y-3 max-h-[260px] overflow-y-auto">
            {finalsOverdue.length === 0 && (
              <p className="text-xs text-gray-500">
                No overdue final balances. Keep it that way.
              </p>
            )}
            {finalsOverdue.map((job: any) => (
              <FinalBalanceRow key={job.job_id} job={job} overdue={true} />
            ))}
          </div>
        </section>

        {/* RIGHT: PAYMENTS THIS WEEK */}
        <section className="space-y-2">
          <SectionTitle
            title="Payments This Week"
            subtitle="Track what actually hit your account."
          />
          <div className="border rounded-lg bg-white p-3 space-y-2 max-h-[460px] overflow-y-auto">
            {paymentsWeek.length === 0 && (
              <p className="text-xs text-gray-500">
                No payments logged for this week yet.
              </p>
            )}
            {paymentsWeek.map((p: any) => (
              <PaymentRow key={p.id} payment={p} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="bg-white border rounded-lg px-3 py-2 shadow-sm">
      <p className="text-[11px] text-gray-500">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
      {sub && <p className="text-[10px] text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-1">
      <h2 className="text-sm font-semibold">{title}</h2>
      {subtitle && (
        <p className="text-[11px] text-gray-500">
          {subtitle}
        </p>
      )}
    </div>
  );
}

function FinalBalanceRow({ job, overdue }: { job: any; overdue: boolean }) {
  const labelClass = overdue
    ? "text-red-700"
    : "text-emerald-700";

  return (
    <div className="border rounded p-2 text-xs">
      <p className="font-semibold truncate">
        {job.title || "Roof Job"}
      </p>
      <p className="text-gray-600">
        {job.first_name} {job.last_name} • {job.city}
      </p>
      <p className="text-gray-500">
        End date: {job.scheduled_end_date || "TBD"} • Status: {job.status}
      </p>
      <p className={`${labelClass} mt-1`}>
        Final due: ${job.balance_remaining}
      </p>
      {job.phone && (
        <p className="text-[10px] text-gray-500 mt-1">
          Phone: {job.phone}
        </p>
      )}
    </div>
  );
}

function PaymentRow({ payment }: any) {
  const dateStr = payment.received_at
    ? format(new Date(payment.received_at), "MMM d, h:mma")
    : "";

  return (
    <div className="border rounded p-2 text-xs">
      <p className="font-semibold">
        ${payment.amount} • {payment.payment_type?.toUpperCase() || "PAYMENT"}
      </p>
      {payment.title && (
        <p className="text-gray-600 truncate">
          {payment.title}
        </p>
      )}
      {payment.first_name && (
        <p className="text-gray-500 text-[11px]">
          {payment.first_name} {payment.last_name} • {payment.city}
        </p>
      )}
      <p className="text-gray-500 text-[11px] mt-1">
        {dateStr} • {payment.method || "unspecified"}
      </p>
    </div>
  );
}








































