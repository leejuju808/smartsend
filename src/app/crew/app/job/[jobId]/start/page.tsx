"use client";

// Block 225000 — SmartSend Roofing Crew App v1
// Mobile-first Crew App — Daily Workflow Wizard

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";

interface ChecklistItem {
  id: string;
  label: string;
  is_required: boolean;
  completed: boolean;
}

interface Checklist {
  id: string;
  checklist_type: string;
  items: ChecklistItem[];
}

export default function DailyWorkflowPage() {
  const router = useRouter();
  const params = useParams();
  const jobId = params.jobId as string;

  const [step, setStep] = useState(1);
  const [dailyLogId, setDailyLogId] = useState<string | null>(null);
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [currentChecklist, setCurrentChecklist] = useState<Checklist | null>(null);
  const [workers, setWorkers] = useState<string[]>([]);
  const [newWorkerName, setNewWorkerName] = useState("");
  const [notes, setNotes] = useState("");
  const [weatherConditions, setWeatherConditions] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Load job details
    loadJobDetails();
  }, [jobId]);

  const loadJobDetails = async () => {
    // This would fetch job details from API
  };

  const handleStartDay = async () => {
    setLoading(true);
    try {
      const session = JSON.parse(localStorage.getItem("crewSession") || "{}");
      const crewId = session.crew.id;

      const response = await fetch("/api/crew/daily/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          crewId,
          notes,
          weatherConditions,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to start day");
      }

      setDailyLogId(data.dailyLog.id);
      setStep(2); // Move to checklist step
    } catch (error: any) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleChecklistComplete = async () => {
    if (!currentChecklist) return;

    const requiredItems = currentChecklist.items.filter((item) => item.is_required);
    const allRequiredCompleted = requiredItems.every((item) => item.completed);

    if (!allRequiredCompleted) {
      alert("Please complete all required checklist items");
      return;
    }

    // Move to next step
    if (currentChecklist.checklist_type === "start_of_day") {
      setStep(3); // Time clock
    } else if (currentChecklist.checklist_type === "material_verification") {
      setStep(4); // Photos
    }
  };

  const handleToggleChecklistItem = async (itemId: string) => {
    if (!currentChecklist) return;

    const updatedItems = currentChecklist.items.map((item) =>
      item.id === itemId ? { ...item, completed: !item.completed } : item
    );

    setCurrentChecklist({ ...currentChecklist, items: updatedItems });

    // Submit to API
    await fetch("/api/crew/checklist/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        checklistId: currentChecklist.id,
        itemIds: [itemId],
        completed: !currentChecklist.items.find((i) => i.id === itemId)?.completed,
      }),
    });
  };

  const handleAddWorker = () => {
    if (newWorkerName.trim()) {
      setWorkers([...workers, newWorkerName.trim()]);
      setNewWorkerName("");
    }
  };

  const handleClockIn = async (workerName: string) => {
    if (!dailyLogId) return;

    try {
      const response = await fetch("/api/crew/time/clock-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dailyLogId,
          jobId,
          workerName,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to clock in");
      }

      alert(`${workerName} clocked in successfully`);
    } catch (error: any) {
      alert(error.message);
    }
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Start Your Day</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Weather Conditions
              </label>
              <input
                type="text"
                value={weatherConditions}
                onChange={(e) => setWeatherConditions(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg"
                placeholder="Sunny, Cloudy, Rainy, etc."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg"
                rows={3}
                placeholder="Any notes for today..."
              />
            </div>
            <button
              onClick={handleStartDay}
              disabled={loading}
              className="w-full bg-orange-600 text-white py-4 rounded-lg font-semibold text-lg hover:bg-orange-700 disabled:opacity-50"
            >
              {loading ? "Starting..." : "Start Day"}
            </button>
          </div>
        );

      case 2:
        return (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              Required Start Checklist
            </h2>
            {currentChecklist ? (
              <>
                <div className="space-y-3">
                  {currentChecklist.items.map((item) => (
                    <label
                      key={item.id}
                      className={`flex items-start p-4 border-2 rounded-lg cursor-pointer ${
                        item.completed
                          ? "bg-green-50 border-green-500"
                          : item.is_required
                          ? "bg-orange-50 border-orange-300"
                          : "bg-gray-50 border-gray-200"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={item.completed}
                        onChange={() => handleToggleChecklistItem(item.id)}
                        className="mt-1 mr-3 h-5 w-5"
                      />
                      <div className="flex-1">
                        <span className="font-medium text-gray-900">{item.label}</span>
                        {item.is_required && (
                          <span className="ml-2 text-xs text-orange-600 font-semibold">
                            REQUIRED
                          </span>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
                <button
                  onClick={handleChecklistComplete}
                  className="w-full bg-orange-600 text-white py-4 rounded-lg font-semibold text-lg hover:bg-orange-700"
                >
                  Continue
                </button>
              </>
            ) : (
              <p className="text-gray-600">Loading checklist...</p>
            )}
          </div>
        );

      case 3:
        return (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Time Clock</h2>
            <div className="space-y-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newWorkerName}
                  onChange={(e) => setNewWorkerName(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && handleAddWorker()}
                  className="flex-1 px-4 py-3 border border-gray-300 rounded-lg"
                  placeholder="Worker name"
                />
                <button
                  onClick={handleAddWorker}
                  className="bg-gray-200 text-gray-700 px-4 py-3 rounded-lg font-semibold"
                >
                  Add
                </button>
              </div>
              <div className="space-y-2">
                {workers.map((worker, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg"
                  >
                    <span className="font-medium">{worker}</span>
                    <button
                      onClick={() => handleClockIn(worker)}
                      className="bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-semibold"
                    >
                      Clock In
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <button
              onClick={() => setStep(4)}
              className="w-full bg-orange-600 text-white py-4 rounded-lg font-semibold text-lg hover:bg-orange-700"
            >
              Continue to Photos
            </button>
          </div>
        );

      case 4:
        return (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Photo Capture</h2>
            <p className="text-gray-600 mb-4">
              Take photos throughout the day. Categories: Before, During, After, Issues
            </p>
            <Link
              href={`/crew/app/job/${jobId}/photos`}
              className="block w-full bg-orange-600 text-white py-4 rounded-lg font-semibold text-lg text-center hover:bg-orange-700"
            >
              Open Camera
            </Link>
            <button
              onClick={() => setStep(5)}
              className="w-full bg-gray-200 text-gray-700 py-4 rounded-lg font-semibold text-lg"
            >
              Continue
            </button>
          </div>
        );

      case 5:
        return (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Report Issues</h2>
            <Link
              href={`/crew/app/job/${jobId}/issues`}
              className="block w-full bg-orange-600 text-white py-4 rounded-lg font-semibold text-lg text-center hover:bg-orange-700 mb-4"
            >
              Report Issue
            </Link>
            <button
              onClick={() => setStep(6)}
              className="w-full bg-gray-200 text-gray-700 py-4 rounded-lg font-semibold text-lg"
            >
              Continue
            </button>
          </div>
        );

      case 6:
        return (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">End of Day</h2>
            <p className="text-gray-600">
              Complete end-of-day checklist and submit daily log
            </p>
            <Link
              href={`/crew/app/job/${jobId}/complete`}
              className="block w-full bg-orange-600 text-white py-4 rounded-lg font-semibold text-lg text-center hover:bg-orange-700"
            >
              Complete Day
            </Link>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-orange-600 text-white p-4">
        <button
          onClick={() => router.back()}
          className="text-white mb-2"
        >
          ← Back
        </button>
        <h1 className="text-xl font-bold">Daily Workflow</h1>
        <div className="mt-2 flex gap-1">
          {[1, 2, 3, 4, 5, 6].map((s) => (
            <div
              key={s}
              className={`flex-1 h-1 rounded ${
                s <= step ? "bg-white" : "bg-white/30"
              }`}
            />
          ))}
        </div>
      </div>

      <div className="p-4">{renderStep()}</div>
    </div>
  );
}

























