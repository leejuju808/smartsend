import DuplicatesSettingsClient from "./DuplicatesSettingsClient";

export default function DuplicatesSettingsPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Duplicates</h1>
        <p className="text-sm text-muted-foreground">
          Configure merge thresholds and automate high-confidence duplicate clean-up.
        </p>
      </div>
      <DuplicatesSettingsClient />
    </div>
  );
}

