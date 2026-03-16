"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { getFirestoreDb } from "@/lib/firebase/client";
import { useAuthStore } from "@/lib/stores/authStore";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function JoinByTokenPage() {
  const router = useRouter();
  const params = useParams<{ familyId: string; token: string }>();
  const { familyId, token } = params;
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);
  const [status, setStatus] = useState<"loading" | "done" | "error">(
    "loading"
  );
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;

    if (!user) {
      setMessage("Bạn cần đăng nhập trước khi tham gia gia đình.");
      setStatus("error");
      return;
    }

    if (user.familyId) {
      setMessage("Bạn đã thuộc một gia đình. Không thể tham gia gia đình khác.");
      setStatus("error");
      return;
    }

    const run = async () => {
      try {
        const db = getFirestoreDb();
        const inviteRef = doc(
          db,
          "families",
          familyId,
          "invites",
          token
        );
        const inviteSnap = await getDoc(inviteRef);

        if (!inviteSnap.exists()) {
          setMessage("Link mời không hợp lệ.");
          setStatus("error");
          return;
        }

        const invite = inviteSnap.data() as any;

        if (invite.used) {
          setMessage("Link mời đã được sử dụng.");
          setStatus("error");
          return;
        }

        if (invite.expiresAt) {
          const expires =
            invite.expiresAt.toDate?.() ?? new Date(invite.expiresAt);
          if (expires < new Date()) {
            setMessage("Link mời đã hết hạn.");
            setStatus("error");
            return;
          }
        }

        const famRef = doc(db, "families", familyId);
        await updateDoc(famRef, {
          [`members.${user.uid}`]: {
            role: "member",
            name: user.displayName ?? user.email,
            avatar: user.photoURL ?? null,
            joinedAt: serverTimestamp(),
          },
        });

        await updateDoc(inviteRef, { used: true });

        await setDoc(
          doc(db, "users", user.uid),
          { familyId },
          { merge: true }
        );

        setStatus("done");
        setMessage("Tham gia gia đình thành công! Đang chuyển hướng...");
        setTimeout(() => router.replace("/dashboard"), 1500);
      } catch (e) {
        console.error(e);
        setMessage("Không tham gia được gia đình. Vui lòng thử lại.");
        setStatus("error");
      }
    };

    run();
  }, [router, familyId, token, user, loading]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md space-y-4 p-6 text-center">
        <h1 className="text-lg font-semibold">Tham gia gia đình</h1>
        {status === "loading" && (
          <p className="text-sm text-muted-foreground">
            Đang xử lý lời mời...
          </p>
        )}
        {message && (
          <p
            className={`text-sm ${
              status === "done" ? "text-green-600" : status === "error" ? "text-destructive" : ""
            }`}
          >
            {message}
          </p>
        )}
        {status === "error" && !user && (
          <Button onClick={() => router.push("/login")}>Đăng nhập</Button>
        )}
        {status === "error" && user && (
          <Button onClick={() => router.push("/dashboard")}>
            Về trang chủ
          </Button>
        )}
      </Card>
    </div>
  );
}
