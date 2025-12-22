"use client";

// Block 22261 — SmartSend Roofing Proposal Intelligence v1
// Add Proposal Form Component
// Allows contractors to add and track proposals for leads

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

interface AddProposalFormProps {
  lead_id: string;
  workspace_id: string;
  onProposalAdded?: () => void;
}

export function AddProposalForm({ lead_id, workspace_id, onProposalAdded }: AddProposalFormProps) {
  const [amount, setAmount] = useState("");
  const [url, setUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    
    if (!amount || parseFloat(amount) <= 0) {
      setError("Please enter a valid proposal amount");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/proposals/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          lead_id,
          workspace_id,
          amount: parseFloat(amount),
          proposal_url: url || null,
          notes: notes || null,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to create proposal");
      }

      // Reset form
      setAmount("");
      setUrl("");
      setNotes("");
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);

      // Notify parent
      if (onProposalAdded) {
        onProposalAdded();
      }
    } catch (err) {
      console.error("Error creating proposal:", err);
      setError(err instanceof Error ? err.message : "Failed to create proposal");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="p-4 border rounded-lg">
      <h3 className="font-semibold mb-4 text-lg">Add Proposal</h3>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-md text-sm text-green-700">
          Proposal created successfully!
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="amount">Proposal Amount ($)</Label>
          <Input
            id="amount"
            type="number"
            placeholder="0.00"
            step="0.01"
            min="0"
            className="mt-1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </div>

        <div>
          <Label htmlFor="url">Proposal URL (Optional)</Label>
          <Input
            id="url"
            type="url"
            placeholder="https://..."
            className="mt-1"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </div>

        <div>
          <Label htmlFor="notes">Notes (Optional)</Label>
          <textarea
            id="notes"
            placeholder="Add any notes about this proposal..."
            className="mt-1 w-full min-h-[80px] px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <Button
          type="submit"
          className="w-full bg-black text-white hover:bg-gray-800"
          disabled={loading}
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Sending Proposal...
            </>
          ) : (
            "Send Proposal"
          )}
        </Button>
      </form>
    </Card>
  );
}

