import { Button } from "@/components/ui/Button";

export function EmptyState({ 
  title = "No data", 
  subtitle = "Try adjusting your filters.",
  cta,
  onClick,
  icon: Icon
}: { 
  title?: string; 
  subtitle?: string;
  cta?: string;
  onClick?: () => void;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex h-48 flex-col items-center justify-center rounded-2xl border border-gray-800 bg-gray-950 text-center p-8">
      {Icon && <Icon className="h-12 w-12 text-gray-600 mb-4" />}
      <div className="text-base font-medium text-white">{title}</div>
      <div className="mt-2 text-sm text-gray-400">{subtitle}</div>
      {cta && onClick && (
        <Button 
          onClick={onClick}
          className="mt-4 px-4 py-2 rounded-xl border border-gray-700 bg-gray-900 hover:bg-gray-800 text-white"
        >
          {cta}
        </Button>
      )}
    </div>
  );
}


