import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function MailboxesPage() {
  const googleAuthUrl = `/api/mailboxes/google/start`;
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">Mailboxes</h1>
      <p className="text-sm text-muted-foreground">
        Connect a Gmail account to send from SmartSend.
      </p>
      <Button asChild>
        <Link href={googleAuthUrl}>Connect Gmail</Link>
      </Button>
    </div>
  );
}

