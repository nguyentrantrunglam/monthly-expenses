"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { getFirebaseAuth, getFirestoreDb } from "@/lib/firebase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserPlus } from "lucide-react";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const auth = getFirebaseAuth();
      const db = getFirestoreDb();

      const cred = await createUserWithEmailAndPassword(auth, email, password);

      if (name) {
        await updateProfile(cred.user, { displayName: name });
      }

      await setDoc(doc(db, "users", cred.user.uid), {
        displayName: name || null,
        email: cred.user.email,
        photoURL: cred.user.photoURL ?? null,
        familyId: null,
        createdAt: serverTimestamp(),
      });

      router.replace("/login");
    } catch (err) {
      console.error(err);
      setError("Đăng ký thất bại. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-[420px]">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg">
            <UserPlus className="h-6 w-6" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight">Tạo tài khoản</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Bắt đầu quản lý chi tiêu gia đình ngay hôm nay
            </p>
          </div>
        </div>

        <Card className="p-6 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-sm">Tên hiển thị</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ví dụ: Lâm"
                className="h-10"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Email</Label>
              <Input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="h-10"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Mật khẩu</Label>
              <Input
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Tối thiểu 8 ký tự"
                className="h-10"
              />
            </div>
            {error && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" className="h-10 w-full" disabled={loading}>
              {loading ? "Đang tạo tài khoản..." : "Đăng ký"}
            </Button>
          </form>
        </Card>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Đã có tài khoản?{" "}
          <button
            type="button"
            onClick={() => router.push("/login")}
            className="font-semibold text-primary underline-offset-4 hover:underline"
          >
            Đăng nhập
          </button>
        </p>
      </div>
    </div>
  );
}
