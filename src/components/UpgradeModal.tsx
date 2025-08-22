"use client";
import { useState } from "react";

export default function UpgradeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-6 w-[420px] grid gap-3">
        <h3 className="text-lg font-semibold">Unlock Pro features</h3>
        <ul className="text-sm list-disc ml-5 text-gray-700">
          <li>500 sends/day</li>
          <li>Unlimited sequences & steps</li>
          <li>Priority sending & support</li>
        </ul>
        <div className="flex items-center justify-end gap-2 mt-2">
          <button onClick={onClose} className="px-3 py-1.5 rounded-xl bg-gray-100">Not now</button>
          <a href="/dashboard/billing/upgrade" className="px-3 py-1.5 rounded-xl bg-black text-white">Upgrade to Pro</a>
        </div>
      </div>
    </div>
  );
}

