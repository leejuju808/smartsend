"use client";

import { useState, useEffect } from "react";

interface SequenceStep {
  id: string;
  step_number: number;
  subject: string;
  body: string;
  delay_days: number;
  condition: string;
}

export default function SequenceBuilder() {
  const [sequences, setSequences] = useState<any[]>([]);
  const [selectedSequence, setSelectedSequence] = useState<string>("");
  const [steps, setSteps] = useState<SequenceStep[]>([]);
  const [newStep, setNewStep] = useState({
    subject: "",
    body: "",
    delay_days: 1,
    condition: "always"
  });

  useEffect(() => {
    loadSequences();
  }, []);

  useEffect(() => {
    if (selectedSequence) {
      loadSteps(selectedSequence);
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

  const loadSteps = async (sequenceId: string) => {
    try {
      const response = await fetch(`/api/sequences/${sequenceId}/steps`);
      const data = await response.json();
      setSteps(data || []);
    } catch (error) {
      console.error("Failed to load steps:", error);
    }
  };

  const createSequence = async () => {
    const name = prompt("Enter sequence name:");
    if (!name) return;

    try {
      const response = await fetch("/api/sequences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name })
      });

      if (response.ok) {
        await loadSequences();
      }
    } catch (error) {
      console.error("Failed to create sequence:", error);
    }
  };

  const addStep = async () => {
    if (!selectedSequence || !newStep.subject || !newStep.body) {
      alert("Please select a sequence and fill in subject and body");
      return;
    }

    try {
      const response = await fetch(`/api/sequences/${selectedSequence}/steps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: newStep.subject,
          body_text: newStep.body,
          delay_days: newStep.delay_days,
          condition: newStep.condition
        })
      });

      if (response.ok) {
        setNewStep({ subject: "", body: "", delay_days: 1, condition: "always" });
        await loadSteps(selectedSequence);
      }
    } catch (error) {
      console.error("Failed to add step:", error);
    }
  };

  const runSequence = async () => {
    if (!selectedSequence) {
      alert("Please select a sequence first");
      return;
    }

    try {
      const response = await fetch("/api/sequences/run", {
        method: "POST"
      });

      if (response.ok) {
        const result = await response.json();
        alert(`Sequence runner: ${result.sent} emails sent, ${result.errors} errors`);
      }
    } catch (error) {
      console.error("Failed to run sequence:", error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Build Email Sequences</h3>
        <button
          onClick={createSequence}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Create New Sequence
        </button>
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

      {/* Add New Step */}
      {selectedSequence && (
        <div className="border rounded-lg p-4 space-y-4">
          <h4 className="font-medium">Add New Step</h4>
          
          <div>
            <label className="block text-sm font-medium mb-1">Subject</label>
            <input
              type="text"
              value={newStep.subject}
              onChange={(e) => setNewStep({ ...newStep, subject: e.target.value })}
              className="w-full p-2 border rounded-lg"
              placeholder="Email subject line"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Body</label>
            <textarea
              value={newStep.body}
              onChange={(e) => setNewStep({ ...newStep, body: e.target.value })}
              className="w-full p-2 border rounded-lg h-24"
              placeholder="Email body content"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Delay (days)</label>
              <input
                type="number"
                min="0"
                value={newStep.delay_days}
                onChange={(e) => setNewStep({ ...newStep, delay_days: parseInt(e.target.value) })}
                className="w-full p-2 border rounded-lg"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Condition</label>
              <select
                value={newStep.condition}
                onChange={(e) => setNewStep({ ...newStep, condition: e.target.value })}
                className="w-full p-2 border rounded-lg"
              >
                <option value="always">Always send</option>
                <option value="opened">Only if opened</option>
                <option value="clicked">Only if clicked</option>
                <option value="no_reply">Only if no reply</option>
              </select>
            </div>
          </div>

          <button
            onClick={addStep}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            Add Step
          </button>
        </div>
      )}

      {/* Current Steps */}
      {selectedSequence && steps.length > 0 && (
        <div className="border rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-medium">Sequence Steps</h4>
            <button
              onClick={runSequence}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
            >
              Run Sequence Now
            </button>
          </div>

          <div className="space-y-3">
            {steps.map((step) => (
              <div key={step.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <div className="font-medium">Step {step.step_number}: {step.subject}</div>
                  <div className="text-sm text-gray-600">
                    Delay: {step.delay_days} days | Condition: {step.condition}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {selectedSequence && steps.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          No steps yet. Add your first step above to get started.
        </div>
      )}
    </div>
  );
} 