export type OnboardingStepId =
  | "welcome"
  | "connect_email"
  | "first_upload"
  | "map_columns"
  | "import_preview"
  | "finished";

export type OnboardingStepMeta = {
  id: OnboardingStepId;
  label: string;
  description?: string;
};

export const ONBOARDING_STEPS: OnboardingStepMeta[] = [
  {
    id: "welcome",
    label: "Workspace",
    description: "Name your workspace",
  },
  {
    id: "connect_email",
    label: "Connect email",
    description: "Add at least one inbox",
  },
  {
    id: "first_upload",
    label: "Upload leads",
    description: "Upload your first CSV",
  },
  {
    id: "map_columns",
    label: "Map columns",
    description: "Tell SmartSend what each column is",
  },
  {
    id: "import_preview",
    label: "Review & import",
    description: "Confirm and import leads",
  },
  {
    id: "finished",
    label: "You're live",
    description: "Start sending your first campaign",
  },
];

export const STEP_INDEX: Record<OnboardingStepId, number> = ONBOARDING_STEPS.reduce(
  (acc, step, index) => {
    acc[step.id] = index;
    return acc;
  },
  {} as Record<OnboardingStepId, number>
);










