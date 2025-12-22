"use client";
import { useState, useEffect } from "react";

interface ReputationData {
  cap: number;
  warmup_level: number;
  used: number;
  allowed: number;
  bounces_30d: number;
  remaining: number;
}

export default function ReputationPage() {
  const [isEditing, setIsEditing] = useState(false);
  const [dailyCap, setDailyCap] = useState(200);
  const [warmupLevel, setWarmupLevel] = useState(1);
  const [isUpdating, setIsUpdating] = useState(false);
  const [data, setData] = useState<ReputationData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetch("/api/reputation");
      if (response.ok) {
        const result = await response.json();
        setData(result);
      } else {
        setError("Failed to load reputation data");
      }
    } catch (err) {
      setError("Failed to load reputation data");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (data) {
      setDailyCap(data.cap);
      setWarmupLevel(data.warmup_level);
    }
  }, [data]);

  const handleSave = async () => {
    setIsUpdating(true);
    try {
      const response = await fetch("/api/reputation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          daily_send_cap: dailyCap,
          warmup_level: warmupLevel
        })
      });

      if (response.ok) {
        setIsEditing(false);
        fetchData(); // Refresh data
      } else {
        const error = await response.json();
        alert(`Error: ${error.error}`);
      }
    } catch (err) {
      alert("Failed to update settings");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCancel = () => {
    if (data) {
      setDailyCap(data.cap);
      setWarmupLevel(data.warmup_level);
    }
    setIsEditing(false);
  };

  if (error) return <div className="text-red-500">{error}</div>;
  if (isLoading || !data) return <div>Loading...</div>;

  return (
    <main className="mx-auto max-w-4xl p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Domain Reputation & Warmup</h1>
        <button
          onClick={() => setIsEditing(!isEditing)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          {isEditing ? "Cancel" : "Edit Settings"}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Current Status */}
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <h2 className="text-xl font-semibold mb-4">Current Status</h2>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600">Daily Cap:</span>
              <span className="font-medium">{data.cap} emails</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Warmup Level:</span>
              <span className="font-medium">{data.warmup_level}x</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Used Today:</span>
              <span className="font-medium">{data.used} emails</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Remaining Today:</span>
              <span className="font-medium text-green-600">{data.remaining} emails</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Bounces (30d):</span>
              <span className="font-medium">{data.bounces_30d}</span>
            </div>
          </div>
        </div>

        {/* Warmup Curve */}
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <h2 className="text-xl font-semibold mb-4">Warmup Curve</h2>
          <div className="space-y-3">
            <div className="text-sm text-gray-600">
              Your sending capacity increases gradually as your domain reputation improves.
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Level 1:</span>
                <span>50 emails/day</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Level 5:</span>
                <span>250 emails/day</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Level 10:</span>
                <span>500 emails/day</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Level 20:</span>
                <span>1000 emails/day</span>
              </div>
            </div>
            <div className="text-xs text-gray-500 mt-3">
              Warmup level increases automatically each day until reaching your daily cap.
            </div>
          </div>
        </div>
      </div>

      {/* Settings Form */}
      {isEditing && (
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <h2 className="text-xl font-semibold mb-4">Update Settings</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Daily Send Cap
              </label>
              <input
                type="number"
                min="1"
                max="10000"
                value={dailyCap}
                onChange={(e) => setDailyCap(parseInt(e.target.value) || 200)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                Maximum emails you want to send per day
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Warmup Level
              </label>
              <input
                type="number"
                min="1"
                max="30"
                value={warmupLevel}
                onChange={(e) => setWarmupLevel(parseInt(e.target.value) || 1)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                Current warmup multiplier (1-30x)
              </p>
            </div>
          </div>
          <div className="flex gap-3 mt-6">
            <button
              onClick={handleSave}
              disabled={isUpdating}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {isUpdating ? "Saving..." : "Save Changes"}
            </button>
            <button
              onClick={handleCancel}
              className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Bounce Management */}
      <div className="bg-white p-6 rounded-lg shadow-sm border">
        <h2 className="text-xl font-semibold mb-4">Bounce Management</h2>
        <div className="space-y-3">
          <div className="text-sm text-gray-600">
            Hard bounces and complaints are automatically added to your suppression list to protect your sender reputation.
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="text-center p-3 bg-red-50 rounded-lg">
              <div className="font-medium text-red-700">Hard Bounces</div>
              <div className="text-red-600">Immediately suppressed</div>
            </div>
            <div className="text-center p-3 bg-yellow-50 rounded-lg">
              <div className="font-medium text-yellow-700">Soft Bounces</div>
              <div className="text-yellow-600">Tracked for monitoring</div>
            </div>
            <div className="text-center p-3 bg-orange-50 rounded-lg">
              <div className="font-medium text-orange-700">Complaints</div>
              <div className="text-orange-600">Immediately suppressed</div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
} 