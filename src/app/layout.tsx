import type { Metadata } from "next";
import "./globals.css";
import { useAuthListener } from "@/hooks/useAuthListener";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: "Family Finance",
  description: "Quản lý chi tiêu gia đình theo session tháng",
};

function RootLayoutInner({ children }: { children: React.ReactNode }) {
  useAuthListener();
  return <>{children}</>;
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" suppressHydrationWarning className={cn("font-sans", geist.variable)}>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <RootLayoutInner>{children}</RootLayoutInner>
      </body>
    </html>
  );
}

