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

      try {
        const userRef = doc(db, "users", firebaseUser.uid);
        const snap = await getDoc(userRef);
        const data = snap.data() as
          | {
              familyId?: string | null;
              displayName?: string | null;
              role?: "owner" | "member";
            }
          | undefined;

        const mapped: AuthUser = {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: data?.displayName ?? firebaseUser.displayName,
          photoURL: firebaseUser.photoURL,
          familyId: data?.familyId ?? null,
          role: data?.role ?? null,
        };

        setUser(mapped);
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, [setUser, setLoading]);
}

