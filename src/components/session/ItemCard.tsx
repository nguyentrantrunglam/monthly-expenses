"use client";

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Input } from "@/components/ui/input";
import type { MemberSessionItem } from "@/hooks/useSession";

function fmt(n: number) {
  return new Intl.NumberFormat("vi-VN").format(n);
}

export function ItemCard({
  item,
  index,
  onAmountChange,
  disabled,
}: {
  item: MemberSessionItem;
  index: number;
  onAmountChange?: (index: number, amount: number) => void;
  disabled?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: `item-${index}`,
      data: { item, index },
      disabled,
    });

  const style = transform
    ? {
        transform: CSS.Translate.toString(transform),
        zIndex: 50,
        opacity: isDragging ? 0.7 : 1,
      }
    : undefined;

  const isIncome = item.column === "income";
  const isExpense = item.column === "expense";
  const typeLabel =
    item.column === "personal" && item.type
      ? item.type === "income"
        ? "Thu nhập"
        : "Chi phí"
      : null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`rounded-md border p-3 bg-card shadow-sm text-sm cursor-grab active:cursor-grabbing select-none ${
        isDragging ? "ring-2 ring-primary" : ""
      } ${
        item.column === "personal" && item.type === "income"
          ? "border-l-2 border-l-green-500"
          : item.column === "personal" && item.type === "expense"
            ? "border-l-2 border-l-red-400"
            : ""
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-medium wrap-break-word">{item.title}</span>
            {typeLabel && (
              <span
                className={`shrink-0 rounded px-1 py-0.5 text-[10px] leading-none font-medium ${
                  item.type === "income"
                    ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                    : "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"
                }`}
              >
                {typeLabel}
              </span>
            )}
          </div>
          {item.categoryName && (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {item.categoryName}
            </p>
          )}
        </div>
        <span
          className={`text-xs font-semibold whitespace-nowrap ${
            isIncome || item.type === "income"
              ? "text-green-600"
              : isExpense || item.type === "expense"
                ? "text-red-500"
                : "text-muted-foreground"
          }`}
        >
          {fmt(item.amount)} đ
        </span>
      </div>
      {onAmountChange && !disabled && (
        <Input
          type="number"
          className="mt-1 h-7 text-xs"
          value={item.amount}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onChange={(e) => {
            const val = Number(e.target.value) || 0;
            onAmountChange(index, val);
          }}
        />
      )}
    </div>
  );
}
