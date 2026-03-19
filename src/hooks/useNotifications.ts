"use client";

import { useEffect, useRef, useState } from "react";
import {
  arrayUnion,
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
} from "firebase/firestore";
import { getFirestoreDb } from "@/lib/firebase/client";
import { useAuthStore } from "@/lib/stores/authStore";
import type { NotificationType } from "@/lib/notifications";

export interface Notification {
  id: string;
  type: NotificationType;
  createdBy: string;
  message: string;
  link?: string;
  metadata?: Record<string, unknown>;
  readBy: string[];
  createdAt: unknown;
}

function playBellSound() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = "sine";
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  } catch {
    // ignore
  }
}

export function useNotifications() {
  const user = useAuthStore((s) => s.user);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const prevUnreadIdsRef = useRef<Set<string>>(new Set());
  const isFirstLoadRef = useRef(true);

  useEffect(() => {
    if (!user?.familyId) {
      setNotifications([]);
      setLoading(false);
      return;
    }
    const db = getFirestoreDb();
    const col = collection(db, "families", user.familyId, "notifications");
    const q = query(col, orderBy("createdAt", "desc"), limit(50));
    const unsub = onSnapshot(q, (snap) => {
      const list: Notification[] = [];
      snap.forEach((d) => {
        const data = d.data();
        list.push({
          id: d.id,
          type: data.type ?? "notes",
          createdBy: data.createdBy ?? "",
          message: data.message ?? "",
          link: data.link,
          metadata: data.metadata,
          readBy: data.readBy ?? [],
          createdAt: data.createdAt,
        });
      });
      const unread = list.filter(
        (n) => n.createdBy !== user?.uid && !n.readBy.includes(user?.uid ?? "")
      );
      const unreadIds = new Set(unread.map((n) => n.id));
      if (!isFirstLoadRef.current && unreadIds.size > 0) {
        const hasNew = [...unreadIds].some((id) => !prevUnreadIdsRef.current.has(id));
        if (hasNew) playBellSound();
      }
      isFirstLoadRef.current = false;
      prevUnreadIdsRef.current = unreadIds;
      setNotifications(list);
      setLoading(false);
    });
    return () => unsub();
  }, [user?.familyId, user?.uid]);

  const unreadCount = notifications.filter(
    (n) => n.createdBy !== user?.uid && !n.readBy.includes(user?.uid ?? "")
  ).length;

  const markAsRead = async (id: string) => {
    if (!user?.familyId || !user?.uid) return;
    const db = getFirestoreDb();
    const ref = doc(db, "families", user.familyId, "notifications", id);
    await updateDoc(ref, { readBy: arrayUnion(user.uid) });
  };

  const markAllAsRead = async () => {
    if (!user?.uid) return;
    const unread = notifications.filter(
      (n) => n.createdBy !== user.uid && !n.readBy.includes(user.uid)
    );
    const db = getFirestoreDb();
    for (const n of unread) {
      const ref = doc(db, "families", user.familyId!, "notifications", n.id);
      await updateDoc(ref, { readBy: arrayUnion(user.uid) });
    }
  };

  return {
    notifications,
    loading,
    unreadCount,
    markAsRead,
    markAllAsRead,
  };
}
