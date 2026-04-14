"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  Timestamp,
} from "firebase/firestore";
import { getFirestoreDb } from "@/lib/firebase/client";
import { useAuthStore } from "@/lib/stores/authStore";

export type MusicRoomPeer = {
  uid: string;
  displayName: string;
  lastSeenMs: number;
};

const HEARTBEAT_MS = 15_000;
const STALE_MS = 45_000;

export type MusicRoomPresenceScope = "family" | "community";

function peerDocRef(scope: MusicRoomPresenceScope, familyId: string | null, uid: string) {
  const db = getFirestoreDb();
  if (scope === "community") {
    return doc(db, "communityMusicPresence", uid);
  }
  if (!familyId) throw new Error("familyId required");
  return doc(db, "families", familyId, "musicRoomPresence", uid);
}

function peersCollectionRef(scope: MusicRoomPresenceScope, familyId: string | null) {
  const db = getFirestoreDb();
  if (scope === "community") {
    return collection(db, "communityMusicPresence");
  }
  if (!familyId) throw new Error("familyId required");
  return collection(db, "families", familyId, "musicRoomPresence");
}

/**
 * Ghi nhận đang mở phòng nhạc + heartbeat; danh sách peer gần đây.
 * `joinEvent` tăng khi có **người khác** (không phải bạn) vừa xuất hiện trong danh sách.
 */
export function useMusicRoomPresence(options: {
  scope: MusicRoomPresenceScope;
  familyId?: string | null;
  enabled: boolean;
}) {
  const { scope, familyId, enabled } = options;
  const user = useAuthStore((s) => s.user);
  const authUid = user?.uid ?? null;
  const profileName =
    user?.displayName?.trim() || user?.email?.trim() || "Thành viên";

  const [rawPeers, setRawPeers] = useState<MusicRoomPeer[]>([]);
  const [joinEvent, setJoinEvent] = useState(0);

  const prevPeerIdsRef = useRef<Set<string> | null>(null);
  const initRef = useRef(false);

  useEffect(() => {
    if (!enabled || !authUid) {
      setRawPeers([]);
      prevPeerIdsRef.current = null;
      initRef.current = false;
      return;
    }
    if (scope === "family" && !familyId) {
      setRawPeers([]);
      return;
    }

    const displayName = profileName;

    let heartbeat: ReturnType<typeof setInterval> | null = null;

    const writePresence = () => {
      try {
        const ref = peerDocRef(scope, familyId ?? null, authUid);
        void setDoc(
          ref,
          {
            displayName,
            lastSeen: serverTimestamp(),
          },
          { merge: true },
        );
      } catch {
        /* ignore */
      }
    };

    writePresence();
    heartbeat = setInterval(writePresence, HEARTBEAT_MS);

    const col = peersCollectionRef(scope, familyId ?? null);
    const unsub = onSnapshot(
      col,
      (snap) => {
        const list: MusicRoomPeer[] = [];
        const now = Date.now();
        for (const d of snap.docs) {
          const data = d.data() as Record<string, unknown>;
          const ls = data.lastSeen;
          const lastSeenMs =
            ls instanceof Timestamp ? ls.toMillis() : 0;
          if (now - lastSeenMs > STALE_MS) continue;
          const name =
            typeof data.displayName === "string" && data.displayName.trim()
              ? data.displayName.trim()
              : d.id.slice(0, 8);
          list.push({
            uid: d.id,
            displayName: name,
            lastSeenMs,
          });
        }
        list.sort((a, b) => a.displayName.localeCompare(b.displayName, "vi"));

        setRawPeers(list);

        const ids = new Set(list.map((p) => p.uid));
        if (!initRef.current) {
          prevPeerIdsRef.current = new Set(ids);
          initRef.current = true;
          return;
        }
        const prev = prevPeerIdsRef.current ?? new Set<string>();
        const newcomers = [...ids].filter((id) => !prev.has(id));
        prevPeerIdsRef.current = new Set(ids);
        if (newcomers.length === 0) return;
        if (newcomers.some((id) => id !== authUid)) {
          setJoinEvent((e) => e + 1);
        }
      },
      (e) => console.error("musicRoom presence", e),
    );

    return () => {
      if (heartbeat) clearInterval(heartbeat);
      unsub();
      try {
        const ref = peerDocRef(scope, familyId ?? null, authUid);
        void deleteDoc(ref);
      } catch {
        /* ignore */
      }
      prevPeerIdsRef.current = null;
      initRef.current = false;
    };
  }, [enabled, authUid, scope, familyId, profileName]);

  const peers = useMemo(() => rawPeers, [rawPeers]);

  return { peers, joinEvent };
}
