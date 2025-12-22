export function LeadStatusBadge({ state, autoDetected }: { state?: 'none' | 'suspected' | 'confirmed', autoDetected?: boolean }) {
  if (!state || state === 'none') return null;
  
  const config = {
    confirmed: { label: 'Replied', className: 'bg-green-100 text-green-700' },
    suspected: { label: 'Maybe replied', className: 'bg-yellow-100 text-yellow-700' },
  };
  
  const { label, className } = config[state] || config.suspected;
  
  return (
    <span className={`px-2 py-1 text-xs rounded-full ${className} inline-flex items-center gap-1`}>
      {label}
      {autoDetected && (
        <span className="text-xs" title="Auto-detected by AI">⚡</span>
      )}
    </span>
  );
}

