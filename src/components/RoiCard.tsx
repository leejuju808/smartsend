"use client";
import { useEffect, useState } from "react";

type Summary = { replies:number; meetings:number; hoursSaved:number };

export default function RoiCard() {
  const [s,setS] = useState<Summary|null>(null);

  useEffect(()=>{
    fetch("/api/analytics/summary").then(r=>r.json()).then(setS).catch(()=>{});
  },[]);

  if (!s) return null;

  return (
    <div className="border rounded-xl p-4 space-y-4">
      <h3 className="font-semibold text-lg">Your SmartSendAI ROI</h3>
      <div className="grid grid-cols-3 gap-4 text-center">
        <div>
          <div className="text-2xl font-bold">{s.replies}</div>
          <div className="text-xs text-gray-500">AI replies sent</div>
        </div>
        <div>
          <div className="text-2xl font-bold">{s.meetings}</div>
          <div className="text-xs text-gray-500">Meetings booked</div>
        </div>
        <div>
          <div className="text-2xl font-bold">{s.hoursSaved}</div>
          <div className="text-xs text-gray-500">Hours saved</div>
        </div>
      </div>
      <p className="text-sm text-gray-600">
        That's {s.hoursSaved}h you didn't spend writing emails. Teams using Pro average 2× more meetings.
      </p>
      <button
        onClick={()=>window.location.href="/dashboard/billing"}
        className="px-4 py-2 rounded bg-black text-white text-sm"
      >
        Upgrade to Pro →
      </button>
    </div>
  );
} 