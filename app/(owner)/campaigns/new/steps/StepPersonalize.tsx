"use client";

export default function StepPersonalize({
  personalize,
  setPersonalize,
  next,
  back,
}: {
  personalize: any;
  setPersonalize: (personalize: any) => void;
  next: () => void;
  back: () => void;
}) {
  function update(k: string, v: string) {
    setPersonalize({ ...personalize, [k]: v });
  }

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Personalization Settings</h1>
        <p className="text-sm text-gray-600 mt-1">
          These details will be used to personalize your campaign emails.
        </p>
      </div>

      <div>
        <label className="text-sm font-medium block mb-1">Your Name</label>
        <input
          className="w-full border rounded-md px-3 py-2 text-sm"
          value={personalize.sender_name}
          onChange={(e) => update("sender_name", e.target.value)}
          placeholder="e.g. John Smith"
        />
      </div>

      <div>
        <label className="text-sm font-medium block mb-1">Company Name</label>
        <input
          className="w-full border rounded-md px-3 py-2 text-sm"
          value={personalize.company_name}
          onChange={(e) => update("company_name", e.target.value)}
          placeholder="e.g. Smith Roofing"
        />
      </div>

      <div>
        <label className="text-sm font-medium block mb-1">Booking Link</label>
        <input
          className="w-full border rounded-md px-3 py-2 text-sm"
          value={personalize.booking_link}
          onChange={(e) => update("booking_link", e.target.value)}
          placeholder="e.g. https://calendly.com/your-link"
        />
        <p className="text-xs text-gray-500 mt-1">
          Link where prospects can book an estimate call.
        </p>
      </div>

      <div className="flex justify-between pt-4">
        <button
          onClick={back}
          className="px-3 py-2 text-sm border rounded-md hover:bg-gray-50"
        >
          Back
        </button>
        <button
          onClick={next}
          disabled={
            !personalize.sender_name ||
            !personalize.company_name ||
            !personalize.booking_link
          }
          className="px-4 py-2 bg-blue-600 text-white rounded-md disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-700"
        >
          Continue
        </button>
      </div>
    </div>
  );
}














































