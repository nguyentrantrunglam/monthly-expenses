"use client";

import { useEffect, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { getFirestoreDb } from "@/lib/firebase/client";
import { useAuthStore } from "@/lib/stores/authStore";

export interface SharedChecklistItem {
  id: string;
  title: string;
  done: boolean;
  dueDate: string | null;
  createdAt: unknown;
  createdBy?: string;
}

export function useSharedChecklist() {
  const user = useAuthStore((s) => s.user);
  const [items, setItems] = useState<SharedChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.familyId) {
      setItems([]);
      setLoading(false);
      return;
    }
    const db = getFirestoreDb();
    const col = collection(db, "families", user.familyId, "sharedChecklist");
    const q = query(col, orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const list: SharedChecklistItem[] = [];
      snap.forEach((d) => {
        const data = d.data();
        list.push({
          id: d.id,
          title: data.title ?? "",
          done: data.done ?? false,
          dueDate: data.dueDate ?? null,
          createdAt: data.createdAt,
          createdBy: data.createdBy,
        });
      });
      setItems(list);
      setLoading(false);
    });
    return () => unsub();
  }, [user?.familyId]);

  const addItem = async (title: string, dueDate?: string) => {
    if (!user?.familyId) throw new Error("Chưa có gia đình");
    const db = getFirestoreDb();
    const col = collection(db, "families", user.familyId, "sharedChecklist");
    await addDoc(col, {
      title: title.trim(),
      done: false,
      dueDate: dueDate || null,
      createdAt: serverTimestamp(),
      createdBy: user.uid,
    });
  };

  const toggleItem = async (id: string, done: boolean) => {
    if (!user?.familyId) return;
    const db = getFirestoreDb();
    const ref = doc(db, "families", user.familyId, "sharedChecklist", id);
    await updateDoc(ref, { done });
  };

  const updateItem = async (id: string, patch: { title?: string; dueDate?: string | null }) => {
    if (!user?.familyId) return;
    const db = getFirestoreDb();
    const ref = doc(db, "families", user.familyId, "sharedChecklist", id);
    await updateDoc(ref, patch);
  };

  const deleteItem = async (id: string) => {
    if (!user?.familyId) return;
    const db = getFirestoreDb();
    const ref = doc(db, "families", user.familyId, "sharedChecklist", id);
    await deleteDoc(ref);
  };

  return {
    items,
    loading,
    addItem,
    toggleItem,
    updateItem,
    deleteItem,
  };
}
