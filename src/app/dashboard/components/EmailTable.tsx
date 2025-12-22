"use client";
import EmailStatusBadge from "./EmailStatusBadge";
import { useRealtimeEmailLogs, EmailLog } from "./useRealtimeEmailLogs";

export default function EmailTable({ initial }: { initial: EmailLog[] }) {
  const emails = useRealtimeEmailLogs(initial);

  return (
    <table className="w-full border border-gray-700 text-sm">
      <thead className="bg-gray-900 text-gray-200">
        <tr>
          <th className="p-2 text-left">Recipient</th>
          <th className="p-2 text-left">Subject</th>
          <th className="p-2 text-left">Status</th>
          <th className="p-2 text-left">Opens</th>
          <th className="p-2 text-left">Clicks</th>
          <th className="p-2 text-left">First Opened</th>
          <th className="p-2 text-left">Sent At</th>
        </tr>
      </thead>
      <tbody>
        {emails.map((email) => (
          <tr key={email.id} className="border-t border-gray-700">
            <td className="p-2">{email.to_email}</td>
            <td className="p-2">{email.subject}</td>
            <td className="p-2">
              <EmailStatusBadge status={email.status} opened={email.opened} clicked={email.clicked} />
            </td>
            <td className="p-2">
              {email.open_count !== undefined && email.open_count > 0 ? (
                <span className="text-green-500">{email.open_count}</span>
              ) : (
                <span className="text-gray-400">0</span>
              )}
            </td>
            <td className="p-2">
              {email.click_count !== undefined && email.click_count > 0 ? (
                <span className="text-blue-500">{email.click_count}</span>
              ) : (
                <span className="text-gray-400">0</span>
              )}
            </td>
            <td className="p-2">
              {email.first_opened_at ? (
                <span className="text-green-500">✓ {new Date(email.first_opened_at).toLocaleString()}</span>
              ) : (
                <span className="text-gray-400">—</span>
              )}
            </td>
            <td className="p-2">
              {email.sent_at ? new Date(email.sent_at).toLocaleString() : "-"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}