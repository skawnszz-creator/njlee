import type { Metadata } from "next";
import type { ReactNode } from "react";

import { getLang } from "@/lib/i18n";
import "./globals.css";

export const metadata: Metadata = {
  title: "DSS 계측기 관리",
  description: "사내 계측기 목록 및 교정 기한 관리",
};

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  // 화면 언어를 <html lang> 에도 반영한다.
  const lang = await getLang();

  return (
    <html lang={lang} className="h-full">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
