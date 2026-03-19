"use client";

import { useRef, useState } from "react";
import {
  updateProfile,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
} from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import {
  getFirebaseAuth,
  getFirestoreDb,
  getFirebaseStorage,
} from "@/lib/firebase/client";
import { useAuthStore } from "@/lib/stores/authStore";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  User,
  Mail,
  Lock,
  Check,
  AlertCircle,
  Camera,
  Loader2,
  Link2,
  Copy,
} from "lucide-react";

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB

export default function ProfilePage() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [saving, setSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPw, setChangingPw] = useState(false);
  const [pwMsg, setPwMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const [quickLink, setQuickLink] = useState<string | null>(null);
  const [quickLinkLoading, setQuickLinkLoading] = useState(false);
  const [quickLinkMsg, setQuickLinkMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const initials = user?.displayName
    ? user.displayName
        .split(" ")
        .map((w) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : user?.email?.slice(0, 2).toUpperCase() ?? "?";

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) {
      setProfileMsg({ type: "error", text: "Ảnh quá lớn. Tối đa 2 MB." });
      return;
    }
    if (!file.type.startsWith("image/")) {
      setProfileMsg({ type: "error", text: "Vui lòng chọn file ảnh." });
      return;
    }
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
    setProfileMsg(null);
  };

  const uploadAvatar = async (): Promise<string | null> => {
    if (!avatarFile || !user) return null;
    const storage = getFirebaseStorage();
    const path = `avatars/${user.uid}/${Date.now()}_${avatarFile.name}`;
    const fileRef = storageRef(storage, path);
    await uploadBytes(fileRef, avatarFile);
    return getDownloadURL(fileRef);
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setProfileMsg(null);
    setSaving(true);
    try {
      const auth = getFirebaseAuth();
      const firebaseUser = auth.currentUser;
      if (!firebaseUser) throw new Error("Chưa đăng nhập");

      let photoURL = user.photoURL;

      if (avatarFile) {
        setUploadingAvatar(true);
        photoURL = await uploadAvatar();
        setUploadingAvatar(false);
      }

      await updateProfile(firebaseUser, {
        displayName: displayName.trim(),
        photoURL: photoURL ?? undefined,
      });

      const db = getFirestoreDb();
      await setDoc(
        doc(db, "users", user.uid),
        { displayName: displayName.trim(), photoURL },
        { merge: true }
      );

      if (user.familyId) {
        await setDoc(
          doc(db, "families", user.familyId),
          {
            members: {
              [user.uid]: { name: displayName.trim() },
            },
          },
          { merge: true }
        );
      }

      setUser({ ...user, displayName: displayName.trim(), photoURL });
      setAvatarFile(null);
      setAvatarPreview(null);
      setProfileMsg({ type: "success", text: "Đã cập nhật thông tin." });
    } catch (err: unknown) {
      console.error(err);
      setUploadingAvatar(false);
      setProfileMsg({
        type: "error",
        text: err instanceof Error ? err.message : "Cập nhật thất bại.",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwMsg(null);

    if (newPassword.length < 8) {
      setPwMsg({ type: "error", text: "Mật khẩu mới cần tối thiểu 8 ký tự." });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwMsg({ type: "error", text: "Mật khẩu xác nhận không khớp." });
      return;
    }

    setChangingPw(true);
    try {
      const auth = getFirebaseAuth();
      const firebaseUser = auth.currentUser;
      if (!firebaseUser || !firebaseUser.email)
        throw new Error("Chưa đăng nhập");

      const credential = EmailAuthProvider.credential(
        firebaseUser.email,
        currentPassword
      );
      await reauthenticateWithCredential(firebaseUser, credential);
      await updatePassword(firebaseUser, newPassword);

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPwMsg({ type: "success", text: "Đã đổi mật khẩu thành công." });
    } catch (err: unknown) {
      console.error(err);
      const firebaseErr = err as { code?: string; message?: string };
      const msg =
        firebaseErr.code === "auth/wrong-password" || firebaseErr.code === "auth/invalid-credential"
          ? "Mật khẩu hiện tại không đúng."
          : firebaseErr.message || "Đổi mật khẩu thất bại.";
      setPwMsg({ type: "error", text: msg });
    } finally {
      setChangingPw(false);
    }
  };

  const handleCreateQuickLink = async () => {
    setQuickLinkMsg(null);
    setQuickLinkLoading(true);
    try {
      const auth = getFirebaseAuth();
      const firebaseUser = auth.currentUser;
      if (!firebaseUser) throw new Error("Chưa đăng nhập");

      const token = await firebaseUser.getIdToken();
      const res = await fetch("/api/transactions/quick-token", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error ?? "Không thể tạo link");

      setQuickLink(data.exampleUrl);
      setQuickLinkMsg({
        type: "success",
        text: "Đã tạo link. Bấm Sao chép để lưu.",
      });
    } catch (err: unknown) {
      setQuickLinkMsg({
        type: "error",
        text: err instanceof Error ? err.message : "Tạo link thất bại.",
      });
    } finally {
      setQuickLinkLoading(false);
    }
  };

  const handleCopyQuickLink = async () => {
    if (!quickLink) return;
    try {
      await navigator.clipboard.writeText(quickLink);
      setQuickLinkMsg({ type: "success", text: "Đã sao chép link." });
    } catch {
      setQuickLinkMsg({ type: "error", text: "Không thể sao chép." });
    }
  };

  if (!user) return null;

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Hồ sơ cá nhân</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Quản lý thông tin tài khoản của bạn.
        </p>
      </div>

      {/* Profile info */}
      <Card className="p-5">
        <form onSubmit={handleUpdateProfile} className="space-y-4">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <User className="h-4 w-4" />
            Thông tin cơ bản
          </h2>

          {/* Avatar */}
          <div className="space-y-1.5">
            <Label>Ảnh đại diện</Label>
            <div className="flex items-center gap-4">
              <div className="relative group">
                <Avatar size="lg" className="h-16 w-16">
                  <AvatarImage src={avatarPreview ?? user.photoURL ?? undefined} />
                  <AvatarFallback className="text-lg font-semibold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <Camera className="h-5 w-5 text-white" />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarSelect}
                />
              </div>
              <div className="flex-1 space-y-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Chọn ảnh
                </Button>
                <p className="text-[11px] text-muted-foreground">
                  JPG, PNG hoặc GIF. Tối đa 2 MB.
                </p>
                {avatarFile && (
                  <p className="text-[11px] text-primary font-medium">
                    {avatarFile.name}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Tên hiển thị</Label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Nhập tên hiển thị"
            />
          </div>

          <div className="space-y-1.5">
            <Label>
              <Mail className="h-3.5 w-3.5 text-muted-foreground" />
              Email
            </Label>
            <Input
              value={user.email ?? ""}
              disabled
              className="bg-muted cursor-not-allowed"
            />
            <p className="text-[11px] text-muted-foreground">
              Email không thể thay đổi.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>UID</Label>
            <Input
              value={user.uid}
              disabled
              className="bg-muted cursor-not-allowed font-mono text-xs"
            />
          </div>

          {profileMsg && (
            <div
              className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
                profileMsg.type === "success"
                  ? "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400"
                  : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400"
              }`}
            >
              {profileMsg.type === "success" ? (
                <Check className="h-4 w-4 shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0" />
              )}
              {profileMsg.text}
            </div>
          )}

          <Button type="submit" size="sm" disabled={saving || uploadingAvatar}>
            {uploadingAvatar ? (
              <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Đang tải ảnh...</>
            ) : saving ? (
              "Đang lưu..."
            ) : (
              "Lưu thay đổi"
            )}
          </Button>
        </form>
      </Card>

      {/* Change password */}
      <Card className="p-5">
        <form onSubmit={handleChangePassword} className="space-y-4">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Lock className="h-4 w-4" />
            Đổi mật khẩu
          </h2>

          <div className="space-y-1.5">
            <Label>Mật khẩu hiện tại</Label>
            <Input
              type="password"
              autoComplete="current-password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Nhập mật khẩu hiện tại"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Mật khẩu mới</Label>
            <Input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Tối thiểu 8 ký tự"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Xác nhận mật khẩu mới</Label>
            <Input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Nhập lại mật khẩu mới"
            />
          </div>

          {pwMsg && (
            <div
              className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
                pwMsg.type === "success"
                  ? "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400"
                  : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400"
              }`}
            >
              {pwMsg.type === "success" ? (
                <Check className="h-4 w-4 shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0" />
              )}
              {pwMsg.text}
            </div>
          )}

          <Button type="submit" size="sm" variant="outline" disabled={changingPw}>
            {changingPw ? "Đang đổi..." : "Đổi mật khẩu"}
          </Button>
        </form>
      </Card>

      {/* Quick add link */}
      <Card className="p-5">
        <div className="space-y-4">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            Link thêm nhanh
          </h2>
          <p className="text-sm text-muted-foreground">
            Tạo link để thêm chi tiêu chỉ bằng cách mở URL (không cần đăng nhập). Dùng cho bookmark, shortcut hoặc
            chia sẻ với người khác.
          </p>
          {!user.familyId && (
            <p className="text-sm text-amber-600 dark:text-amber-500">
              Bạn cần tham gia gia đình trước khi tạo link.
            </p>
          )}

          {quickLinkMsg && (
            <div
              className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
                quickLinkMsg.type === "success"
                  ? "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400"
                  : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400"
              }`}
            >
              {quickLinkMsg.type === "success" ? (
                <Check className="h-4 w-4 shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0" />
              )}
              {quickLinkMsg.text}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleCreateQuickLink}
              disabled={quickLinkLoading || !user.familyId}
            >
              {quickLinkLoading ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Đang tạo...
                </>
              ) : quickLink ? (
                "Làm mới link"
              ) : (
                "Tạo link"
              )}
            </Button>
            {quickLink && (
              <Button type="button" size="sm" onClick={handleCopyQuickLink}>
                <Copy className="mr-1.5 h-3.5 w-3.5" />
                Sao chép
              </Button>
            )}
          </div>

          {quickLink && (
            <div className="rounded-md bg-muted px-3 py-2 text-xs font-mono break-all">
              {quickLink}
            </div>
          )}

          <p className="text-[11px] text-muted-foreground">
            Tham số: <code className="rounded bg-muted px-1">token</code> (bắt buộc),{" "}
            <code className="rounded bg-muted px-1">title</code>,{" "}
            <code className="rounded bg-muted px-1">amount</code>,{" "}
            <code className="rounded bg-muted px-1">category</code>,{" "}
            <code className="rounded bg-muted px-1">date</code>,{" "}
            <code className="rounded bg-muted px-1">spendingType</code>,{" "}
            <code className="rounded bg-muted px-1">note</code>.
          </p>
        </div>
      </Card>
    </div>
  );
}
