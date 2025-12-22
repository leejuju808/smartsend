"use client";

import useSWR from "swr";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/Button";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Automation = {
  id: string;
  name: string;
  trigger: string;
  condition: { intent?: string };
  actions: Array<{ type: string; tag_id?: string; user_id?: string }>;
  enabled: boolean;
  created_at: string;
};

export default function AutomationsPage() {
  const router = useRouter();
  const { data, error, isLoading } = useSWR<{ automations: Automation[] }>(
    "/api/automations",
    fetcher
  );

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <div className="text-sm opacity-70">Loading automations...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <div className="text-red-600">Error loading automations</div>
      </div>
    );
  }

  const automations = data?.automations || [];

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Automations</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Automatically respond to reply intents and manage your pipeline
          </p>
        </div>
        <Button onClick={() => router.push("/automations/new")}>
          New Automation
        </Button>
      </div>

      {automations.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-sm opacity-70 mb-4">No automations yet</p>
            <Button onClick={() => router.push("/automations/new")}>
              Create Your First Automation
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {automations.map((automation) => (
            <Card key={automation.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <p className="font-bold">{automation.name}</p>
                      {automation.enabled ? (
                        <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                          Enabled
                        </span>
                      ) : (
                        <span className="text-xs bg-gray-100 text-gray-800 px-2 py-1 rounded">
                          Disabled
                        </span>
                      )}
                    </div>
                    <p className="text-sm opacity-70 mb-2">
                      Trigger: <span className="font-medium">{automation.trigger}</span>
                    </p>
                    {automation.condition?.intent && (
                      <p className="text-sm mb-2">
                        Condition: intent ={" "}
                        <span className="font-medium">{automation.condition.intent}</span>
                      </p>
                    )}
                    <div className="mt-3">
                      <p className="text-sm font-medium mb-1">Actions:</p>
                      <ul className="text-sm ml-4 list-disc space-y-1">
                        {automation.actions.map((action, i) => (
                          <li key={i}>
                            {action.type}
                            {action.tag_id && ` (tag_id: ${action.tag_id})`}
                            {action.user_id && ` (user_id: ${action.user_id})`}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}










