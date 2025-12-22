export interface ScheduleEmailInput {
  campaignId?: string;
  to: string;
  subject: string;
  html: string;
  scheduledAt: string | Date;
  workspaceId?: string;
}

export interface ScheduleEmailResponse {
  ok: boolean;
  jobId?: string;
  message?: string;
  error?: string;
}

export async function scheduleEmail(input: ScheduleEmailInput): Promise<ScheduleEmailResponse> {
  try {
    const res = await fetch("/api/schedule-email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...input,
        scheduledAt:
          typeof input.scheduledAt === "string"
            ? input.scheduledAt
            : input.scheduledAt.toISOString(),
      }),
    });

    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.error || `HTTP ${res.status}`);
    }

    return await res.json();
  } catch (error) {
    console.error("Error scheduling email:", error);
    throw error;
  }
}

// Hook for React components
export function useScheduleEmail() {
  const schedule = async (input: ScheduleEmailInput) => {
    return await scheduleEmail(input);
  };

  return { schedule };
}