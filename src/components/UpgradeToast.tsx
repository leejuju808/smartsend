"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle, X } from "lucide-react";

export function UpgradeToast() {
  const searchParams = useSearchParams();
  const [showToast, setShowToast] = useState(false);

  useEffect(() => {
    if (searchParams.get("upgrade") === "success") {
      setShowToast(true);
      // Auto-hide after 8 seconds
      const timer = setTimeout(() => setShowToast(false), 8000);
      return () => clearTimeout(timer);
    }
  }, [searchParams]);

  if (!showToast) return null;

  return (
    <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-right-2 duration-300">
      <div className="bg-green-50 border border-green-200 rounded-lg p-4 shadow-lg max-w-sm">
        <div className="flex items-start space-x-3">
          <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-sm font-medium text-green-800">Welcome to Pro! 🎉</h3>
            <p className="text-sm text-green-700 mt-1">
              Your subscription is now active. You have access to all Pro features including campaigns, AI writing, and automations.
            </p>
          </div>
          <button
            onClick={() => setShowToast(false)}
            className="text-green-400 hover:text-green-600 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
} 