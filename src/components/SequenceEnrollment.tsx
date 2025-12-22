"use client";

import { useState, useEffect } from "react";

interface Enrollment {
  id: string;
  email: string;
  current_step: number;
  last_sent: string | null;
  created_at: string;
}

export default function SequenceEnrollment() {
  const [sequences, setSequences] = useState<any[]>([]);
  const [selectedSequence, setSelectedSequence] = useState<string>("");
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [newEmails, setNewEmails] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadSequences();
  }, []);

  useEffect(() => {
    if (selectedSequence) {
      loadEnrollments(selectedSequence);
    }
  }, [selectedSequence]);

  const loadSequences = async () => {
    try {
      const response = await fetch("/api/sequences");
      const data = await response.json();
      setSequences(data || []);
    } catch (error) {
      console.error("Failed to load sequences:", error);
    }
  };

  const loadEnrollments = async (sequenceId: string) => {
    try {
      const response = await fetch(`/api/sequences/${sequenceId}/enroll`);
      const data = await response.json();
      setEnrollments(data.enrollments || []);
    } catch (error) {
      console.error("Failed to load enrollments:", error);
    }
  };

  const enrollContacts = async () => {
    if (!selectedSequence || !newEmails.trim()) {
      alert("Please select a sequence and enter email addresses");
      return;
    }

    const emails = newEmails
      .split("\n")
      .map(email => email.trim())
      .filter(email => email && email.includes("@"));

    if (emails.length === 0) {
      alert("Please enter valid email addresses");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/sequences/${selectedSequence}/enroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails })
      });

      if (response.ok) {
        const result = await response.json();
        alert(`Successfully enrolled ${result.enrolled} contacts`);
        setNewEmails("");
        await loadEnrollments(selectedSequence);
      } else {
        const error = await response.json();
        alert(`Failed to enroll contacts: ${error.error}`);
      }
    } catch (error) {
      console.error("Failed to enroll contacts:", error);
      alert("Failed to enroll contacts");
    } finally {
      setLoading(false);
    }
  };

  const removeEnrollment = async (enrollmentId: string) => {
    if (!confirm("Are you sure you want to remove this contact from the sequence?")) {
      return;
    }

    try {
      // Note: You'll need to implement a DELETE endpoint for enrollments
      // For now, we'll just show a message
      alert("Remove functionality needs to be implemented in the API");
    } catch (error) {
      console.error("Failed to remove enrollment:", error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Manage Contact Enrollments</h3>
      </div>

      {/* Sequence Selection */}
      <div>
        <label className="block text-sm font-medium mb-2">Select Sequence</label>
        <select
          value={selectedSequence}
          onChange={(e) => setSelectedSequence(e.target.value)}
          className="w-full p-2 border rounded-lg"
        >
          <option value="">Choose a sequence...</option>
          {sequences.map((seq) => (
            <option key={seq.id} value={seq.id}>
              {seq.name}
            </option>
          ))}
        </select>
      </div>

      {/* Enroll New Contacts */}
      {selectedSequence && (
        <div className="border rounded-lg p-4 space-y-4">
          <h4 className="font-medium">Enroll New Contacts</h4>
          
          <div>
            <label className="block text-sm font-medium mb-1">
              Email Addresses (one per line)
            </label>
            <textarea
              value={newEmails}
              onChange={(e) => setNewEmails(e.target.value)}
              className="w-full p-2 border rounded-lg h-24"
              placeholder="contact1@example.com&#10;contact2@example.com&#10;contact3@example.com"
            />
          </div>

          <button
            onClick={enrollContacts}
            disabled={loading || !newEmails.trim()}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
          >
            {loading ? "Enrolling..." : "Enroll Contacts"}
          </button>
        </div>
      )}

      {/* Current Enrollments */}
      {selectedSequence && enrollments.length > 0 && (
        <div className="border rounded-lg p-4">
          <h4 className="font-medium mb-4">Current Enrollments ({enrollments.length})</h4>
          
          <div className="space-y-3">
            {enrollments.map((enrollment) => (
              <div key={enrollment.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <div className="font-medium">{enrollment.email}</div>
                  <div className="text-sm text-gray-600">
                    Step: {enrollment.current_step} | 
                    Last sent: {enrollment.last_sent ? new Date(enrollment.last_sent).toLocaleDateString() : "Never"}
                  </div>
                </div>
                
                <button
                  onClick={() => removeEnrollment(enrollment.id)}
                  className="px-3 py-1 text-red-600 hover:text-red-800 text-sm"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {selectedSequence && enrollments.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          No contacts enrolled yet. Add contacts above to get started.
        </div>
      )}

      {!selectedSequence && (
        <div className="text-center py-8 text-gray-500">
          Select a sequence to manage enrollments.
        </div>
      )}
    </div>
  );
} 