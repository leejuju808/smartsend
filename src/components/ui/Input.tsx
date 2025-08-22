interface InputProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

export function Input({ label, value, onChange, placeholder }: InputProps) {
  return (
    <div>
      <div className="text-xs text-gray-600">{label}</div>
      <input 
        className="mt-1 w-full rounded-xl border p-2" 
        value={value} 
        onChange={e => onChange(e.target.value)} 
        placeholder={placeholder}
      />
    </div>
  );
} 