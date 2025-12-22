export function ReplyChip({ state }: { state?: 'none'|'suspected'|'confirmed' }) {
  if (!state || state === 'none') return null;
  const label = state === 'confirmed' ? 'Replied' : 'Maybe replied';
  return (
    <span className={`px-2 py-1 text-xs rounded-full ${state === 'confirmed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
      {label}
    </span>
  );
}
