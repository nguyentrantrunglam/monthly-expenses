import { redirect } from "next/navigation";
import { useEffect } from "react";
import { useAuthStore } from "@/lib/stores/authStore";

export default function Home() {
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (user) {
      redirect("/app/dashboard");
    } else {
      redirect("/auth/login");
    }
  }, [user]);

  return null;
}

