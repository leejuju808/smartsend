export function EmailThreadPanel({ emails, thread }: { emails: any[]; thread: any }) {
  if (!thread) {
    return (
      <div className="bg-white p-4 rounded-xl border">
        <p className="text-sm text-gray-500">No messages yet.</p>
      </div>
    );
  }

  return (
    <div className="bg-white p-4 rounded-xl border space-y-3">
      <h2 className="text-lg font-semibold">Conversation</h2>

      <div className="space-y-4 max-h-[400px] overflow-y-auto pr-3">
        {emails.length === 0 ? (
          <p className="text-sm text-gray-500">No emails in this thread.</p>
        ) : (
          emails.map((msg) => (
            <div
              key={msg.id}
              className={`p-3 rounded-lg ${
                msg.direction === "inbound"
                  ? "bg-blue-50 text-blue-900"
                  : "bg-gray-100 text-gray-800"
              }`}
            >
              <div className="text-xs opacity-70">
                {new Date(msg.created_at).toLocaleString()}
              </div>
              <div className="text-sm whitespace-pre-line">
                {msg.body || msg.body_text || msg.body_plain || msg.body_html || "(No content)"}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}














































