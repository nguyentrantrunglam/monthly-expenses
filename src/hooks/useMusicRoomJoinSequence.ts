"use client";

import { useEffect, useRef, useState } from "react";
import { playNotificationBell } from "@/lib/play-notification-bell";

/**
 * Khi `joinEvent` tăng (có người khác vào phòng): tắt tiếng YouTube → chuông →
 * một xung đồng bộ (seek) → bật lại tiếng. Lặp cho mỗi lần joinEvent tăng.
 */
export function useMusicRoomJoinSequence(
  joinEvent: number,
  showPlayer: boolean,
) {
  const [outputMuted, setOutputMuted] = useState(false);
  const [resyncTick, setResyncTick] = useState(0);
  const processedRef = useRef(0);

  useEffect(() => {
    if (!showPlayer) {
      processedRef.current = joinEvent;
      return;
    }

    let cancelled = false;

    const run = async () => {
      while (!cancelled && processedRef.current < joinEvent) {
        setOutputMuted(true);
        await playNotificationBell();
        if (cancelled) break;
        setResyncTick((t) => t + 1);
        await new Promise((r) => setTimeout(r, 150));
        if (cancelled) break;
        setOutputMuted(false);
        processedRef.current += 1;
      }
      if (cancelled) setOutputMuted(false);
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [joinEvent, showPlayer]);

  return { outputMuted, resyncTick };
}
