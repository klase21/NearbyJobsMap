import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "내 주변 일자리 지도",
  description: "여러 사이트의 채용공고를 한 번에 보고, 위치와 급여를 함께 비교하세요.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
