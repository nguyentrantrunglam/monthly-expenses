import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
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
