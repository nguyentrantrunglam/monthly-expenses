import type { Metadata } from "next";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import { AuthProvider } from "@/components/providers/auth-provider";
import { QueryProvider } from "@/components/providers/query-provider";
import { Toaster } from "@/components/ui/sonner";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Family Finance",
  description: "Quản lý chi tiêu gia đình theo session tháng",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="vi"
      suppressHydrationWarning
      className={cn("font-sans", geist.variable)}
    >
      <body className="min-h-screen bg-background text-foreground antialiased">
        <QueryProvider>
          <AuthProvider>
            {children}
            <Toaster richColors position="bottom-right" />
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}


