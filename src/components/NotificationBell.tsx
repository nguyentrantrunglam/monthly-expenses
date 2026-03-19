"use client";

import { useRouter } from "next/navigation";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Bell, CalendarDays, StickyNote, CalendarRange } from "lucide-react";
import { useNotifications, type Notification } from "@/hooks/useNotifications";
import { useAuthStore } from "@/lib/stores/authStore";
import { formatDistanceToNow } from "date-fns";
import { vi } from "date-fns/locale";

function getIcon(type: Notification["type"]) {
  switch (type) {
    case "session":
      return <CalendarRange className="h-3.5 w-3.5 text-primary" />;
    case "notes":
      return <StickyNote className="h-3.5 w-3.5 text-amber-500" />;
    case "calendar":
      return <CalendarDays className="h-3.5 w-3.5 text-blue-500" />;
    default:
      return <Bell className="h-3.5 w-3.5" />;
  }
}

function formatTime(createdAt: unknown) {
  if (!createdAt) return "";
  try {
    const d =
      typeof createdAt === "object" && createdAt !== null && "toDate" in createdAt
        ? (createdAt as { toDate: () => Date }).toDate()
        : new Date(String(createdAt));
    return formatDistanceToNow(d, { addSuffix: true, locale: vi });
  } catch {
    return "";
  }
}

export function NotificationBell() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const { notifications, unreadCount, markAsRead, markAllAsRead } =
    useNotifications();

  const unread = notifications.filter(
    (n) => n.createdBy !== user?.uid && !n.readBy.includes(user?.uid ?? "")
  );

  const handleClick = (n: Notification) => {
    if (n.link) {
      router.push(n.link);
      markAsRead(n.id);
    }
  };

  if (!user?.familyId) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9"
          aria-label={`Thông báo${unreadCount > 0 ? ` (${unreadCount} mới)` : ""}`}
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-semibold">Thông báo</span>
          {unread.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={markAllAsRead}
            >
              Đánh dấu đã đọc
            </Button>
          )}
        </div>
        <div className="max-h-[320px] overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">
              Chưa có thông báo
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((n) => {
                const isUnread =
                  n.createdBy !== user?.uid && !n.readBy.includes(user?.uid ?? "");
                return (
                  <button
                    key={n.id}
                    type="button"
                    className={`flex w-full gap-2 px-3 py-2.5 text-left transition-colors hover:bg-muted/50 ${
                      isUnread ? "bg-muted/30" : ""
                    }`}
                    onClick={() => handleClick(n)}
                  >
                    <div className="mt-0.5 shrink-0">{getIcon(n.type)}</div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] leading-snug">{n.message}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {formatTime(n.createdAt)}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
