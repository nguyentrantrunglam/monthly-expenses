"use client";

import { useEffect, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  DocumentData,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { getFirestoreDb } from "@/lib/firebase/client";
import { useAuthStore } from "@/lib/stores/authStore";
import { createNotification } from "@/lib/notifications";

export interface IncomeItem {
  label: string;
  amount: number;
  userId: string | null;
  contributorId: string | null;
}

export interface SharedExpense {
  title: string;
  amount: number;
}

export interface Session {
  id: string;
  month: string;
  status: "open" | "locked";
  incomeItems: IncomeItem[];
  sharedExpenses: SharedExpense[];
  memberStatus: Record<string, "pending" | "done">;
  totalIncome: number;
  totalExpense: number;
  remainingBudget: number;
  createdAt: unknown;
  lockedAt: unknown;
}

export interface MemberSessionItem {
  fixedItemId: string;
  title: string;
  amount: number;
  action: "include" | "skip";
  column: "personal" | "income" | "expense";
  type?: "income" | "expense";
  categoryName?: string | null;
  note?: string;
}

export interface MemberItems {
  status: "pending" | "done";
  confirmedAt: unknown;
  items: MemberSessionItem[];
}

export function useSessions() {
  const user = useAuthStore((s) => s.user);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user?.familyId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSessions([]);
      return;
    }
    const db = getFirestoreDb();
    const col = collection(db, "families", user.familyId, "sessions");
    const q = query(col, orderBy("createdAt", "desc"));
    setLoading(true);
    const unsub = onSnapshot(q, (snap) => {
      const list: Session[] = [];
      snap.forEach((d) => {
        const data = d.data();
        list.push({
          id: d.id,
          month: data.month,
          status: data.status,
          incomeItems: data.incomeItems ?? [],
          sharedExpenses: data.sharedExpenses ?? [],
          memberStatus: data.memberStatus ?? {},
          totalIncome: data.totalIncome ?? 0,
          totalExpense: data.totalExpense ?? 0,
          remainingBudget: data.remainingBudget ?? 0,
          createdAt: data.createdAt,
          lockedAt: data.lockedAt,
        });
      });
      setSessions(list);
      setLoading(false);
    });
    return () => unsub();
  }, [user?.familyId]);

  const createSession = async (input: {
    month: string;
    incomeItems: IncomeItem[];
    sharedExpenses: SharedExpense[];
    memberIds: string[];
  }) => {
    if (!user?.familyId) throw new Error("Chưa có gia đình");
    const db = getFirestoreDb();
    const col = collection(db, "families", user.familyId, "sessions");

    const existing = await getDocs(
      query(col, where("month", "==", input.month))
    );
    if (!existing.empty) throw new Error("Tháng này đã có session.");

    const totalIncome = input.incomeItems.reduce((s, i) => s + i.amount, 0);
    const totalExpense = input.sharedExpenses.reduce(
      (s, i) => s + i.amount,
      0
    );

    const memberStatus: Record<string, "pending"> = {};
    for (const uid of input.memberIds) {
      memberStatus[uid] = "pending";
    }

    const ref = await addDoc(col, {
      month: input.month,
      status: "open",
      incomeItems: input.incomeItems,
      sharedExpenses: input.sharedExpenses,
      memberStatus,
      totalIncome,
      totalExpense,
      remainingBudget: totalIncome - totalExpense,
      createdAt: serverTimestamp(),
      lockedAt: null,
    });

    await createNotification(user.familyId, {
      type: "session",
      createdBy: user.uid,
      message: `Chủ gia đình đã tạo session tháng ${input.month}`,
      link: `/session/${ref.id}`,
      metadata: { sessionId: ref.id, month: input.month },
    });

    return ref.id;
  };

  const lockSession = async (sessionId: string) => {
    if (!user?.familyId) return;
    const db = getFirestoreDb();
    const ref = doc(db, "families", user.familyId, "sessions", sessionId);
    await updateDoc(ref, {
      status: "locked",
      lockedAt: serverTimestamp(),
    });
  };

  const unlockSession = async (
    sessionId: string,
    memberIds: string[]
  ) => {
    if (!user?.familyId) return;
    const db = getFirestoreDb();
    const ref = doc(db, "families", user.familyId, "sessions", sessionId);
    const resetStatus: Record<string, "pending"> = {};
    for (const uid of memberIds) {
      resetStatus[uid] = "pending";
    }
    await updateDoc(ref, {
      status: "open",
      lockedAt: null,
      memberStatus: resetStatus,
    });
  };

  const deleteSession = async (sessionId: string) => {
    if (!user?.familyId) throw new Error("Chưa có gia đình");
    const db = getFirestoreDb();
    const batch = writeBatch(db);

    const miSnap = await getDocs(
      collection(db, "families", user.familyId, "sessions", sessionId, "memberItems")
    );
    miSnap.forEach((d) => batch.delete(d.ref));

    batch.delete(doc(db, "families", user.familyId, "sessions", sessionId));
    await batch.commit();
  };

  return { sessions, loading, createSession, lockSession, unlockSession, deleteSession };
}

export function useSessionDetail(sessionId: string) {
  const user = useAuthStore((s) => s.user);
  const [session, setSession] = useState<Session | null>(null);
  const [memberItems, setMemberItems] = useState<MemberItems | null>(null);
  const [allMemberItems, setAllMemberItems] = useState<
    Record<string, MemberItems>
  >({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.familyId || !sessionId) return;
    const db = getFirestoreDb();
    const ref = doc(db, "families", user.familyId, "sessions", sessionId);
    const unsub = onSnapshot(ref, (snap) => {
      if (!snap.exists()) {
        setSession(null);
        setLoading(false);
        return;
      }
      const data = snap.data() as DocumentData;
      setSession({
        id: snap.id,
        month: data.month,
        status: data.status,
        incomeItems: data.incomeItems ?? [],
        sharedExpenses: data.sharedExpenses ?? [],
        memberStatus: data.memberStatus ?? {},
        totalIncome: data.totalIncome ?? 0,
        totalExpense: data.totalExpense ?? 0,
        remainingBudget: data.remainingBudget ?? 0,
        createdAt: data.createdAt,
        lockedAt: data.lockedAt,
      });
      setLoading(false);
    });
    return () => unsub();
  }, [user?.familyId, sessionId]);

  // Subscribe to current user's memberItems
  useEffect(() => {
    if (!user?.familyId || !user.uid || !sessionId) return;
    const db = getFirestoreDb();
    const ref = doc(
      db,
      "families",
      user.familyId,
      "sessions",
      sessionId,
      "memberItems",
      user.uid
    );
    const unsub = onSnapshot(ref, (snap) => {
      if (!snap.exists()) {
        setMemberItems(null);
      } else {
        const data = snap.data() as DocumentData;
        setMemberItems({
          status: data.status ?? "pending",
          confirmedAt: data.confirmedAt,
          items: data.items ?? [],
        });
      }
    });
    return () => unsub();
  }, [user?.familyId, user?.uid, sessionId]);

  // Subscribe to ALL members' items (for owner realtime view)
  useEffect(() => {
    if (!user?.familyId || !sessionId) return;
    const db = getFirestoreDb();
    const col = collection(
      db,
      "families",
      user.familyId,
      "sessions",
      sessionId,
      "memberItems"
    );
    const unsub = onSnapshot(col, (snap) => {
      const map: Record<string, MemberItems> = {};
      snap.forEach((d) => {
        const data = d.data();
        map[d.id] = {
          status: data.status ?? "pending",
          confirmedAt: data.confirmedAt,
          items: data.items ?? [],
        };
      });
      setAllMemberItems(map);
    });
    return () => unsub();
  }, [user?.familyId, sessionId]);

  const saveMemberItems = async (items: MemberSessionItem[]) => {
    if (!user?.familyId || !user.uid) return;
    const db = getFirestoreDb();
    const ref = doc(
      db,
      "families",
      user.familyId,
      "sessions",
      sessionId,
      "memberItems",
      user.uid
    );
    await setDoc(
      ref,
      { status: "pending", confirmedAt: null, items },
      { merge: true }
    );
  };

  const confirmMemberItems = async (items: MemberSessionItem[]) => {
    if (!user?.familyId || !user.uid) return;
    const db = getFirestoreDb();

    const miRef = doc(
      db,
      "families",
      user.familyId,
      "sessions",
      sessionId,
      "memberItems",
      user.uid
    );
    await setDoc(miRef, {
      status: "done",
      confirmedAt: serverTimestamp(),
      items,
    });

    const sessRef = doc(
      db,
      "families",
      user.familyId,
      "sessions",
      sessionId
    );
    await updateDoc(sessRef, {
      [`memberStatus.${user.uid}`]: "done",
    });

    await recalcSessionTotals(sessionId);
  };

  const recalcSessionTotals = async (sid: string) => {
    if (!user?.familyId) return;
    const db = getFirestoreDb();
    const sessRef = doc(db, "families", user.familyId, "sessions", sid);
    const sessSnap = await getDoc(sessRef);
    if (!sessSnap.exists()) return;
    const sessData = sessSnap.data() as DocumentData;

    const miCol = collection(
      db,
      "families",
      user.familyId,
      "sessions",
      sid,
      "memberItems"
    );
    const miSnap = await getDocs(miCol);

    let memberExpenseTotal = 0;
    let memberIncomeTotal = 0;
    miSnap.forEach((d) => {
      const data = d.data();
      (data.items ?? []).forEach((item: MemberSessionItem) => {
        if (item.column === "expense") {
          memberExpenseTotal += item.amount;
        } else if (item.column === "income") {
          memberIncomeTotal += item.amount;
        }
      });
    });

    const sharedExpenseTotal = (sessData.sharedExpenses ?? []).reduce(
      (s: number, e: SharedExpense) => s + e.amount,
      0
    );
    const sessionIncomeTotal = (sessData.incomeItems ?? []).reduce(
      (s: number, i: IncomeItem) => s + i.amount,
      0
    );

    const totalIncome = sessionIncomeTotal + memberIncomeTotal;
    const totalExpense = sharedExpenseTotal + memberExpenseTotal;

    await updateDoc(sessRef, {
      totalIncome,
      totalExpense,
      remainingBudget: totalIncome - totalExpense,
    });
  };

  return {
    session,
    memberItems,
    allMemberItems,
    loading,
    saveMemberItems,
    confirmMemberItems,
  };
}
