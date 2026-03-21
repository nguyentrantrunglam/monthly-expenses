"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytes,
} from "firebase/storage";
import { getFirestoreDb, getFirebaseStorage } from "@/lib/firebase/client";
import { useAuthStore } from "@/lib/stores/authStore";
import { nanoid } from "nanoid";

/** Số tin mới nhất đồng bộ realtime. */
const CHAT_LIVE_LIMIT = 60;
/** Mỗi lần tải thêm tin cũ (getDocs + startAfter). */
const CHAT_OLDER_PAGE = 40;

export const FAMILY_CHAT_MAX_FILE_BYTES = 12 * 1024 * 1024;

export interface ChatAttachment {
  kind: "image" | "file";
  url: string;
  storagePath: string;
  name: string;
  mimeType: string;
  size: number;
}

export interface FamilyChatMessage {
  id: string;
  userId: string;
  authorName: string;
  text: string;
  attachment: ChatAttachment | null;
  createdAt: unknown;
}

function sanitizeFileName(name: string): string {
  return name
    .replace(/[^\w.\-()\s\u00C0-\u024F\u1E00-\u1EFF]/g, "_")
    .slice(0, 120);
}

function parseAttachment(raw: unknown): ChatAttachment | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.kind !== "image" && o.kind !== "file") return null;
  const url = typeof o.url === "string" ? o.url : "";
  const storagePath = typeof o.storagePath === "string" ? o.storagePath : "";
  const name = typeof o.name === "string" ? o.name : "file";
  const mimeType =
    typeof o.mimeType === "string" ? o.mimeType : "application/octet-stream";
  const size = typeof o.size === "number" && o.size >= 0 ? o.size : 0;
  if (!url || !storagePath) return null;
  return { kind: o.kind, url, storagePath, name, mimeType, size };
}

function docToMessage(d: QueryDocumentSnapshot): FamilyChatMessage {
  const data = d.data();
  return {
    id: d.id,
    userId: data.userId ?? "",
    authorName: data.authorName ?? "",
    text: typeof data.text === "string" ? data.text : "",
    attachment: parseAttachment(data.attachment),
    createdAt: data.createdAt,
  };
}

function createdAtToMs(createdAt: unknown): number {
  if (createdAt == null) return 0;
  if (
    typeof createdAt === "object" &&
    createdAt !== null &&
    typeof (createdAt as { toDate?: () => Date }).toDate === "function"
  ) {
    return (createdAt as { toDate: () => Date }).toDate().getTime();
  }
  if (createdAt instanceof Date) return createdAt.getTime();
  return 0;
}

function mergeMessages(
  older: FamilyChatMessage[],
  live: FamilyChatMessage[]
): FamilyChatMessage[] {
  const map = new Map<string, FamilyChatMessage>();
  for (const m of older) map.set(m.id, m);
  for (const m of live) map.set(m.id, m);
  return Array.from(map.values()).sort(
    (a, b) => createdAtToMs(a.createdAt) - createdAtToMs(b.createdAt)
  );
}

/**
 * Firestore: families/{familyId}/chatMessages/{messageId}
 * Storage: families/{familyId}/chat/{messageId}/{random}_{fileName}
 *
 * Tin mới: onSnapshot (CHAT_LIVE_LIMIT tin mới nhất).
 * Tin cũ: loadOlder() — getDocs + startAfter.
 *
 * Cần quy tắc Firestore/Storage — mẫu: firebase-rules-family-chat.txt (thư mục gốc repo).
 */
export function useFamilyChat() {
  const user = useAuthStore((s) => s.user);
  const [liveMessages, setLiveMessages] = useState<FamilyChatMessage[]>([]);
  const [olderMessages, setOlderMessages] = useState<FamilyChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMoreOlder, setHasMoreOlder] = useState(true);
  const [sending, setSending] = useState(false);

  const oldestLiveDocRef = useRef<QueryDocumentSnapshot | null>(null);
  const olderPageCursorRef = useRef<QueryDocumentSnapshot | null>(null);
  /** getDocs trang cũ đã trả về hết (rỗng hoặc ít hơn CHAT_OLDER_PAGE). */
  const olderExhaustedRef = useRef(false);

  useEffect(() => {
    if (!user?.familyId) {
      setLiveMessages([]);
      setOlderMessages([]);
      setLoading(false);
      setHasMoreOlder(true);
      oldestLiveDocRef.current = null;
      olderPageCursorRef.current = null;
      olderExhaustedRef.current = false;
      return;
    }
    setOlderMessages([]);
    olderPageCursorRef.current = null;
    olderExhaustedRef.current = false;
    setHasMoreOlder(true);

    const db = getFirestoreDb();
    const col = collection(db, "families", user.familyId, "chatMessages");
    const q = query(col, orderBy("createdAt", "desc"), limit(CHAT_LIVE_LIMIT));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: FamilyChatMessage[] = [];
        snap.forEach((d) => list.push(docToMessage(d)));
        list.reverse();
        setLiveMessages(list);
        oldestLiveDocRef.current =
          snap.docs.length > 0 ? snap.docs[snap.docs.length - 1]! : null;
        if (snap.docs.length < CHAT_LIVE_LIMIT) {
          setHasMoreOlder(false);
          olderExhaustedRef.current = false;
        } else {
          setHasMoreOlder(!olderExhaustedRef.current);
        }
        setLoading(false);
      },
      (e) => {
        console.error(e);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [user?.familyId]);

  const messages = useMemo(
    () => mergeMessages(olderMessages, liveMessages),
    [olderMessages, liveMessages]
  );

  const loadOlder = useCallback(async () => {
    if (!user?.familyId || loadingOlder) return;
    const db = getFirestoreDb();
    const col = collection(db, "families", user.familyId, "chatMessages");
    const cursor =
      olderPageCursorRef.current ?? oldestLiveDocRef.current;
    if (!cursor) {
      setHasMoreOlder(false);
      return;
    }

    setLoadingOlder(true);
    try {
      const q = query(
        col,
        orderBy("createdAt", "desc"),
        startAfter(cursor),
        limit(CHAT_OLDER_PAGE)
      );
      const snap = await getDocs(q);
      if (snap.empty) {
        setHasMoreOlder(false);
        olderExhaustedRef.current = true;
        return;
      }
      const batch: FamilyChatMessage[] = [];
      snap.forEach((d) => batch.push(docToMessage(d)));
      batch.reverse();
      setOlderMessages((prev) => [...batch, ...prev]);
      olderPageCursorRef.current = snap.docs[snap.docs.length - 1]!;
      if (snap.docs.length < CHAT_OLDER_PAGE) {
        setHasMoreOlder(false);
        olderExhaustedRef.current = true;
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingOlder(false);
    }
  }, [user?.familyId, loadingOlder]);

  const sendMessage = useCallback(
    async (params: { text: string; file?: File | null }) => {
      if (!user?.familyId || !user.uid) throw new Error("Chưa đăng nhập");
      const trimmed = params.text.trim();
      const file = params.file ?? null;
      if (!trimmed && !file) return;

      if (file && file.size > FAMILY_CHAT_MAX_FILE_BYTES) {
        throw new Error("Tệp quá lớn (tối đa 12 MB)");
      }

      setSending(true);
      try {
        const db = getFirestoreDb();
        const col = collection(db, "families", user.familyId, "chatMessages");
        const msgRef = doc(col);
        const msgId = msgRef.id;

        let attachment: ChatAttachment | null = null;
        if (file) {
          const storage = getFirebaseStorage();
          const safeName = sanitizeFileName(file.name) || "file";
          const storagePath = `families/${user.familyId}/chat/${msgId}/${nanoid(6)}_${safeName}`;
          const storageRef = ref(storage, storagePath);
          await uploadBytes(storageRef, file, {
            contentType: file.type || "application/octet-stream",
          });
          const url = await getDownloadURL(storageRef);
          const isImage = (file.type || "").startsWith("image/");
          attachment = {
            kind: isImage ? "image" : "file",
            url,
            storagePath,
            name: file.name,
            mimeType: file.type || "application/octet-stream",
            size: file.size,
          };
        }

        await setDoc(msgRef, {
          userId: user.uid,
          authorName:
            user.displayName?.trim() || user.email?.trim() || "Thành viên",
          text: trimmed,
          attachment,
          createdAt: serverTimestamp(),
        });
      } finally {
        setSending(false);
      }
    },
    [user]
  );

  const deleteMessage = useCallback(
    async (m: FamilyChatMessage) => {
      if (!user?.familyId || user.uid !== m.userId) return;
      const db = getFirestoreDb();
      await deleteDoc(
        doc(db, "families", user.familyId, "chatMessages", m.id)
      );
      if (m.attachment?.storagePath) {
        try {
          await deleteObject(ref(getFirebaseStorage(), m.attachment.storagePath));
        } catch {
          /* có thể đã xóa hoặc không có quyền */
        }
      }
      setOlderMessages((prev) => prev.filter((x) => x.id !== m.id));
      setLiveMessages((prev) => prev.filter((x) => x.id !== m.id));
    },
    [user?.familyId, user?.uid]
  );

  return {
    messages,
    loading,
    sending,
    sendMessage,
    deleteMessage,
    loadOlder,
    loadingOlder,
    hasMoreOlder,
  };
}
