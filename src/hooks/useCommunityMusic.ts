"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { getFirestoreDb } from "@/lib/firebase/client";
import { useAuthStore } from "@/lib/stores/authStore";
import { nanoid } from "nanoid";
import { arrayMove } from "@dnd-kit/sortable";
import {
  canonicalYoutubeWatchUrl,
  extractYoutubeVideoId,
  fetchYoutubeOEmbed,
} from "@/lib/youtube";
import {
  type MusicQueueItem,
  type MusicRoomState,
  parseMusicRoomState,
} from "@/lib/music-room-shared";

/** Collection `communityMusic`, document `state` — đúng 2 cặp segment Firestore. */
const COMMUNITY_MUSIC_DOC = ["communityMusic", "state"] as const;

/**
 * Firestore: communityMusic/state — một phòng chung cho mọi user đã đăng nhập.
 */
export function useCommunityMusic() {
  const user = useAuthStore((s) => s.user);
  const [state, setState] = useState<MusicRoomState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  useEffect(() => {
    if (!user?.uid) {
      setState(null);
      setLoading(false);
      return;
    }
    const db = getFirestoreDb();
    const ref = doc(db, ...COMMUNITY_MUSIC_DOC);
    setLoading(true);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setState({
            queue: [],
            currentIndex: 0,
            isPlaying: false,
            playbackPositionSec: 0,
            stateAtMillis: null,
            updatedAt: null,
          });
        } else {
          setState(parseMusicRoomState(snap.data() as Record<string, unknown>));
        }
        setLoading(false);
        setError(null);
      },
      (e) => {
        console.error(e);
        setError("Không tải được phòng nhạc cộng đồng.");
        setLoading(false);
      },
    );
    return () => unsub();
  }, [user?.uid]);

  const currentItem = useMemo(() => {
    if (!state || state.queue.length === 0) return null;
    const idx = Math.min(state.currentIndex, state.queue.length - 1);
    return state.queue[idx] ?? null;
  }, [state]);

  const roomRef = useCallback(() => {
    return doc(getFirestoreDb(), ...COMMUNITY_MUSIC_DOC);
  }, []);

  const publishPlaybackState = useCallback(
    async (isPlaying: boolean, positionSec: number) => {
      if (!user?.uid) return;
      await updateDoc(roomRef(), {
        isPlaying,
        playbackPositionSec: Math.max(0, positionSec),
        stateAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    },
    [user?.uid, roomRef],
  );

  const addFromUrl = useCallback(
    async (urlInput: string) => {
      if (!user?.uid) {
        throw new Error("Chưa đăng nhập");
      }
      const videoId = extractYoutubeVideoId(urlInput);
      if (!videoId) {
        throw new Error("Không nhận dạng được link YouTube.");
      }
      const pageUrl = canonicalYoutubeWatchUrl(videoId);
      const { title, thumbnailUrl } = await fetchYoutubeOEmbed(videoId);
      const authorName =
        user.displayName?.trim() || user.email?.trim() || "Thành viên";

      setActionBusy(true);
      try {
        const db = getFirestoreDb();
        const ref = doc(db, ...COMMUNITY_MUSIC_DOC);
        await runTransaction(db, async (transaction) => {
          const snap = await transaction.get(ref);
          const prev = snap.exists()
            ? parseMusicRoomState(snap.data() as Record<string, unknown>)
            : {
                queue: [] as MusicQueueItem[],
                currentIndex: 0,
                isPlaying: true,
                playbackPositionSec: 0,
                stateAtMillis: null,
              };

          const newItem: MusicQueueItem = {
            id: nanoid(12),
            videoId,
            title,
            thumbnailUrl,
            url: pageUrl,
            addedBy: user.uid,
            addedByName: authorName,
            addedAt: Timestamp.now(),
          };

          const queue = [...prev.queue, newItem];

          if (prev.queue.length === 0) {
            transaction.set(
              ref,
              {
                queue,
                currentIndex: 0,
                isPlaying: false,
                playbackPositionSec: 0,
                stateAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              },
              { merge: true },
            );
          } else {
            transaction.update(ref, {
              queue,
              updatedAt: serverTimestamp(),
            });
          }
        });
      } finally {
        setActionBusy(false);
      }
    },
    [user],
  );

  const goNext = useCallback(async (): Promise<boolean> => {
    if (!user?.uid) throw new Error("Chưa đăng nhập");
    setActionBusy(true);
    let updated = false;
    try {
      const db = getFirestoreDb();
      const ref = doc(db, ...COMMUNITY_MUSIC_DOC);
      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(ref);
        if (!snap.exists()) return;
        const prev = parseMusicRoomState(snap.data() as Record<string, unknown>);
        if (prev.queue.length === 0) return;
        updated = true;
        const nextIndex = (prev.currentIndex + 1) % prev.queue.length;
        transaction.update(ref, {
          currentIndex: nextIndex,
          isPlaying: true,
          playbackPositionSec: 0,
          stateAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });
    } finally {
      setActionBusy(false);
    }
    return updated;
  }, [user?.uid]);

  const selectQueueItem = useCallback(
    async (itemId: string) => {
      if (!user?.uid) throw new Error("Chưa đăng nhập");
      setActionBusy(true);
      try {
        const db = getFirestoreDb();
        const ref = doc(db, ...COMMUNITY_MUSIC_DOC);
        await runTransaction(db, async (transaction) => {
          const snap = await transaction.get(ref);
          if (!snap.exists()) return;
          const prev = parseMusicRoomState(snap.data() as Record<string, unknown>);
          const index = prev.queue.findIndex((q) => q.id === itemId);
          if (index < 0 || index === prev.currentIndex) return;
          transaction.update(ref, {
            currentIndex: index,
            isPlaying: true,
            playbackPositionSec: 0,
            stateAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        });
      } finally {
        setActionBusy(false);
      }
    },
    [user?.uid],
  );

  const removeQueueItem = useCallback(
    async (itemId: string) => {
      if (!user?.uid) throw new Error("Chưa đăng nhập");
      setActionBusy(true);
      try {
        const db = getFirestoreDb();
        const ref = doc(db, ...COMMUNITY_MUSIC_DOC);
        await runTransaction(db, async (transaction) => {
          const snap = await transaction.get(ref);
          if (!snap.exists()) return;
          const prev = parseMusicRoomState(snap.data() as Record<string, unknown>);
          const rm = prev.queue.findIndex((q) => q.id === itemId);
          if (rm < 0) return;
          const currentIdBefore = prev.queue[prev.currentIndex]?.id ?? null;
          const wasRemovedCurrent = currentIdBefore === itemId;
          const queue = prev.queue.filter((q) => q.id !== itemId);
          if (queue.length === 0) {
            transaction.update(ref, {
              queue,
              currentIndex: 0,
              isPlaying: false,
              playbackPositionSec: 0,
              stateAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
            return;
          }
          let currentIndex = 0;
          if (currentIdBefore) {
            const ni = queue.findIndex((q) => q.id === currentIdBefore);
            currentIndex =
              ni >= 0 ? ni : Math.min(prev.currentIndex, queue.length - 1);
          } else {
            currentIndex = Math.min(prev.currentIndex, queue.length - 1);
          }
          if (wasRemovedCurrent) {
            transaction.update(ref, {
              queue,
              currentIndex,
              isPlaying: prev.isPlaying,
              playbackPositionSec: 0,
              stateAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          } else {
            transaction.update(ref, {
              queue,
              currentIndex,
              updatedAt: serverTimestamp(),
            });
          }
        });
      } finally {
        setActionBusy(false);
      }
    },
    [user?.uid],
  );

  const reorderQueue = useCallback(
    async (fromIndex: number, toIndex: number) => {
      if (!user?.uid) throw new Error("Chưa đăng nhập");
      if (fromIndex === toIndex) return;
      setActionBusy(true);
      try {
        const db = getFirestoreDb();
        const ref = doc(db, ...COMMUNITY_MUSIC_DOC);
        await runTransaction(db, async (transaction) => {
          const snap = await transaction.get(ref);
          if (!snap.exists()) return;
          const prev = parseMusicRoomState(snap.data() as Record<string, unknown>);
          if (
            fromIndex < 0 ||
            toIndex < 0 ||
            fromIndex >= prev.queue.length ||
            toIndex >= prev.queue.length
          ) {
            return;
          }
          const currentId = prev.queue[prev.currentIndex]?.id ?? null;
          const queue = arrayMove(prev.queue, fromIndex, toIndex);
          let currentIndex = 0;
          if (queue.length > 0) {
            if (currentId) {
              const ni = queue.findIndex((q) => q.id === currentId);
              currentIndex = ni >= 0 ? ni : 0;
            } else {
              currentIndex = Math.min(prev.currentIndex, queue.length - 1);
            }
          }
          transaction.update(ref, {
            queue,
            currentIndex,
            updatedAt: serverTimestamp(),
          });
        });
      } finally {
        setActionBusy(false);
      }
    },
    [user?.uid],
  );

  return {
    state,
    loading,
    error,
    actionBusy,
    currentItem,
    addFromUrl,
    goNext,
    selectQueueItem,
    removeQueueItem,
    reorderQueue,
    publishPlaybackState,
  };
}
