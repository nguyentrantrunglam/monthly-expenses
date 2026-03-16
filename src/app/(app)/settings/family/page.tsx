"use client";

import { useState } from "react";
import { useFamily } from "@/hooks/useFamily";
import { useAuthStore } from "@/lib/stores/authStore";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserMinus } from "lucide-react";

export default function FamilySettingsPage() {
  const { family, createFamily, createInvite, deleteFamily, removeMember, loading } = useFamily();
  const user = useAuthStore((s) => s.user);
  const [name, setName] = useState("");
  const [cycleDay, setCycleDay] = useState("1");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [removingMember, setRemovingMember] = useState<string | null>(null);

  const handleCreateFamily = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await createFamily(name.trim(), Number(cycleDay) || 1);
      setName("");
    } catch (err) {
      console.error(err);
      setError("Không tạo được gia đình. Vui lòng thử lại.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!family) return;
    setError(null);
    setSubmitting(true);
    try {
      const result = await createInvite(inviteEmail.trim());
      const baseUrl =
        typeof window !== "undefined"
          ? window.location.origin
          : "http://localhost:3000";
      setInviteLink(`${baseUrl}/join/${result.familyId}/${result.token}`);
      setInviteEmail("");
    } catch (err) {
      console.error(err);
      setError("Không tạo được lời mời. Vui lòng thử lại.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) {
    return <p>Bạn cần đăng nhập để quản lý gia đình.</p>;
  }

  if (loading) {
    return <p>Đang tải thông tin gia đình...</p>;
  }

  if (!family) {
    return (
      <div className="max-w-xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Gia đình của bạn</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Bạn chưa tham gia gia đình nào. Tạo một gia đình mới để bắt đầu.
          </p>
        </div>
        <Card className="p-5">
          <form onSubmit={handleCreateFamily} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Tên gia đình</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ví dụ: Gia đình Lâm"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Ngày bắt đầu session hàng tháng</Label>
              <Input
                type="number"
                min={1}
                max={28}
                value={cycleDay}
                onChange={(e) => setCycleDay(e.target.value)}
                required
              />
              <p className="text-[11px] text-muted-foreground">
                Ngày trong tháng mà session mới bắt đầu (1–28).
              </p>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={submitting || !name.trim()}>
              {submitting ? "Đang tạo..." : "Tạo gia đình"}
            </Button>
          </form>
        </Card>
      </div>
    );
  }

  const isOwner =
    family.members[user.uid]?.role === "owner" || family.createdBy === user.uid;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Gia đình của bạn</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Quản lý thành viên gia đình và lời mời tham gia.
        </p>
      </div>

      <Card className="p-5 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Tên gia đình</p>
            <p className="mt-0.5 text-sm font-semibold">{family.name}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Ngày bắt đầu session</p>
            <p className="mt-0.5 text-sm font-semibold">Ngày {family.cycleDay} hàng tháng</p>
          </div>
        </div>
      </Card>

      <Card className="p-5 space-y-3">
        <p className="text-sm font-semibold">Thành viên ({Object.keys(family.members).length})</p>
        <ul className="space-y-1 text-sm">
          {Object.entries(family.members).map(([id, m]) => {
            const isSelf = id === user.uid;
            const isMemberOwner = id === family.createdBy;
            const canRemove = isOwner && !isMemberOwner;

            return (
              <li key={id} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="truncate">
                    {m.name || "Không tên"}
                    {isSelf && (
                      <span className="ml-1 text-[10px] text-muted-foreground">(bạn)</span>
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] uppercase text-muted-foreground font-medium">
                    {isMemberOwner ? "Owner" : "Member"}
                  </span>
                  {canRemove && (
                    <button
                      type="button"
                      disabled={removingMember === id}
                      className="rounded p-1 text-muted-foreground hover:bg-red-50 hover:text-destructive dark:hover:bg-red-950 disabled:opacity-50"
                      title={`Xóa ${m.name || "thành viên"}`}
                      onClick={async () => {
                        if (!confirm(`Xóa "${m.name || id}" khỏi gia đình?`)) return;
                        setRemovingMember(id);
                        try {
                          await removeMember(id);
                        } catch (err: any) {
                          alert(err.message || "Xóa thất bại");
                        } finally {
                          setRemovingMember(null);
                        }
                      }}
                    >
                      <UserMinus className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      {isOwner && (
        <Card className="p-5 space-y-4">
          <p className="text-sm font-semibold">Mời thành viên mới</p>
          <form onSubmit={handleInvite} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="email@domain.com"
                required
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={submitting || !inviteEmail.trim()}>
              {submitting ? "Đang tạo link..." : "Tạo link mời"}
            </Button>
          </form>
          {inviteLink && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">
                Link có hiệu lực trong 24 giờ:
              </p>
              <p className="break-all text-xs">{inviteLink}</p>
            </div>
          )}
        </Card>
      )}

      {isOwner && (
        <Card className="border-destructive/30 p-5 space-y-3">
          <p className="text-sm font-semibold text-destructive">Vùng nguy hiểm</p>
          <p className="text-xs text-muted-foreground">
            Xóa gia đình sẽ xóa toàn bộ dữ liệu: sessions, khoản cố định, lời
            mời, và gỡ liên kết tất cả thành viên. Hành động này không thể hoàn
            tác.
          </p>
          <Button
            variant="destructive"
            size="sm"
            disabled={deleting}
            onClick={async () => {
              const confirmed = prompt(
                `Nhập "${family.name}" để xác nhận xóa gia đình:`
              );
              if (confirmed !== family.name) return;
              setDeleting(true);
              try {
                await deleteFamily();
              } catch (err: any) {
                console.error(err);
                setError(err?.message || "Không xóa được gia đình.");
                setDeleting(false);
              }
            }}
          >
            {deleting ? "Đang xóa..." : "Xóa gia đình"}
          </Button>
        </Card>
      )}
    </div>
  );
}

