"use client";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

interface Sequence {
  id: string;
  name: string;
  status: string;
  created_at: string;
}

export default function EnrollLead() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [sequenceId, setSequenceId] = useState("");
  const [loading, setLoading] = useState(false);
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [loadingSequences, setLoadingSequences] = useState(true);

  // Fetch available sequences
  useEffect(() => {
    async function fetchSequences() {
      try {
        const res = await fetch("/api/sequences");
        const data = await res.json();
        if (data.ok) {
          setSequences(data.sequences || []);
        }
      } catch (error) {
        console.error("Error fetching sequences:", error);
      } finally {
        setLoadingSequences(false);
      }
    }
    fetchSequences();
  }, []);

  async function enroll() {
    if (!email || !sequenceId) {
      alert("Please fill in email and select a sequence");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, sequence_id: sequenceId }),
      });
      const data = await res.json();
      
      if (data.ok) {
        alert(`✅ Enrolled ${email} in sequence! Queued ${data.queued} emails.`);
        // Reset form
        setEmail("");
        setName("");
        setSequenceId("");
      } else {
        alert(`❌ Failed: ${data.error}`);
      }
    } catch (error) {
      console.error("Error enrolling:", error);
      alert("❌ Error enrolling lead");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border p-6 space-y-4 bg-white shadow-sm">
      <h3 className="text-lg font-semibold text-gray-900">📨 Enroll Lead in Sequence</h3>
      
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Lead Email *
          </label>
          <Input 
            placeholder="Enter lead email" 
            value={email} 
            onChange={e => setEmail(e.target.value)}
            type="email"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Lead Name
          </label>
          <Input 
            placeholder="Enter lead name (optional)" 
            value={name} 
            onChange={e => setName(e.target.value)}
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Sequence *
          </label>
          {loadingSequences ? (
            <div className="text-sm text-gray-500">Loading sequences...</div>
          ) : (
            <select
              value={sequenceId}
              onChange={e => setSequenceId(e.target.value)}
              className="w-full rounded-2xl border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select a sequence</option>
              {sequences.map(seq => (
                <option key={seq.id} value={seq.id}>
                  {seq.name} ({seq.status})
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
      
      <Button 
        className="bg-yellow-500 text-black hover:bg-yellow-600 w-full" 
        onClick={enroll} 
        disabled={loading || !email || !sequenceId}
      >
        {loading ? "Enrolling..." : "Enroll Lead"}
      </Button>
      
      {sequences.length === 0 && !loadingSequences && (
        <div className="text-sm text-gray-500 text-center">
          No sequences found. Create a sequence first to enroll leads.
        </div>
      )}
    </div>
  );
}