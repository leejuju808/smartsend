export default function EmptyState({ title, subtitle, cta }: { title: string; subtitle: string; cta?: React.ReactNode }) {
  return (
    <div className="border border-gray-800 rounded-2xl p-10 text-center bg-gray-950">
      <h3 className="text-xl font-semibold text-white">{title}</h3>
      <p className="text-gray-400 mt-2">{subtitle}</p>
      {cta && <div className="mt-6">{cta}</div>}
    </div>
  );
}