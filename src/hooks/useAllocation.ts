"use client";

import { useEffect, useState } from "react";
import {
  doc,
  onSnapshot,
  setDoc,
  serverTimestamp,
  getDoc,
  updateDoc,
} from "firebase/firestore";
import { getFirestoreDb } from "@/lib/firebase/client";
import { useAuthStore } from "@/lib/stores/authStore";

export interface AllocationItem {
  type: "personal" | "shared_pool";
  userId: string | null;
  label: string;
  amount: number;
}

export interface Allocation {
  items: AllocationItem[];
  savingsAmount: number;
  confirmedAt: any;
  confirmedBy: string | null;
}

export function useAllocation(sessionId: string) {
  const user = useAuthStore((s) => s.user);
  const [allocation, setAllocation] = useState<Allocation | null>(null);
  const [remainingBudget, setRemainingBudget] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.familyId || !sessionId) return;
    const db = getFirestoreDb();

    const sessRef = doc(db, "families", user.familyId, "sessions", sessionId);
    const unsub1 = onSnapshot(sessRef, (snap) => {
      if (snap.exists()) {
        setRemainingBudget(snap.data().remainingBudget ?? 0);
      }
    });

    const allocRef = doc(
      db,
      "families",
      user.familyId,
      "sessions",
      sessionId,
      "allocation",
      "main"
    );
    const unsub2 = onSnapshot(allocRef, (snap) => {
      if (!snap.exists()) {
        setAllocation(null);
      } else {
        const data = snap.data() as any;
        setAllocation({
          items: data.items ?? [],
          savingsAmount: data.savingsAmount ?? 0,
          confirmedAt: data.confirmedAt,
          confirmedBy: data.confirmedBy,
        });
      }
      setLoading(false);
    });

    return () => {
      unsub1();
      unsub2();
    };
  }, [user?.familyId, sessionId]);

  const saveAllocation = async (items: AllocationItem[]) => {
    if (!user?.familyId) return;
    const db = getFirestoreDb();
    const allocRef = doc(
      db,
      "families",
      user.familyId,
      "sessions",
      sessionId,
      "allocation",
      "main"
    );
    const totalAllocated = items.reduce((s, i) => s + i.amount, 0);
    const savingsAmount = Math.max(0, remainingBudget - totalAllocated);

    await setDoc(allocRef, {
      items,
      savingsAmount,
      confirmedAt: serverTimestamp(),
      confirmedBy: user.uid,
    });

    const savingsRef = doc(db, "families", user.familyId, "savingsFund", "main");
    const savingsSnap = await getDoc(savingsRef);
    const sessRef = doc(db, "families", user.familyId, "sessions", sessionId);
    const sessSnap = await getDoc(sessRef);
    const month = sessSnap.exists() ? sessSnap.data().month : sessionId;

    if (savingsSnap.exists()) {
      const existing = savingsSnap.data();
      const deposits: any[] = existing.deposits ?? [];
      const idx = deposits.findIndex((d: any) => d.sessionId === sessionId);
      if (idx >= 0) {
        deposits[idx] = {
          ...deposits[idx],
          amount: savingsAmount,
          createdAt: new Date(),
        };
      } else {
        deposits.push({
          month,
          amount: savingsAmount,
          sessionId,
          createdAt: new Date(),
        });
      }
      const balance = deposits.reduce((s: number, d: any) => s + d.amount, 0);
      await updateDoc(savingsRef, { balance, deposits });
    } else {
      await setDoc(savingsRef, {
        balance: savingsAmount,
        deposits: [
          { month, amount: savingsAmount, sessionId, createdAt: new Date() },
        ],
      });
    }
  };

  return { allocation, remainingBudget, loading, saveAllocation };
}
