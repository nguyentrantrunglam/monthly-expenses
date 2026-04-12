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
  createdAt: unknown;
}

function createdAtToMs(v: unknown): number {
  if (v == null) return 0;
  if (
    typeof v === "object" &&
    v !== null &&
    typeof (v as { toMillis?: () => number }).toMillis === "function"
  ) {
    return (v as { toMillis: () => number }).toMillis();
  }
  if (v instanceof Date) return v.getTime();
  return 0;
}

/** Mốc thời gian để sắp xếp trong cùng một ngày: ISO datetime trên `date` nếu có, không thì `createdAt`. */
function transactionInstantMs(t: Transaction): number {
  const d = (t.date ?? "").trim();
  if (d.length > 10 && (d.includes("T") || d.includes(" "))) {
    const ms = new Date(d).getTime();
    if (!Number.isNaN(ms)) return ms;
  }
  return createdAtToMs(t.createdAt);
}

function sortTransactionsByDateAndTime(a: Transaction, b: Transaction): number {
  const dayA = (a.date ?? "").slice(0, 10);
  const dayB = (b.date ?? "").slice(0, 10);
  if (dayA !== dayB) return dayB.localeCompare(dayA);
  return transactionInstantMs(a) - transactionInstantMs(b);
}

export function useTransactions(filters?: {
  userId?: string;
  month?: string;
  category?: string;
  /** Dashboard: gom theo từng thành viên — dùng toàn bộ giao dịch trong gia đình. */
  allMembers?: boolean;
}) {
  const user = useAuthStore((s) => s.user);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user?.familyId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
        const data = d.data();
        list.push({
          id: d.id,
          title: data.title ?? "",
          amount: data.amount,
          type: (data.type === "income" ? "income" : "expense") as
            | "income"
            | "expense",
          category: data.category ?? "",
          spendingType: data.spendingType ?? "personal",
          allocationUserId: data.allocationUserId ?? null,
          userId: data.userId,
          note: data.note ?? "",
          date: data.date,
          createdAt: data.createdAt,
        });
      });

      if (!filters?.allMembers) {
        // Mọi người (kể cả owner): chỉ thấy giao dịch của mình + mọi giao dịch quỹ chung.
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

      list.sort(sortTransactionsByDateAndTime);

      setTransactions(list);
      setLoading(false);
    });
    return () => unsub();
  }, [
    user?.familyId,
    user?.uid,
    filters?.userId,
    filters?.month,
    filters?.category,
    filters?.allMembers,
  ]);

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
