interface ActivityItem {
  id: string;
  app: string;
  type: string;
  ts: string;
  meta?: any;
}

interface HQActivityProps {
  items: ActivityItem[];
}

export default function HQActivity({ items }: HQActivityProps) {
  const getAppColor = (app: string) => {
    switch (app.toLowerCase()) {
      case 'smartsend':
        return 'text-blue-600';
      case 'opsgrid':
        return 'text-green-600';
      case 'agentcloud':
        return 'text-purple-600';
      default:
        return 'text-gray-600';
    }
  };

  const formatType = (type: string) => {
    return type.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  return (
    <div className="border rounded-2xl p-6 bg-white">
      <h3 className="text-sm mb-4 opacity-80 font-semibold">Recent Activity</h3>
      {items.length > 0 ? (
        <div className="divide-y">
          {items.map((item) => (
            <div 
              key={item.id} 
              className="py-3 text-sm flex justify-between items-center hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center space-x-3">
                <span className={`font-semibold uppercase text-xs ${getAppColor(item.app)}`}>
                  {item.app}
                </span>
                <span className="opacity-80">{formatType(item.type)}</span>
                {item.meta && Object.keys(item.meta).length > 0 && (
                  <span className="text-xs opacity-60">
                    ({Object.keys(item.meta).length} details)
                  </span>
                )}
              </div>
              <span className="opacity-60 text-xs">
                {new Date(item.ts).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-gray-400">
          <p>No recent activity</p>
          <p className="text-xs mt-2">Events will appear here as apps start tracking</p>
        </div>
      )}
    </div>
  );
}

