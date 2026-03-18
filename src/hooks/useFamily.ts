"use client";

import { useEffect, useState } from "react";
import {
  collection,
  doc,
  DocumentData,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { getFirestoreDb } from "@/lib/firebase/client";
import { useAuthStore } from "@/lib/stores/authStore";
import { nanoid } from "nanoid";

export type FamilyRole = "owner" | "member";

export interface FamilyMember {
  role: FamilyRole;
  name: string | null;
  avatar?: string | null;
  joinedAt: Date | null;
}

export interface Family {
  id: string;
  name: string;
  cycleDay: number;
  createdBy: string;
  members: Record<string, FamilyMember>;
  sharedNote?: string;
}

export function useFamily() {
  const user = useAuthStore((s) => s.user);
  const [family, setFamily] = useState<Family | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.familyId) {
      setFamily(null);
      return;
    }
    const db = getFirestoreDb();
    const ref = doc(db, "families", user.familyId);
    setLoading(true);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setFamily(null);
        } else {
          const data = snap.data() as DocumentData;
          setFamily({
            id: snap.id,
            name: data.name,
            cycleDay: data.cycleDay,
            createdBy: data.createdBy,
            members: data.members ?? {},
            sharedNote: data.sharedNote ?? "",
          });
        }
        setLoading(false);
      },
      (e) => {
        console.error(e);
        setError("Không tải được thông tin gia đình.");
        setLoading(false);
      }
    );
    return () => unsub();
  }, [user?.familyId]);

  const createFamily = async (name: string, cycleDay = 1) => {
    if (!user) throw new Error("Chưa đăng nhập");
    const db = getFirestoreDb();
    const familyId = nanoid(10);
    const familyRef = doc(db, "families", familyId);
    await setDoc(familyRef, {
      name,
      cycleDay,
      createdBy: user.uid,
      createdAt: serverTimestamp(),
      members: {
        [user.uid]: {
          role: "owner",
          name: user.displayName ?? user.email,
          avatar: user.photoURL ?? null,
          joinedAt: serverTimestamp(),
        },
      },
      externalContributors: [],
    });

    await setDoc(
      doc(db, "users", user.uid),
      {
        familyId,
      },
      { merge: true }
    );

    // Cập nhật ngay local auth store để UI phản ứng mà không cần reload
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    Promise.resolve().then(() => {
      const current = useAuthStore.getState().user;
      if (current?.uid === user.uid) {
        useAuthStore.setState({
          user: { ...current, familyId },
        });
      }
    });

    return familyId;
  };

  const createInvite = async (email: string) => {
    if (!user || !user.familyId) throw new Error("Chưa có gia đình");
    const db = getFirestoreDb();
    const token = nanoid(20);
    const ref = doc(db, "families", user.familyId, "invites", token);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await setDoc(ref, {
      createdBy: user.uid,
      createdAt: serverTimestamp(),
      expiresAt,
      email,
      used: false,
    });
    return { token, familyId: user.familyId };
  };

  const deleteFamily = async () => {
    if (!user || !user.familyId || !family) throw new Error("Không có gia đình");
    if (family.createdBy !== user.uid) throw new Error("Chỉ owner mới xóa được");

    const db = getFirestoreDb();
    const familyId = user.familyId;
    const batch = writeBatch(db);

    // Clear familyId for all members
    for (const uid of Object.keys(family.members)) {
      batch.set(doc(db, "users", uid), { familyId: null }, { merge: true });
    }

    // Delete subcollections: sessions, fixedItems, invites
    const subcols = ["sessions", "fixedItems", "invites"];
    for (const sub of subcols) {
      const snap = await getDocs(collection(db, "families", familyId, sub));
      snap.forEach((d) => batch.delete(d.ref));

      // For sessions, also delete memberItems subcollection
      if (sub === "sessions") {
        for (const sessionDoc of snap.docs) {
          const miSnap = await getDocs(
            collection(db, "families", familyId, "sessions", sessionDoc.id, "memberItems")
          );
          miSnap.forEach((d) => batch.delete(d.ref));
        }
      }
    }

    // Delete family document
    batch.delete(doc(db, "families", familyId));

    await batch.commit();
  };

  const updateSharedNote = async (note: string) => {
    if (!user?.familyId) throw new Error("Chưa có gia đình");
    const db = getFirestoreDb();
    const ref = doc(db, "families", user.familyId);
    await updateDoc(ref, { sharedNote: note });
  };

  const removeMember = async (memberId: string) => {
    if (!user || !user.familyId || !family) throw new Error("Không có gia đình");
    if (family.createdBy !== user.uid) throw new Error("Chỉ owner mới xóa thành viên");
    if (memberId === family.createdBy) throw new Error("Không thể xóa owner");

    const db = getFirestoreDb();
    const batch = writeBatch(db);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { [memberId]: _removed, ...restMembers } = family.members;
    batch.update(doc(db, "families", user.familyId), { members: restMembers });
    batch.set(doc(db, "users", memberId), { familyId: null }, { merge: true });

    await batch.commit();
  };

  return {
    family,
    loading,
    error,
    createFamily,
    createInvite,
    deleteFamily,
    removeMember,
    updateSharedNote,
  };
}

