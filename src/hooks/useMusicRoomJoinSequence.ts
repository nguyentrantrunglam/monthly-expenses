"use client";

import { useEffect, useRef, useState } from "react";
import { playNotificationBell } from "@/lib/play-notification-bell";

/**
 * Khi `joinEvent` tăng (có người khác vào phòng): tắt tiếng YouTube → chuông →
 * bật lại tiếng. Không seek lại người đang nghe để tránh giật về mốc khác.
 */
export function useMusicRoomJoinSequence(
  joinEvent: number,
  showPlayer: boolean,
) {
  const [outputMuted, setOutputMuted] = useState(false);
  const [resyncTick] = useState(0);
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
