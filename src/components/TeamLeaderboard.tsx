"use client";
import { useEffect, useState } from "react";

type Row = { user_id:string; email:string; replies:number; meetings:number };

export default function TeamLeaderboard() {
  const [rows,setRows] = useState<Row[]>([]);

  useEffect(()=>{
    fetch("/api/analytics/leaderboard").then(r=>r.json()).then(j=>{
      if(j.leaderboard) setRows(j.leaderboard);
    }).catch(()=>{});
  },[]);

  if (!rows.length) return null;

  return (
    <div className="border rounded-xl p-4 space-y-4">
      <h3 className="font-semibold text-lg">Team Leaderboard</h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left border-b">
            <th className="py-1">User</th>
            <th className="py-1">Replies</th>
            <th className="py-1">Meetings</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r=>(
            <tr key={r.user_id} className="border-b last:border-0">
              <td className="py-1">{r.email}</td>
              <td className="py-1">{r.replies}</td>
              <td className="py-1">{r.meetings}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-gray-500">
        More teammates = more booked meetings. Add seats to get your whole team on SmartSendAI.
      </p>
      <button
        onClick={()=>window.location.href="/dashboard/team"}
        className="px-4 py-2 rounded bg-black text-white text-sm"
      >
        Add Seats →
      </button>
    </div>
  );
} 