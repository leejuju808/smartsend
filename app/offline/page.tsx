// Block 42000 — SmartSend Roofing Crew App v1
// Offline Page
// app/offline/page.tsx

"use client";

import { useEffect, useState } from "react";
import { WifiOff, RefreshCw } from "lucide-react";

export default function OfflinePage() {
  const [isOnline, setIsOnline] = useState(false);

  useEffect(() => {
    setIsOnline(navigator.onLine);

    const handleOnline = () => {
      setIsOnline(true);
      window.location.reload();
    };

    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <WifiOff className="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-gray-900 mb-2">You're Offline</h1>
        <p className="text-gray-600 mb-6">
          Your actions are being saved locally and will sync when you're back online.
        </p>
        {!isOnline && (
          <div className="flex items-center justify-center gap-2 text-gray-500">
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span>Waiting for connection...</span>
          </div>
        )}
      </div>
    </div>
  );
}































