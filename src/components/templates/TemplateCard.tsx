import Link from 'next/link';

interface TemplateCardProps {
  id: string;
  title: string;
  description?: string;
  tags: string[];
  updated_at: string;
  created_at?: string;
  is_paid?: boolean;
  price_cents?: number;
  cover_url?: string;
  installs_count?: number;
  avg_rating?: number;
  rating_count?: number;
}

// Helper function to format relative time
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (diffInSeconds < 60) return 'just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 86400)}d ago`;
  if (diffInSeconds < 31536000) return `${Math.floor(diffInSeconds / 2592000)}mo ago`;
  return `${Math.floor(diffInSeconds / 31536000)}y ago`;
}

export function TemplateCard({ 
  id, 
  title, 
  description, 
  tags, 
  updated_at, 
  is_paid, 
  price_cents, 
  cover_url, 
  installs_count, 
  avg_rating, 
  rating_count 
}: TemplateCardProps) {
  const displayTags = tags.slice(0, 3);
  const remainingTags = tags.length > 3 ? tags.length - 3 : 0;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-md transition-shadow">
      <div className="flex flex-col h-full">
        {/* Cover Image */}
        {cover_url ? (
          <div className="mb-4">
            <img 
              src={cover_url} 
              alt={title} 
              className="w-full h-32 object-cover rounded-lg"
            />
          </div>
        ) : (
          <div className="mb-4 h-32 bg-gray-100 rounded-lg flex items-center justify-center">
            <span className="text-gray-400 text-sm">No Cover</span>
          </div>
        )}

        <h3 className="text-lg font-semibold text-gray-900 mb-2 line-clamp-2">
          {title}
        </h3>
        
        {description && (
          <p className="text-sm text-gray-600 mb-3 line-clamp-2">
            {description}
          </p>
        )}
        
        <div className="flex flex-wrap gap-2 mb-4">
          {displayTags.map((tag, index) => (
            <span
              key={index}
              className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
            >
              {tag}
            </span>
          ))}
          {remainingTags > 0 && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
              +{remainingTags}
            </span>
          )}
        </div>
        
        {/* Stats and Price */}
        <div className="mt-auto space-y-3">
          {/* Rating and Installs */}
          <div className="flex items-center justify-between text-sm text-gray-600">
            <div className="flex items-center gap-1">
              <span>⭐ {Number(avg_rating || 0).toFixed(1)}</span>
              <span className="text-gray-400">({rating_count || 0})</span>
            </div>
            <span className="text-gray-500">⬇︎ {installs_count || 0} installs</span>
          </div>
          
          {/* Price */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-900">
              {is_paid ? `$${(price_cents || 0) / 100}` : 'Free'}
            </span>
            <span className="text-xs text-gray-500">
              Updated {formatRelativeTime(updated_at)}
            </span>
          </div>
          
          <Link
            href={`/templates/${id}`}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
          >
            View Template
          </Link>
        </div>
      </div>
    </div>
  );
} 