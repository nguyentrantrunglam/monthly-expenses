"use client";

import { useMemo } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { vi } from "date-fns/locale";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { parseMonthKey } from "@/hooks/usePersonalGoals";
import { contrastingForegroundForBg } from "@/lib/personal-goal-task-styles";

const WEEKDAYS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"] as const;

const EVENT_COLORS: Record<string, { bg: string; text: string }> = {
  "1": { bg: "#5c6bc0", text: "#ffffff" },
  "2": { bg: "#43a047", text: "#ffffff" },
  "3": { bg: "#7b1fa2", text: "#ffffff" },
  "4": { bg: "#e57373", text: "#ffffff" },
  "5": { bg: "#ffb74d", text: "#1a1a1a" },
  "6": { bg: "#ff7043", text: "#ffffff" },
  "7": { bg: "#29b6f6", text: "#ffffff" },
  "8": { bg: "#78909c", text: "#ffffff" },
  "9": { bg: "#3f51b5", text: "#ffffff" },
  "10": { bg: "#66bb6a", text: "#ffffff" },
  "11": { bg: "#ef5350", text: "#ffffff" },
};

const COLOR_IDS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"];

function barStyleFromKey(fallbackKey?: string): {
  backgroundColor: string;
  color: string;
} {
  const idx = fallbackKey
    ? [...fallbackKey].reduce((a, b) => a + b.charCodeAt(0), 0) %
      COLOR_IDS.length
    : 0;
  const c = EVENT_COLORS[COLOR_IDS[idx]!]!;
  return { backgroundColor: c.bg, color: c.text };
}

export type GoalsDayBar = {
  id: string;
  label: string;
  styleKey: string;
  /** Màu công việc; nếu thiếu thì dùng hash theo styleKey. */
  barBg?: string;
};

function monthDateFromKey(monthKey: string): Date {
  const { year, month } = parseMonthKey(monthKey);
  return new Date(year, month - 1, 1);
}

export function GoalsMonthCalendar({
  monthKey,
  onMonthKeyChange,
  onToday,
  logsByDate,
  loading,
  onOpenDay,
  readOnly,
}: {
  monthKey: string;
  onMonthKeyChange: (key: string) => void;
  onToday: () => void;
  logsByDate: Record<string, GoalsDayBar[]>;
  loading?: boolean;
  onOpenDay: (ymd: string) => void;
  /** Admin xem user khác — chỉ xem nhật ký, không ghi. */
  readOnly?: boolean;
}) {
  const monthDate = useMemo(() => monthDateFromKey(monthKey), [monthKey]);

  const monthDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(monthDate), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(monthDate), { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end });
  }, [monthDate]);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground sm:max-w-md">
          {readOnly
            ? "Bấm ô ngày hoặc thanh màu để xem nhật ký (chỉ đọc)."
            : "Cùng kiểu lưới với Lịch gia đình: bấm ô ngày để ghi/sửa nhật ký; bấm thanh màu cũng mở form ngày đó."}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={onToday}>
            Hôm nay
          </Button>
          <div className="flex items-center rounded-lg border">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() =>
                onMonthKeyChange(format(subMonths(monthDate, 1), "yyyy-MM"))
              }
              aria-label="Tháng trước"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-[140px] px-2 text-center text-sm font-medium capitalize">
              {format(monthDate, "MMMM yyyy", { locale: vi })}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() =>
                onMonthKeyChange(format(addMonths(monthDate, 1), "yyyy-MM"))
              }
              aria-label="Tháng sau"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <Card className="relative overflow-hidden">
        {loading ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/80 backdrop-blur-[1px]">
            <div className="flex flex-col items-center gap-2">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <p className="text-sm text-muted-foreground">Đang tải…</p>
            </div>
          </div>
        ) : null}
        <div className="grid grid-cols-7 border-b bg-muted/30">
          {WEEKDAYS.map((d) => (
            <div
              key={d}
              className="py-2 text-center text-xs font-medium text-muted-foreground"
            >
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {monthDays.map((day) => {
            const key = format(day, "yyyy-MM-dd");
            const dayBars = logsByDate[key] ?? [];
            const isCurrentMonth = isSameMonth(day, monthDate);
            const isTodayDate = isToday(day);
            const inScope = key.startsWith(monthKey);

            return (
              <div
                key={key}
                role="button"
                tabIndex={0}
                onClick={() => {
                  if (!inScope) return;
                  onOpenDay(key);
                }}
                onKeyDown={(e) => {
                  if (!inScope) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onOpenDay(key);
                  }
                }}
                className={`min-h-[100px] border-b border-r p-1 transition-colors last:border-r-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset ${
                  inScope
                    ? "cursor-pointer hover:bg-muted/50"
                    : "cursor-default opacity-60"
                } ${
                  isCurrentMonth ? "bg-background" : "bg-muted/20"
                }`}
              >
                <div
                  className={`mb-1 flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium ${
                    isTodayDate
                      ? "bg-primary text-primary-foreground"
                      : isCurrentMonth
                        ? "text-foreground"
                        : "text-muted-foreground"
                  }`}
                >
                  {format(day, "d")}
                </div>
                <div
                  className="max-h-[132px] space-y-0.5 overflow-y-auto overflow-x-hidden overscroll-contain pr-0.5 [scrollbar-width:thin] sm:max-h-[160px]"
                  onClick={(e) => e.stopPropagation()}
                >
                  {dayBars.map((bar) => (
                    <button
                      key={bar.id}
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (inScope) onOpenDay(key);
                      }}
                      className="flex w-full min-w-0 cursor-pointer items-center gap-1 truncate rounded px-1.5 py-0.5 text-left text-[11px] font-semibold transition-opacity hover:opacity-90"
                      style={
                        bar.barBg
                          ? {
                              backgroundColor: bar.barBg,
                              color: contrastingForegroundForBg(bar.barBg),
                            }
                          : barStyleFromKey(bar.styleKey)
                      }
                      title={bar.label}
                    >
                      <span className="min-w-0 flex-1 truncate">{bar.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
