"use client";

import { useCallback, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getFirebaseAuth } from "@/lib/firebase/client";

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

async function getIdToken() {
  const auth = getFirebaseAuth();
  const user = auth.currentUser;
  if (!user) return null;
  return user.getIdToken();
}

async function fetchWithAuth(url: string, options?: RequestInit) {
  const token = await getIdToken();
  if (!token) throw new Error("Chưa đăng nhập");
  const res = await fetch(url, {
    ...options,
    headers: {
      ...options?.headers,
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? res.statusText);
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
    },
  });
}
