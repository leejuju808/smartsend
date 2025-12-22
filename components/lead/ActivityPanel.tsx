export function ActivityPanel({ history }: { history: any[] }) {
  return (
    <div className="bg-white p-4 rounded-xl border space-y-3">
      <h2 className="text-lg font-semibold">Timeline</h2>

      {history.length === 0 && (
        <p className="text-sm text-gray-500">No recent activity.</p>
      )}

      <div className="space-y-2">
        {history.map((item) => (
          <div key={item.id} className="text-sm border-l-2 border-gray-200 pl-3 py-1">
            <div className="font-medium text-gray-700">
              {new Date(item.created_at).toLocaleString()}
            </div>
            <div className="text-gray-700 whitespace-pre-line mt-1">
              {item.message}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}














































