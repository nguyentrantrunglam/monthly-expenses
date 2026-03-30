"use client";

import { useCallback, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { useAuthStore } from "@/lib/stores/authStore";
import { createNotification } from "@/lib/notifications";

export interface CalendarEvent {
  id?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  htmlLink?: string;
  status?: string;
  colorId?: string;
  isHoliday?: boolean;
}

export interface CalendarStatusResponse {
  connected: boolean;
  isOwner: boolean;
  familyId: string | null;
}

export interface CalendarEventsResponse {
  items: CalendarEvent[];
  nextPageToken?: string;
}

/** Lỗi API calendar — có `code` từ server (vd. GOOGLE_OAUTH_INVALID). */
export class CalendarApiError extends Error {
  readonly code?: string;
  readonly httpStatus: number;

  constructor(message: string, httpStatus: number, code?: string) {
    super(message);
    this.name = "CalendarApiError";
    this.httpStatus = httpStatus;
    this.code = code;
  }
}

function isGoogleReconnectErrorCode(code?: string): boolean {
  return (
    code === "GOOGLE_CALENDAR_AUTH" || code === "GOOGLE_OAUTH_INVALID"
  );
}

/** Cần chủ gia đình kết nối lại Google (token OAuth hết hạn / thu hồi). */
export function calendarNeedsGoogleReconnect(err: unknown): boolean {
  if (err instanceof CalendarApiError && isGoogleReconnectErrorCode(err.code)) {
    return true;
  }
  const msg = err instanceof Error ? err.message : String(err);
  return (
    /Google Calendar từ chối|kết nối lại trong trang Lịch|Phiên Google Calendar|invalid_grant/i.test(
      msg,
    )
  );
}

async function getIdToken() {
  const auth = getFirebaseAuth();
  const user = auth.currentUser;
  if (!user) return null;
  return user.getIdToken();
}

/** Gọi API calendar với Bearer; 401 do token Firebase cũ → làm mới và gửi lại 1 lần. */
async function fetchWithAuth(url: string, options?: RequestInit) {
  const auth = getFirebaseAuth();
  const user = auth.currentUser;
  if (!user) throw new Error("Chưa đăng nhập");

  const request = (idToken: string) =>
    fetch(url, {
      ...options,
      headers: {
        ...options?.headers,
        Authorization: `Bearer ${idToken}`,
      },
    });

  let token = await user.getIdToken();
  let res = await request(token);

  if (res.status === 401) {
    const err = (await res.json().catch(() => ({}))) as {
      error?: string;
      code?: string;
    };
    const msg = err.error ?? "";
    const firebaseAuthIssue =
      err.code === "auth/id-token-expired" ||
      err.code === "auth/argument-error" ||
      err.code === "auth/id-token-revoked" ||
      (msg.includes("Phiên đăng nhập") && msg.includes("hết hạn"));

    if (firebaseAuthIssue) {
      token = await user.getIdToken(true);
      res = await request(token);
      if (!res.ok) {
        const err2 = (await res.json().catch(() => ({}))) as {
          error?: string;
          code?: string;
        };
        throw new CalendarApiError(
          err2.error ?? res.statusText,
          res.status,
          err2.code,
        );
      }
      return res.json();
    }
    throw new CalendarApiError(
      err.error ?? "Không được phép truy cập",
      401,
      err.code,
    );
  }

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as {
      error?: string;
      code?: string;
    };
    throw new CalendarApiError(
      err.error ?? res.statusText,
      res.status,
      err.code,
    );
  }
  return res.json();
}

export function useCalendarStatus() {
  return useQuery<CalendarStatusResponse, Error>({
    queryKey: ["calendar-status"],
    queryFn: () =>
      fetchWithAuth("/api/calendar/status") as Promise<CalendarStatusResponse>,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: true,
  });
}

export function useCalendarEvents(timeMin: string, timeMax: string) {
  return useQuery<CalendarEventsResponse, Error>({
    queryKey: ["calendar-events", timeMin, timeMax],
    queryFn: () =>
      (fetchWithAuth(
        `/api/calendar/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}`
      ) as Promise<CalendarEventsResponse>),
    enabled: !!timeMin && !!timeMax,
    refetchOnWindowFocus: true,
  });
}

export function useConnectGoogleCalendar() {
  const [loading, setLoading] = useState(false);

  const connect = useCallback(async (familyId: string) => {
    setLoading(true);
    try {
      const token = await getIdToken();
      if (!token) throw new Error("Chưa đăng nhập");
      const res = await fetch("/api/auth/google/connect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ familyId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Lỗi kết nối");
      if (data.url) {
        window.location.href = data.url;
      }
    } finally {
      setLoading(false);
    }
  }, []);

  return { connect, loading };
}

export function useCreateCalendarEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (event: {
      summary: string;
      description?: string;
      start: string;
      end?: string;
      location?: string;
      colorId?: string;
    }) => {
      return fetchWithAuth("/api/calendar/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(event),
      });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
      const user = useAuthStore.getState().user;
      if (user?.familyId) {
        createNotification(user.familyId, {
          type: "calendar",
          createdBy: user.uid,
          message: `Đã thêm sự kiện lịch: ${variables.summary.slice(0, 50)}${variables.summary.length > 50 ? "…" : ""}`,
          link: "/calendar",
        }).catch(() => {});
      }
    },
  });
}

export function useUpdateCalendarEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      eventId: string;
      summary: string;
      description?: string;
      start: string;
      end?: string;
      location?: string;
      colorId?: string;
    }) => {
      const { eventId, ...body } = input;
      return fetchWithAuth(
        `/api/calendar/events/${encodeURIComponent(eventId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
    },
  });
}
