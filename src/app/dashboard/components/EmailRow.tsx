// /app/dashboard/components/EmailRow.tsx
"use client";
import EmailStatusBadge, { ReplyIntent } from "./EmailStatusBadge";

interface EmailRowProps {
  email: {
    id: string;
    recipient: string;
    subject: string;
    status: string;
    reply_intent?: string | null;
    reply_snippet?: string | null;
    created_at: string;
  };
}

export default function EmailRow({ email }: EmailRowProps) {
  return (
    <tr className="border-t border-gray-700 group hover:bg-gray-50">
      <td className="p-2">{email.recipient}</td>
      <td className="p-2">{email.subject}</td>
      <td className="p-2 flex items-center">
        <EmailStatusBadge status={email.status as any} />
        {email.status === "replied" && <ReplyIntent intent={email.reply_intent} />}
      </td>
      <td className="p-2 text-xs text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity">
        {email.reply_snippet || '-'}
      </td>
      <td className="p-2 text-xs text-gray-500">
        {new Date(email.created_at).toLocaleString()}
      </td>
    </tr>
  );
}