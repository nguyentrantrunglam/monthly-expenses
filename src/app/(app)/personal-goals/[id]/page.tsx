"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/stores/authStore";
import { PersonalGoalsPageContent } from "@/components/personal-goals/PersonalGoalsPageContent";

export default function AdminViewPersonalGoalsByUserPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === "string" ? params.id.trim() : "";
  const loading = useAuthStore((s) => s.loading);
  const isAdmin = useAuthStore((s) => s.user?.isAdmin === true);

  useEffect(() => {
    if (loading) return;
    if (!isAdmin) {
      router.replace("/personal-goals");
    }
  }, [loading, isAdmin, router]);

  if (loading) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        Đang tải…
      </p>
    );
  }

  if (!isAdmin) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        Đang chuyển hướng…
      </p>
    );
  }

  if (!id) {
    return (
      <p className="text-sm text-destructive" role="alert">
        Thiếu mã người dùng.
      </p>
    );
  }

  return <PersonalGoalsPageContent viewUserId={id} readOnly />;
}
