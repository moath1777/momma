import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const incoming = await headers();
  const host = incoming.get("x-forwarded-host") ?? incoming.get("host") ?? "localhost:3000";
  const protocol = incoming.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const imageUrl = `${protocol}://${host}/og.png`;
  const title = "قياس نضج النموذج التشغيلي";
  const description = "لوحة هيكل تنظيمي تفاعلية لقياس مراحل التصميم والبناء المؤسسي والتشغيل وعرض نقاط التحقق.";

  return {
    title,
    description,
    openGraph: { title, description, type: "website", locale: "ar_SA", images: [{ url: imageUrl, width: 1734, height: 907 }] },
    twitter: { card: "summary_large_image", title, description, images: [imageUrl] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
