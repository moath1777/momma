"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  GROUP_SHEETS,
  LOCAL_SYNC_FINGERPRINT_KEY,
  LOCAL_WORKBOOK_NAME,
  LOCAL_WORKBOOK_URL,
  REQUIRED_SHEETS,
  fileFingerprint,
  parseWorkbook,
  readLinkedWorkbook,
  saveLinkedWorkbook,
  uploadWorkbookVersion,
  type LocalFileHandle,
} from "../workbook-data";

type Version = { id: string; filename: string; createdAt: string; uploadedBy?: string; sizeBytes: number; rowCount: number; stageNames: string[]; active: boolean };

export default function UploadPage() {
  const [versions, setVersions] = useState<Version[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [linkedWorkbook, setLinkedWorkbook] = useState<LocalFileHandle | null>(null);
  const [syncState, setSyncState] = useState("غير مرتبط");
  const lastSyncedFingerprint = useRef<string | null>(null);
  const syncing = useRef(false);

  const loadVersions = useCallback(async () => {
    const response = await fetch("/api/versions", { cache: "no-store" });
    if (!response.ok) throw new Error("تعذر تحميل الإصدارات.");
    setVersions((await response.json()).versions);
  }, []);

  const syncWorkbook = useCallback(async (file: File, automatic = false) => {
    if (syncing.current) return;
    syncing.current = true;
    setBusy(true); setError(""); setMessage(automatic ? "تم رصد تعديل في ملف Excel..." : "جارٍ فحص الملف...");
    try {
      if (!file.name.toLowerCase().endsWith(".xlsx")) throw new Error("الملف يجب أن يكون بصيغة XLSX.");
      const data = await parseWorkbook(file);
      setMessage(`تم التحقق من ${data.rows.length} سجل. جارٍ إنشاء الإصدار...`);
      await uploadWorkbookVersion(file, data);
      lastSyncedFingerprint.current = fileFingerprint(file);
      localStorage.setItem(LOCAL_SYNC_FINGERPRINT_KEY, lastSyncedFingerprint.current);
      await loadVersions();
      setSyncState(`متصل — آخر مزامنة ${new Date().toLocaleTimeString("ar-SA")}`);
      setMessage(automatic ? "تمت مزامنة تعديل الملف وتحديث لوحة التحليل الآن." : "تم رفع الملف وتفعيل الإصدار الجديد. لوحة التحليل تستخدم بياناته الآن.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "تعذر معالجة الملف."); setMessage(""); }
    finally { syncing.current = false; setBusy(false); }
  }, [loadVersions]);

  async function upload(file?: File) {
    if (file) await syncWorkbook(file);
  }

  async function linkWorkbook() {
    setError("");
    try {
      const picker = (window as typeof window & { showOpenFilePicker?: (options: { multiple: false; types: Array<{ description: string; accept: Record<string, string[]> }> }) => Promise<LocalFileHandle[]> }).showOpenFilePicker;
      if (!picker) throw new Error("هذا المتصفح لا يدعم ربط ملف محلي للمزامنة. افتح الموقع في Microsoft Edge أو Google Chrome.");
      const [handle] = await picker({ multiple: false, types: [{ description: "Excel workbook", accept: { "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"] } }] });
      if (!handle) return;
      await saveLinkedWorkbook(handle);
      setLinkedWorkbook(handle); setSyncState("جارٍ التحقق والمزامنة الأولى...");
      await syncWorkbook(await handle.getFile());
    } catch (reason) { setError(reason instanceof Error ? reason.message : "تعذر ربط الملف."); }
  }

  useEffect(() => {
    loadVersions().catch((reason) => setError(reason.message));
    readLinkedWorkbook().then(async (handle) => {
      if (!handle) return;
      const permission = await handle.queryPermission?.({ mode: "read" });
      if (permission !== "granted") { setSyncState("يلزم إعادة تأكيد ربط الملف"); return; }
      setLinkedWorkbook(handle);
      const file = await handle.getFile();
      lastSyncedFingerprint.current = localStorage.getItem(LOCAL_SYNC_FINGERPRINT_KEY);
      if (lastSyncedFingerprint.current !== fileFingerprint(file)) await syncWorkbook(file, true);
      else setSyncState(`متصل — آخر ملف تمت مزامنته`);
    }).catch(() => setSyncState("غير مرتبط"));
  }, [loadVersions, syncWorkbook]);

  useEffect(() => {
    if (!linkedWorkbook) return;
    const watch = window.setInterval(async () => {
      try {
        const file = await linkedWorkbook.getFile();
        if (lastSyncedFingerprint.current !== fileFingerprint(file)) await syncWorkbook(file, true);
      } catch { setSyncState("تعذر الوصول للملف المرتبط"); }
    }, 1000);
    return () => window.clearInterval(watch);
  }, [linkedWorkbook, syncWorkbook]);

  async function mutate(url: string, method: "POST" | "DELETE") {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(url, { method }); const result = await response.json();
      if (!response.ok) throw new Error(result.error || "تعذر تنفيذ العملية.");
      await loadVersions(); setMessage(method === "DELETE" ? "تم حذف الإصدار." : "تم استرجاع الإصدار وتفعيله على لوحة التحليل.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "تعذر تنفيذ العملية."); }
    finally { setBusy(false); }
  }

  return (
    <main className="content-page">
      <header className="content-topbar">
        <a className="compact-brand" href="/"><img src="/mngdp-logo.png" alt="برنامج تطوير وزارة الحرس الوطني" /></a>
        <nav className="site-nav" aria-label="التنقل الرئيسي"><a href="/">لوحة التحليل</a><a href="/guide">الدليل الإرشادي</a><a className="active" href="/upload">رفع البيانات</a></nav>
      </header>

      <section className="page-hero upload-hero"><p>إدارة مصدر البيانات</p><h1>رفع بيانات الهيكل التنظيمي</h1><span>ارفع ملف القياس الجديد؛ يُفحص على مستوى الوحدات ونقاط التحقق، ثم تُحدّث المخططات التنظيمية ودرجات المراحل مباشرة.</span></section>

      <section className="upload-layout">
        <div className="upload-column">
          <section className={`local-sync-card ${linkedWorkbook ? "connected" : ""}`} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 16px", border: `1px solid ${linkedWorkbook ? "#8ab89b" : "#d8e5de"}`, borderRadius: 16, background: linkedWorkbook ? "linear-gradient(135deg, #f4fbf6, #e4f3e9)" : "linear-gradient(135deg, #f8fcf9, #edf6f0)", boxShadow: "0 9px 24px rgba(23,52,41,.04)" }}>
            <div style={{ minWidth: 0, display: "grid", gap: 3 }}><p style={{ margin: 0, color: "var(--green)", fontSize: 9, fontWeight: 900 }}>مزامنة الملف المحلي</p><strong style={{ overflow: "hidden", maxWidth: 255, color: "var(--ink)", fontSize: 11, textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{linkedWorkbook ? linkedWorkbook.name : "اربط ملف Excel لتحديث الموقع تلقائيًا"}</strong><small style={{ color: "var(--muted)", fontSize: 8 }}>{syncState}</small></div>
            <button type="button" disabled={busy} onClick={linkWorkbook} style={{ flex: "0 0 auto", border: 0, borderRadius: 9, padding: "9px 11px", color: "white", background: "var(--green)", fontSize: 9, fontWeight: 900, cursor: busy ? "wait" : "pointer", opacity: busy ? .55 : 1 }}>{linkedWorkbook ? "تغيير الملف" : "ربط الملف"}</button>
          </section>
          <label className={`upload-dropzone ${busy ? "disabled" : ""}`}>
            <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={busy} onChange={(event) => upload(event.target.files?.[0])} />
            <span className="upload-icon">↑</span><strong>{busy ? "جارٍ المعالجة..." : "اختر ملف Excel"}</strong><small>أو اسحب الملف هنا — الحد الأقصى 15 MB</small>
          </label>
          {message && <p className="system-message success">{message}</p>}{error && <p className="system-message error">{error}</p>}
          <article className="requirements-card">
            <h2>شروط ملف Excel</h2>
            <ul>
              <li>الصيغة المطلوبة: <b>XLSX</b>، والحجم لا يتجاوز 15 MB.</li>
              <li>الشيتات المطلوبة بالأسماء نفسها: <b>{REQUIRED_SHEETS.join("، ")}</b>.</li>
              <li>يجب أن تحتوي «قائمة الوحدات» على كود فريد لكل وحدة، ومجموعتها، ووحدتها الرئيسية والفرعية والوحدة المقاسة.</li>
              <li>أوراق الإدخال الثلاث — <b>{GROUP_SHEETS.join("، ")}</b> — يجب أن تحتفظ بأعمدة الوحدة والمرحلة والعنصر وكود ونص نقطة التحقق ونسبتي الإنجاز الحالية والمستهدفة لعام 2026.</li>
              <li>شيت «النتائج» يجب أن يحتوي على 3 مراحل بالضبط، و«درجة المرحلة» و«درجة المرحلة المستهدفة لعام 2026» لكل وحدة.</li>
              <li>نسب الإنجاز الحالية والمستهدفة يجب أن تكون أرقامًا بين 0 و100، ويرتبط كل سجل بكود وحدة موجود في «قائمة الوحدات».</li>
              <li>يمكن اختلاف ترتيب الأعمدة، لكن يجب الحفاظ على أسماء الأعمدة المطلوبة كما هي.</li>
            </ul>
            <p>للتحديث التلقائي: اضغط «ربط الملف» مرة واحدة واختر ملف Excel الحالي. ما دام الموقع مفتوحًا على لوحة التحليل أو صفحة رفع البيانات، يلتقط الحفظ الجديد ويحدّث اللوحة تلقائيًا. الملف الافتراضي داخل المشروع هو <b>{LOCAL_WORKBOOK_NAME}</b>.</p>
          </article>
        </div>

        <section className="versions-panel">
          <div className="versions-head"><div><p>سجل التحديثات</p><h2>إصدارات البيانات</h2></div><span>{versions.length} إصدار</span></div>
          <div className="versions-list">
            {versions.map((version) => (
              <article className={`version-card ${version.active ? "current" : ""}`} key={version.id}>
                <div className="version-main"><span className="file-badge">XLSX</span><div><a href={version.active ? LOCAL_WORKBOOK_URL : `/api/versions/${version.id}/file`} target={version.active ? undefined : "_blank"} rel={version.active ? undefined : "noreferrer"} title={version.active ? "فتح الملف المحلي المرتبط في Excel" : "فتح ملف هذا الإصدار"}>{version.active ? linkedWorkbook?.name || version.filename || LOCAL_WORKBOOK_NAME : version.filename}</a><small>{new Date(version.createdAt).toLocaleString("ar-SA")} · {version.rowCount} نقطة تحقق · {(version.sizeBytes / 1024).toFixed(0)} KB</small><em>{version.stageNames.join(" · ")}</em></div></div>
                <div className="version-actions">
                  {version.active ? <b>الإصدار الحالي</b> : <button disabled={busy} onClick={() => mutate(`/api/versions/${version.id}/activate`, "POST")}>استرجاع وتفعيل</button>}
                  {!version.active && <button className="danger" disabled={busy} onClick={() => mutate(`/api/versions/${version.id}`, "DELETE")}>حذف</button>}
                </div>
              </article>
            ))}
            {!versions.length && <div className="empty-versions">لا توجد إصدارات مرفوعة بعد. تستخدم اللوحة البيانات الأساسية الحالية.</div>}
          </div>
        </section>
      </section>
    </main>
  );
}
