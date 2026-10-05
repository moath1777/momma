/* Native navigation is used by this Vinext app. */
/* eslint-disable @next/next/no-html-link-for-pages, @next/next/no-img-element */
import type { ReactNode } from "react";
import Icon from "./icon";

export default function AppHeader({ active, action }: { active: "dashboard" | "guide" | "upload"; action?: ReactNode }) {
  return (
    <header className="app-header">
      <div className="app-header-inner">
        <a className="app-brand" href="/" aria-label="الرئيسية — قياس نضج النموذج التشغيلي"><img src="/mngdp-logo.png" width="224" height="56" alt="برنامج تطوير وزارة الحرس الوطني" /></a>
        <nav className="app-nav" aria-label="التنقل الرئيسي">
          <a href="/" aria-current={active === "dashboard" ? "page" : undefined}><Icon name="chart" />لوحة التحليل</a>
          <a href="/guide" aria-current={active === "guide" ? "page" : undefined}><Icon name="book" />الدليل الإرشادي</a>
          <a href="/upload" aria-current={active === "upload" ? "page" : undefined}><Icon name="upload" />رفع البيانات</a>
        </nav>
        <div className="app-header-action">{action ?? <span className="platform-label">قياس النضج المؤسسي</span>}</div>
      </div>
    </header>
  );
}
