"use client";
import { useState, useEffect } from "react";
import { Plus, X, Shield, AlertCircle } from "lucide-react";

type Suppression = {
  id: string;
  email: string;
  reason?: string;
  created_at: string;
};

export default function SuppressionManager() {
  const [suppressions, setSuppressions] = useState<Suppression[]>([]);
  const [newEmail, setNewEmail] = useState("");
  const [newReason, setNewReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadSuppressions();
  }, []);

  async function loadSuppressions() {
    try {
      const response = await fetch("/api/contacts/suppression");
      if (response.ok) {
        const data = await response.json();
        setSuppressions(data.rows || []);
      }
    } catch (err) {
      console.error("Failed to load suppressions:", err);
    }
  }

  async function addSuppression() {
    if (!newEmail.trim()) {
      setError("Email is required");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/suppression/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: newEmail.trim(),
          reason: newReason.trim() || null
        })
      });

      if (response.ok) {
        setSuccess("Email added to suppression list");
        setNewEmail("");
        setNewReason("");
        loadSuppressions();
        setTimeout(() => setSuccess(null), 3000);
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to add suppression");
      }
    } catch (err: any) {
      setError(err.message || "Failed to add suppression");
    } finally {
      setLoading(false);
    }
  }

  async function removeSuppression(email: string) {
    try {
      const response = await fetch("/api/suppression/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });

      if (response.ok) {
        setSuccess("Email removed from suppression list");
        loadSuppressions();
        setTimeout(() => setSuccess(null), 3000);
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to remove suppression");
      }
    } catch (err: any) {
      setError(err.message || "Failed to remove suppression");
    }
  }

  return (
    <div className="rounded-2xl border p-6 space-y-6 bg-white">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-orange-100 rounded-lg">
          <Shield className="h-5 w-5 text-orange-600" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">Suppression List</h3>
          <p className="text-sm text-gray-600">
            Manage emails that should not receive any communications
          </p>
        </div>
      </div>

      {/* Add New Suppression */}
      <div className="rounded-lg border border-gray-200 p-4 bg-gray-50">
        <h4 className="font-medium text-gray-900 mb-3">Add Email to Suppression List</h4>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email Address *
            </label>
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="example@domain.com"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Reason (optional)
            </label>
            <input
              type="text"
              value={newReason}
              onChange={(e) => setNewReason(e.target.value)}
              placeholder="e.g., unsubscribed, bounced, requested removal"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
          </div>
          <button
            onClick={addSuppression}
            disabled={loading || !newEmail.trim()}
            className="rounded-lg bg-orange-600 px-4 py-2 text-white font-medium hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Adding..." : "Add to Suppression List"}
          </button>
        </div>
      </div>

      {/* Error/Success Messages */}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-red-500" />
            <p className="text-red-800">{error}</p>
          </div>
        </div>
      )}

      {success && (
        <div className="rounded-lg bg-green-50 border border-green-200 p-4">
          <div className="flex items-center gap-2">
            <div className="h-5 w-5 rounded-full bg-green-500 flex items-center justify-center">
              <span className="text-white text-xs">✓</span>
            </div>
            <p className="text-green-800">{success}</p>
          </div>
        </div>
      )}

      {/* Suppression List */}
      <div>
        <h4 className="font-medium text-gray-900 mb-3">
          Current Suppressions ({suppressions.length})
        </h4>
        
        {suppressions.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Shield className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p>No suppressions yet</p>
            <p className="text-sm">Add emails above to prevent them from receiving communications</p>
          </div>
        ) : (
          <div className="space-y-2">
            {suppressions.map((suppression) => (
              <div
                key={suppression.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border"
              >
                <div className="flex-1">
                  <div className="font-medium text-gray-900">{suppression.email}</div>
                  {suppression.reason && (
                    <div className="text-sm text-gray-600 mt-1">
                      Reason: {suppression.reason}
                    </div>
                  )}
                  <div className="text-xs text-gray-500 mt-1">
                    Added: {new Date(suppression.created_at).toLocaleDateString()}
                  </div>
                </div>
                <button
                  onClick={() => removeSuppression(suppression.email)}
                  className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  title="Remove from suppression list"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Info Box */}
      <div className="rounded-lg bg-blue-50 border border-blue-200 p-4">
        <div className="flex items-start gap-2">
          <div className="p-1 bg-blue-100 rounded">
            <AlertCircle className="h-4 w-4 text-blue-600" />
          </div>
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-1">How Suppressions Work</p>
            <ul className="space-y-1 text-blue-700">
              <li>• Suppressed emails are automatically skipped during contact imports</li>
              <li>• They won't receive any campaigns or sequences</li>
              <li>• You can remove emails from suppression at any time</li>
              <li>• Common reasons: unsubscribed, bounced, requested removal</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

