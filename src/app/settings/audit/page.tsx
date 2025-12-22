"use client";
import { useEffect, useState } from "react";

type Log = {
  id: string;
  action: string;
  target_table: string | null;
  target_id: string | null;
  details: any;
  created_at: string;
};

export default function AuditPage() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/audit", { cache: "no-store" });
      const data = await res.json();
      setLogs(data.logs || []);
    } catch (error) {
      console.error("Failed to load audit logs:", error);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { 
    load(); 
  }, []);

  return (
    <div className="max-w-5xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-6">Audit Log</h1>
      
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-gray-500">Loading audit logs...</div>
        </div>
      ) : logs.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-gray-500">No audit entries yet.</div>
        </div>
      ) : (
        <div className="space-y-2">
          <ul className="space-y-2">
            {logs.map(l => (
              <li key={l.id} className="text-sm border-b border-gray-200 pb-2">
                {new Date(l.created_at).toLocaleString()} — <span className="font-medium">{l.action}</span> — {l.target_table || ''} {l.target_id || ''}
              </li>
            ))}
          </ul>
        </div>
      )}
      
      <div className="mt-6 text-center">
        <button 
          onClick={load}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Refresh
        </button>
      </div>
    </div>
  );
}