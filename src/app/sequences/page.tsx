import SequencesTable from "./ui/SequencesTable";
import NewSequenceButton from "./ui/NewSequenceButton";

export default async function SequencesPage() {
  const userId = "REPLACE_WITH_AUTHED_USER_ID"; // wire your auth/session
  return (
    <div className="p-6 grid gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Sequences</h1>
        <NewSequenceButton userId={userId} />
      </div>
      <SequencesTable userId={userId} />
    </div>
  );
}

