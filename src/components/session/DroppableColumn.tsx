"use client";

import { useDroppable } from "@dnd-kit/core";
import type { ReactNode } from "react";

function fmt(n: number) {
  return new Intl.NumberFormat("vi-VN").format(n);
}

export function DroppableColumn({
  id,
  title,
  total,
  color,
  children,
}: {
  id: string;
  title: string;
  total: number;
  color: "default" | "green" | "red";
  children: ReactNode;
}) {
  const { isOver, setNodeRef } = useDroppable({ id });

  const colorMap = {
    default: "",
    green: "border-green-400 dark:border-green-700",
    red: "border-red-400 dark:border-red-700",
  };

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col rounded-lg border-2 border-dashed p-3 min-h-[200px] transition-colors ${
        colorMap[color]
      } ${isOver ? "bg-muted/60" : "bg-card/50"}`}
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span
          className={`text-xs font-medium ${
            color === "green"
              ? "text-green-600"
              : color === "red"
                ? "text-red-500"
                : "text-muted-foreground"
          }`}
        >
          {fmt(total)} đ
        </span>
      </div>
      <div className="flex flex-col gap-2 flex-1">{children}</div>
    </div>
  );
}
