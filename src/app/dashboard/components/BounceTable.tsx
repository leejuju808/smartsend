"use client";
import { useEffect, useState } from "react";

type Row = { created_at: string; recipient: string; kind: "hard"|"soft"; smtp_status?: string|null; diagnostic?: string|null; };

export default function BounceTable() {
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    fetch("/api/bounces?limit=50").then(r=>r.json()).then(j=>setRows(j.rows||[]));
  }, []);
  return (
    <div className="rounded-2xl border p-4">
      <h3 className="font-medium mb-2">Recent Bounces</h3>
      <div className="overflow-auto">
        <table className="min-w-full text-sm">
          <thead><tr><th className="px-3 py-2 text-left">When</th><th className="px-3 py-2 text-left">Recipient</th><th className="px-3 py-2">Kind</th><th className="px-3 py-2 text-left">SMTP</th><th className="px-3 py-2 text-left">Reason</th></tr></thead>
          <tbody>
            {rows.map((r,i)=>(
              <tr key={i} className="odd:bg-gray-50">
                <td className="px-3 py-2">{new Date(r.created_at).toLocaleString()}</td>
                <td className="px-3 py-2">{r.recipient}</td>
                <td className="px-3 py-2 text-center">
                  <span className={`px-2 py-1 rounded-full text-xs ${r.kind==='hard'?'bg-rose-100 text-rose-700':'bg-amber-100 text-amber-700'}`}>
                    {r.kind}
                  </span>
                </td>
                <td className="px-3 py-2">{r.smtp_status || "—"}</td>
                <td className="px-3 py-2">{r.diagnostic?.slice(0,120) || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
} 