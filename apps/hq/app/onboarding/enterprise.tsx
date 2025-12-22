"use client";

import { Button } from "@aurev/ui";

export default function EnterpriseOnboarding() {
  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold mb-4">Set up your team workspace</h2>
      <p className="text-gray-400 mb-6">Connect outreach, operations, and agents in one flow.</p>
      <div className="space-x-2">
        <Button onClick={()=>window.location.href="/outreach"}>Connect SmartSend</Button>
        <Button onClick={()=>window.location.href="/operations"} variant="secondary">Connect OpsGrid</Button>
        <Button onClick={()=>window.location.href="/agents"} variant="secondary">Add Agents</Button>
      </div>
    </div>
  );
}

