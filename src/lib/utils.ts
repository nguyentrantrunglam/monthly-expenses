import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Format number with comma as thousand separator for input display */
export function formatCurrencyInput(value: string | number): string {
  const digits = String(value).replace(/\D/g, "");
  if (digits === "") return "";
  const num = Number(digits);
  return num.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

/** Parse currency input string to number (removes commas, spaces) */
export function parseCurrencyInput(value: string): number {
  return Number(String(value).replace(/[\s,]/g, "")) || 0;
}

/** Format display label for fixed item: "Trả góp : Tên" when isInstallment */
export function getFixedItemDisplayTitle(item: {
  title: string;
  categoryName?: string | null;
  isInstallment?: boolean;
}): string {
  if (item.isInstallment) {
    return `Trả góp : ${item.title}`;
  }
  return item.title;
}
