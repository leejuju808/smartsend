import AcceptInviteClient from "./AcceptInviteClient";

export default function AcceptInvitePage({ 
  searchParams 
}: { 
  searchParams: { token?: string } 
}) {
  const token = searchParams.token ?? "";
  return <AcceptInviteClient token={token} />;
}
