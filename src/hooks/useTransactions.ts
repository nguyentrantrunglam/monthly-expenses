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
  updateDoc,
  where,
} from "firebase/firestore";
import { getFirestoreDb } from "@/lib/firebase/client";
import { useAuthStore } from "@/lib/stores/authStore";

export interface Transaction {
  id: string;
  title?: string;
  amount: number;
  type: "income" | "expense";
  category: string;
  spendingType: "personal" | "shared_pool";
  allocationUserId: string | null;
  userId: string;
  note: string;
  date: string;
  createdAt: any;
}

export function useTransactions(filters?: {
  userId?: string;
  month?: string;
  category?: string;
}) {
  const user = useAuthStore((s) => s.user);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user?.familyId) {
      setTransactions([]);
      return;
    }
    const db = getFirestoreDb();
    const col = collection(db, "families", user.familyId, "transactions");
    const q = query(col, orderBy("date", "desc"));
    setLoading(true);
    const unsub = onSnapshot(q, (snap) => {
      let list: Transaction[] = [];
      snap.forEach((d) => {
        const data = d.data() as any;
        list.push({
          id: d.id,
          title: data.title ?? "",
          amount: data.amount,
          type: data.type,
          category: data.category ?? "",
          spendingType: data.spendingType ?? "personal",
          allocationUserId: data.allocationUserId ?? null,
          userId: data.userId,
          note: data.note ?? "",
          date: data.date,
          createdAt: data.createdAt,
        });
      });

      if (user.role !== "owner") {
        list = list.filter(
          (t) => t.userId === user.uid || t.spendingType === "shared_pool"
        );
      }

      if (filters?.userId) {
        list = list.filter((t) => t.userId === filters.userId);
      }
      if (filters?.month) {
        list = list.filter((t) => t.date.startsWith(filters.month!));
      }
      if (filters?.category) {
        list = list.filter((t) => t.category === filters.category);
      }

      setTransactions(list);
      setLoading(false);
    });
    return () => unsub();
  }, [user?.familyId, user?.uid, user?.role, filters?.userId, filters?.month, filters?.category]);

  const addTransaction = async (input: {
    title?: string;
    amount: number;
    type: "income" | "expense";
    category: string;
    spendingType: "personal" | "shared_pool";
    note: string;
    date: string;
  }) => {
    if (!user?.familyId || !user.uid) throw new Error("Chưa đăng nhập");
    const db = getFirestoreDb();
    const col = collection(db, "families", user.familyId, "transactions");
    await addDoc(col, {
      ...input,
      allocationUserId:
        input.spendingType === "personal" ? user.uid : null,
      userId: user.uid,
      createdAt: new Date(),
    });
  };

  const updateTransaction = async (
    id: string,
    patch: Partial<Omit<Transaction, "id">>
  ) => {
    if (!user?.familyId) return;
    const db = getFirestoreDb();
    const ref = doc(db, "families", user.familyId, "transactions", id);
    await updateDoc(ref, patch);
  };

  const deleteTransaction = async (id: string) => {
    if (!user?.familyId) return;
    const db = getFirestoreDb();
    const ref = doc(db, "families", user.familyId, "transactions", id);
    await deleteDoc(ref);
  };

  return {
    transactions,
    loading,
    addTransaction,
    updateTransaction,
    deleteTransaction,
  };
}
