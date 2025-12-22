"use client";

import { useState } from "react";
import StepSelectTemplate from "./steps/StepSelectTemplate";
import StepTargeting from "./steps/StepTargeting";
import StepPersonalize from "./steps/StepPersonalize";
import StepReviewLaunch from "./steps/StepReviewLaunch";

export default function CampaignLaunchWizard() {
  const [step, setStep] = useState(1);

  const [template, setTemplate] = useState<any>(null);
  const [targeting, setTargeting] = useState<any>({
    city: "",
    daily_limit: 40,
    send_days: ["mon", "tue", "wed", "thu", "fri"],
  });
  const [personalize, setPersonalize] = useState<any>({
    sender_name: "",
    company_name: "",
    booking_link: "",
  });

  function next() {
    setStep((s) => s + 1);
  }

  function back() {
    setStep((s) => s - 1);
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4 p-6">
      {step === 1 && (
        <StepSelectTemplate
          template={template}
          setTemplate={setTemplate}
          next={next}
        />
      )}

      {step === 2 && (
        <StepTargeting
          targeting={targeting}
          setTargeting={setTargeting}
          next={next}
          back={back}
        />
      )}

      {step === 3 && (
        <StepPersonalize
          personalize={personalize}
          setPersonalize={setPersonalize}
          next={next}
          back={back}
        />
      )}

      {step === 4 && (
        <StepReviewLaunch
          template={template}
          targeting={targeting}
          personalize={personalize}
          back={back}
        />
      )}
    </div>
  );
}














































