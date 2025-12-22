import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(
  value: number | null | undefined,
  currency: string = "USD"
): string {
  if (value == null || value === undefined) return "$0";
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: currency,
    maximumFractionDigits: 0,
  });
}