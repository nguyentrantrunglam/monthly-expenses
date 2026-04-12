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

/**
 * Session lưu `month` dạng YYYY-MM.
 * Khoản trả góp có `installmentEndDate` (YYYY-MM-DD): chỉ auto-thêm vào session đến hết tháng chứa ngày kết thúc.
 */
export function fixedItemAppliesToSessionMonth(
  fi: { isInstallment?: boolean; installmentEndDate?: string | null },
  sessionMonth: string | null | undefined
): boolean {
  if (!sessionMonth || !fi.isInstallment || !fi.installmentEndDate?.trim()) {
    return true;
  }
  const end = fi.installmentEndDate.trim();
  const endMonth = end.length >= 7 ? end.slice(0, 7) : end;
  if (!/^\d{4}-\d{2}$/.test(endMonth)) return true;
  return sessionMonth <= endMonth;
}
