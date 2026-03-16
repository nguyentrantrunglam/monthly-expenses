"use client";

import { useEffect, useState } from "react";
import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { getFirestoreDb } from "@/lib/firebase/client";
import { useAuthStore } from "@/lib/stores/authStore";

export interface Reconciliation {
  id: string;
  actualBalance: number;
  calculatedBalance: number;
  difference: number;
  note: string;
  createdAt: { toDate?: () => Date } | string;
  createdBy: string;
}

export function useReconcile() {
  const user = useAuthStore((s) => s.user);
  const [records, setRecords] = useState<Reconciliation[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user?.familyId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRecords([]);
      return;
    }
    const db = getFirestoreDb();
    const col = collection(db, "families", user.familyId, "reconciliations");
    const q = query(col, orderBy("createdAt", "desc"));
    setLoading(true);
    const unsub = onSnapshot(q, (snap) => {
      const list: Reconciliation[] = [];
      snap.forEach((d) => {
        const data = d.data();
        list.push({
          id: d.id,
          actualBalance: data.actualBalance,
          calculatedBalance: data.calculatedBalance,
          difference: data.difference,
          note: data.note ?? "",
          createdAt: data.createdAt,
          createdBy: data.createdBy,
        });
      });
      setRecords(list);
      setLoading(false);
    });
    return () => unsub();
  }, [user?.familyId]);

  const addReconciliation = async (input: {
    actualBalance: number;
    calculatedBalance: number;
    note: string;
  }) => {
    if (!user?.familyId || !user.uid) throw new Error("Chưa đăng nhập");
    const db = getFirestoreDb();
    const col = collection(db, "families", user.familyId, "reconciliations");
    await addDoc(col, {
      actualBalance: input.actualBalance,
      calculatedBalance: input.calculatedBalance,
      difference: input.actualBalance - input.calculatedBalance,
      note: input.note,
      createdAt: new Date(),
      createdBy: user.uid,
    });
  };

  return { records, loading, addReconciliation };
}
