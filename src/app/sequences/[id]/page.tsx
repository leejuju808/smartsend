import UsageMeter from "@/src/components/UsageMeter";
import SequenceDetail from "./ui/SequenceDetail";
export default function Page({ params }: { params: { id: string } }) {
  const userId = "REPLACE_WITH_AUTHED_USER_ID"; // wire your auth
  return (
    <div className="p-6 grid gap-6">
      <UsageMeter userId={userId} compact />
      <SequenceDetail sequenceId={params.id} userId={userId} />
    </div>
  );
}

