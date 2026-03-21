import type { ReactNode } from "react";

/** Chiếm chiều cao còn lại của main; cuộn chỉ bên trong trang chat. */
export default function ChatLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {children}
    </div>
  );
}
