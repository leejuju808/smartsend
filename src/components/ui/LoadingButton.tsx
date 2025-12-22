"use client";

import Spinner from "./Spinner";

type Variant = "solid" | "ghost" | "outline";
type Size = "sm" | "md" | "lg";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
  spinnerSize?: number;
  spinnerClassName?: string;
  variant?: Variant;
  size?: Size;
};

function baseByVariant(variant: Variant) {
  switch (variant) {
    case "ghost":
      return "bg-transparent border border-gray-700 text-gray-200 hover:bg-gray-800/60";
    case "outline":
      return "bg-transparent border border-yellow-400 text-yellow-400 hover:bg-yellow-400 hover:text-black";
    default: // solid
      return "bg-yellow-400 text-black hover:bg-yellow-300";
  }
}

function padBySize(size: Size) {
  switch (size) {
    case "sm": return "px-3 py-1.5 text-sm rounded-xl";
    case "lg": return "px-5 py-3 text-base rounded-2xl";
    default:   return "px-4 py-2 text-sm rounded-2xl";
  }
}

export default function LoadingButton({
  loading,
  disabled,
  children,
  className = "",
  spinnerSize = 16,
  spinnerClassName = "",
  variant = "solid",
  size = "md",
  ...rest
}: Props) {
  const isDisabled = disabled || loading;

  return (
    <button
      {...rest}
      disabled={isDisabled}
      className={[
        "inline-flex items-center justify-center gap-2 font-medium transition",
        padBySize(size),
        baseByVariant(variant),
        isDisabled ? "opacity-70 cursor-not-allowed" : "",
        className,
      ].join(" ")}
    >
      {loading && <Spinner size={spinnerSize} className={spinnerClassName} />}
      <span>{children}</span>
    </button>
  );
}
