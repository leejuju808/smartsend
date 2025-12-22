import { Card, CardContent } from '@/components/ui/Card';

interface Event {
  id: string;
  event_type: string;
  source: string;
  event_data: any;
  created_at: string;
}

interface LiveInsightsFeedProps {
  events: Event[];
}

export default function LiveInsightsFeed({ events }: LiveInsightsFeedProps) {
  const getEventIcon = (type: string) => {
    switch (type) {
      case 'prediction_made':
        return '🔮';
      case 'recommendation_created':
        return '💡';
      case 'action_applied':
        return '⚡';
      case 'feedback_recorded':
        return '📊';
      case 'anomaly_detected':
        return '⚠️';
      default:
        return '📌';
    }
  };
  
  const getEventColor = (type: string) => {
    switch (type) {
      case 'prediction_made':
        return 'text-blue-600';
      case 'recommendation_created':
        return 'text-purple-600';
      case 'action_applied':
        return 'text-green-600';
      case 'feedback_recorded':
        return 'text-yellow-600';
      case 'anomaly_detected':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };
  
  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };
  
  return (
    <Card>
      <CardContent className="p-6">
        <div className="mb-4">
          <h3 className="text-lg font-semibold">Live Insights Feed</h3>
          <p className="text-sm text-gray-600">Real-time AI-generated insights</p>
        </div>
        
        <div className="space-y-3 max-h-[400px] overflow-y-auto">
          {events.length === 0 ? (
            <div className="text-center py-8 text-gray-500 text-sm">
              No insights yet. Activity will appear here as the system learns.
            </div>
          ) : (
            events.map((event) => (
              <div
                key={event.id}
                className="flex items-start gap-3 p-3 border rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div className={`text-xl ${getEventColor(event.event_type)}`}>
                  {getEventIcon(event.event_type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium capitalize">
                      {event.event_type.replace(/_/g, ' ')}
                    </span>
                    <span className="text-xs text-gray-500">
                      {formatTimeAgo(event.created_at)}
                    </span>
                  </div>
                  {event.event_data && typeof event.event_data === 'object' && (
                    <div className="text-xs text-gray-600">
                      {event.source} • {JSON.stringify(event.event_data)}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

