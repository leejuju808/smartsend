"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useRouter } from "next/navigation";

const steps = [
  { id: "import_leads", title: "Import your leads", action: "/dashboard/leads" },
  { id: "create_campaign", title: "Create your first campaign", action: "/dashboard/campaigns" },
  { id: "send_first", title: "Send your first email", action: "/dashboard/campaigns" },
];

export default function OnboardingTour({ progress }: { progress: Record<string, boolean> }) {
  const router = useRouter();
  const [visible, setVisible] = useState(true);

  const allDone = steps.every((s) => progress[s.id]);

  if (!visible || allDone) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background p-6 rounded-2xl w-96 space-y-4 border">
        <h2 className="text-xl font-semibold">Get Started with SmartSend ⚡</h2>
        {steps.map((s) => (
          <div key={s.id} className="flex justify-between items-center border-b py-2">
            <span className={progress[s.id] ? "text-green-600" : ""}>
              {progress[s.id] ? "✅" : "⬜️"} {s.title}
            </span>
            {!progress[s.id] && (
              <Button variant="secondary" size="sm" onClick={() => router.push(s.action)}>
                Go
              </Button>
            )}
          </div>
        ))}
        <div className="text-center">
          {allDone ? (
            <p className="text-green-600 font-semibold">🎉 SmartSend Activated!</p>
          ) : (
            <Button onClick={() => setVisible(false)}>Hide</Button>
          )}
        </div>
      </div>
    </div>
  );
}

