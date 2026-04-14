"use client";

import { useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { getFirebaseAuth, getFirestoreDb } from "@/lib/firebase/client";
import { useAuthStore, type AuthUser } from "@/lib/stores/authStore";

export function useAuthListener() {
  const setUser = useAuthStore((s) => s.setUser);
  const setLoading = useAuthStore((s) => s.setLoading);

  useEffect(() => {
    const auth = getFirebaseAuth();
    const db = getFirestoreDb();

    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const userRef = doc(db, "users", firebaseUser.uid);
        const snap = await getDoc(userRef);
        const data = snap.data() as
          | {
              familyId?: string | null;
              displayName?: string | null;
              role?: "owner" | "member";
              admin?: boolean;
            }
          | undefined;

        const mapped: AuthUser = {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: data?.displayName ?? firebaseUser.displayName,
          photoURL: firebaseUser.photoURL,
          familyId: data?.familyId ?? null,
          role: data?.role ?? null,
          isAdmin: data?.admin === true,
        };

        setUser(mapped);
      } catch (e) {
        // Firestore denied (rules) or offline: still expose Auth user so UI không kẹt "chưa đăng nhập".
        console.error("useAuthListener: không đọc được users doc", e);
        setUser({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName,
          photoURL: firebaseUser.photoURL,
          familyId: null,
          role: null,
          isAdmin: false,
        });
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, [setUser, setLoading]);
}

