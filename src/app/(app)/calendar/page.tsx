"use client";

import { useState, useMemo, useEffect } from "react";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addMonths,
  subMonths,
  isSameMonth,
  isToday,
  eachDayOfInterval,
  addDays,
  parseISO,
  isBefore,
} from "date-fns";
import { vi } from "date-fns/locale";
import { useFamily } from "@/hooks/useFamily";
import { useAuthStore } from "@/lib/stores/authStore";
import {
  useCalendarStatus,
  useCalendarEvents,
  useConnectGoogleCalendar,
  useCreateCalendarEvent,
  type CalendarEvent,
} from "@/hooks/useGoogleCalendar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Plus,
  Link2,
  ExternalLink,
} from "lucide-react";
import { useSearchParams } from "next/navigation";

const WEEKDAYS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

const EVENT_COLORS: Record<
  string,
  { bg: string; text: string }
> = {
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

const COLOR_OPTIONS = [
  { id: "1", name: "Lavender", hex: "#7986cb" },
  { id: "2", name: "Sage", hex: "#33b679" },
  { id: "3", name: "Grape", hex: "#8e24aa" },
  { id: "4", name: "Flamingo", hex: "#e67c73" },
  { id: "5", name: "Banana", hex: "#f6bf26" },
  { id: "6", name: "Tangerine", hex: "#f4511e" },
  { id: "7", name: "Peacock", hex: "#039be5" },
  { id: "8", name: "Graphite", hex: "#616161" },
  { id: "9", name: "Blueberry", hex: "#3f51b5" },
  { id: "10", name: "Basil", hex: "#0b8043" },
  { id: "11", name: "Tomato", hex: "#d50000" },
];

const COLOR_IDS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"];

function getEventStyle(
  colorId?: string,
  fallbackKey?: string
): { backgroundColor: string; color: string } {
  if (colorId && EVENT_COLORS[colorId]) {
    const c = EVENT_COLORS[colorId];
    return { backgroundColor: c.bg, color: c.text };
  }
  const idx = fallbackKey
    ? [...fallbackKey].reduce((a, b) => a + b.charCodeAt(0), 0) % COLOR_IDS.length
    : 0;
  const c = EVENT_COLORS[COLOR_IDS[idx]!];
  return { backgroundColor: c.bg, color: c.text };
}

function getEventDateKey(ev: CalendarEvent): string {
  const s = ev.start?.dateTime ?? ev.start?.date;
  if (!s) return "";
  return s.slice(0, 10);
}

function getEventDateRange(ev: CalendarEvent): string[] {
  const startStr = ev.start?.dateTime ?? ev.start?.date;
  const endStr = ev.end?.dateTime ?? ev.end?.date;
  if (!startStr) return [];
  const startDate = parseISO(startStr.slice(0, 10));
  const endDate = endStr ? parseISO(endStr.slice(0, 10)) : startDate;
  const isAllDay = !!ev.start?.date;
  const dates: string[] = [];
  let d = startDate;
  if (isAllDay) {
    while (isBefore(d, endDate)) {
      dates.push(format(d, "yyyy-MM-dd"));
      d = addDays(d, 1);
      if (dates.length > 31) break;
    }
  } else {
    while (isBefore(d, endDate) || format(d, "yyyy-MM-dd") === format(endDate, "yyyy-MM-dd")) {
      dates.push(format(d, "yyyy-MM-dd"));
      if (format(d, "yyyy-MM-dd") === format(endDate, "yyyy-MM-dd")) break;
      d = addDays(d, 1);
      if (dates.length > 31) break;
    }
  }
  if (dates.length === 0) dates.push(format(startDate, "yyyy-MM-dd"));
  return dates;
}

export default function CalendarPage() {
  const searchParams = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const { family } = useFamily();
  const { data: status, refetch: refetchStatus } = useCalendarStatus();
  const { connect, loading: connecting } = useConnectGoogleCalendar();
  const createEvent = useCreateCalendarEvent();

  const [currentDate, setCurrentDate] = useState(new Date());
  const [createOpen, setCreateOpen] = useState(false);
  const [newSummary, setNewSummary] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newStart, setNewStart] = useState("");
  const [newEnd, setNewEnd] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [newColorId, setNewColorId] = useState<string>("");

  const connected = status?.connected ?? false;
  const isOwner =
    status?.isOwner ?? (!!family && family.createdBy === user?.uid);
  const familyId = status?.familyId ?? user?.familyId ?? null;

  useEffect(() => {
    if (searchParams.get("connected") === "1") {
      refetchStatus();
      window.history.replaceState({}, "", "/calendar");
    }
  }, [searchParams, refetchStatus]);

  const { timeMin, timeMax } = useMemo(() => {
    const start = startOfMonth(currentDate);
    const end = endOfMonth(currentDate);
    return {
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
    };
  }, [currentDate]);

  const { data: eventsData, isLoading: eventsLoading } = useCalendarEvents(
    timeMin,
    timeMax
  );
  const events = eventsData?.items ?? [];

  const eventsByDate = useMemo(() => {
    const map: Record<string, { ev: CalendarEvent; isFirst: boolean; isLast: boolean }[]> = {};
    for (const ev of events) {
      const dates = getEventDateRange(ev);
      dates.forEach((key, i) => {
        if (!map[key]) map[key] = [];
        map[key].push({
          ev,
          isFirst: i === 0,
          isLast: i === dates.length - 1,
        });
      });
    }
    return map;
  }, [events]);

  const monthDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentDate), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end });
  }, [currentDate]);

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSummary.trim() || !newStart) return;
    try {
      await createEvent.mutateAsync({
        summary: newSummary.trim(),
        description: newDesc.trim() || undefined,
        start: newStart,
        end: newEnd || undefined,
        location: newLocation.trim() || undefined,
        colorId: newColorId || undefined,
      });
      setCreateOpen(false);
      setNewSummary("");
      setNewDesc("");
      setNewStart("");
      setNewEnd("");
      setNewLocation("");
      setNewColorId("");
    } catch (err) {
      console.error(err);
    }
  };

  if (!user?.familyId || !family) {
    return (
      <Card className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
          <Calendar className="h-7 w-7 text-muted-foreground/50" />
        </div>
        <div>
          <p className="font-medium">Chưa có gia đình</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Bạn cần tạo hoặc tham gia gia đình để sử dụng lịch chung.
          </p>
        </div>
      </Card>
    );
  }

  if (!connected && isOwner) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Lịch gia đình
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Kết nối Google Calendar của chủ gia đình để đồng bộ lịch chung
          </p>
        </div>
        <Card className="flex flex-col items-center justify-center gap-6 py-16">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <Link2 className="h-8 w-8 text-primary" />
          </div>
          <div className="text-center">
            <p className="font-medium">Chưa kết nối Google Calendar</p>
            <p className="mt-1 text-sm text-muted-foreground max-w-sm">
              Là chủ gia đình, bạn cần kết nối tài khoản Google để toàn bộ thành
              viên có thể xem và thêm sự kiện vào lịch chung.
            </p>
          </div>
          <Button
            onClick={() => familyId && connect(familyId)}
            disabled={connecting}
            className="gap-2"
          >
            <Link2 className="h-4 w-4" />
            {connecting ? "Đang chuyển hướng..." : "Kết nối Google Calendar"}
          </Button>
        </Card>
      </div>
    );
  }

  if (!connected && !isOwner) {
    return (
      <Card className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <Calendar className="h-12 w-12 text-muted-foreground/50" />
        <div>
          <p className="font-medium">Lịch chưa được kết nối</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Chủ gia đình cần kết nối Google Calendar trước để sử dụng tính năng
            này.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Lịch gia đình</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Đồng bộ với Google Calendar của chủ gia đình
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentDate(new Date())}
          >
            Hôm nay
          </Button>
          <div className="flex items-center rounded-lg border">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setCurrentDate((d) => subMonths(d, 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-[140px] px-2 text-center text-sm font-medium">
              {format(currentDate, "MMMM yyyy", { locale: vi })}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setCurrentDate((d) => addMonths(d, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5">
                <Plus className="h-4 w-4" />
                Tạo
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Tạo sự kiện mới</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreateEvent} className="space-y-4 mt-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-muted-foreground">
                    Tiêu đề
                  </label>
                  <Input
                    value={newSummary}
                    onChange={(e) => setNewSummary(e.target.value)}
                    placeholder="Thêm tiêu đề"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-muted-foreground">
                    Mô tả (tùy chọn)
                  </label>
                  <Input
                    value={newDesc}
                    onChange={(e) => setNewDesc(e.target.value)}
                    placeholder="Thêm mô tả"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-medium text-muted-foreground">
                      Bắt đầu
                    </label>
                    <DatePicker
                      value={newStart}
                      onChange={setNewStart}
                      placeholder="Chọn ngày"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-medium text-muted-foreground">
                      Kết thúc (tùy chọn)
                    </label>
                    <DatePicker
                      value={newEnd}
                      onChange={setNewEnd}
                      placeholder="Chọn ngày"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-muted-foreground">
                    Địa điểm (tùy chọn)
                  </label>
                  <Input
                    value={newLocation}
                    onChange={(e) => setNewLocation(e.target.value)}
                    placeholder="Thêm địa điểm"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-muted-foreground">
                    Màu sắc (tùy chọn)
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {COLOR_OPTIONS.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        title={c.name}
                        onClick={() =>
                          setNewColorId((prev) => (prev === c.id ? "" : c.id))
                        }
                        className={`h-7 w-7 rounded-full border-2 transition-all ${
                          newColorId === c.id
                            ? "border-foreground scale-110"
                            : "border-transparent hover:scale-105"
                        }`}
                        style={{ backgroundColor: c.hex }}
                      />
                    ))}
                  </div>
                </div>
                <Button
                  type="submit"
                  disabled={
                    createEvent.isPending || !newSummary.trim() || !newStart
                  }
                >
                  {createEvent.isPending ? "Đang tạo..." : "Tạo sự kiện"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card className="overflow-hidden">
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
            const dayEvents = eventsByDate[key] ?? [];
            const isCurrentMonth = isSameMonth(day, currentDate);
            const isTodayDate = isToday(day);
            return (
              <div
                key={key}
                className={`min-h-[100px] border-b border-r p-1 last:border-r-0 ${
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
                <div className="space-y-0.5">
                  {dayEvents.slice(0, 3).map(({ ev, isFirst }) => (
                    <a
                      key={`${ev.id}-${key}`}
                      href={ev.htmlLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold truncate hover:opacity-90 transition-opacity"
                      style={getEventStyle(ev.colorId, ev.id ?? ev.summary)}
                      title={ev.summary}
                    >
                      <span className="truncate flex-1">
                        {!isFirst ? "… " : ""}{ev.summary}
                      </span>
                      <ExternalLink className="h-2.5 w-2.5 shrink-0 opacity-80" />
                    </a>
                  ))}
                  {dayEvents.length > 3 && (
                    <div className="text-[10px] text-muted-foreground px-1">
                      +{dayEvents.length - 3} nữa
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {eventsLoading && (
        <p className="text-sm text-muted-foreground">Đang tải sự kiện...</p>
      )}
    </div>
  );
}
