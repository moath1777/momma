"use client";
/* Native links match the navigation used by the Vinext app. */
/* eslint-disable @next/next/no-html-link-for-pages */

import { useCallback, useEffect, useRef, useState } from "react";
import AppHeader from "../components/app-header";
import Icon from "../components/icon";
import Dialog from "../components/dialog";
import {
  GROUP_SHEETS,
  LOCAL_SYNC_FINGERPRINT_KEY,
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
  const [loadingVersions, setLoadingVersions] = useState(true);
  const [versionsFailed, setVersionsFailed] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [lastFile, setLastFile] = useState("");
  const [pendingDelete, setPendingDelete] = useState<Version | null>(null);
  const lastSyncedFingerprint = useRef<string | null>(null);
  const syncing = useRef(false);

  const loadVersions = useCallback(async () => {
    try {
      const response = await fetch("/api/versions", { cache: "no-store" });
      if (!response.ok) throw new Error("تعذر تحميل الإصدارات. حاول تحديث الصفحة.");
      setVersions((await response.json()).versions);
      setVersionsFailed(false);
    } catch (reason) { setVersionsFailed(true); throw reason; }
    finally { setLoadingVersions(false); }
  }, []);

  const syncWorkbook = useCallback(async (file: File, automatic = false) => {
    if (syncing.current) return;
    syncing.current = true;
    setBusy(true); setError(""); setMessage(automatic ? "تم رصد تعديل في ملف Excel..." : "جارٍ فحص الملف...");
    try {
      if (!file.name.toLowerCase().endsWith(".xlsx")) throw new Error("الملف يجب أن يكون بصيغة XLSX.");
      if (file.size > 15 * 1024 * 1024) throw new Error("حجم الملف يتجاوز 15 ميجابايت. اختر ملفًا أصغر.");
      setLastFile(file.name);
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
    } catch (reason) { if (reason instanceof DOMException && reason.name === "AbortError") return; setError(reason instanceof Error ? reason.message : "تعذر ربط الملف."); }
  }

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => { void loadVersions().catch((reason) => setError(reason.message)); });
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
    return () => window.cancelAnimationFrame(frame);
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
      <AppHeader active="upload" action={<a className="button button-outline" href="/"><Icon name="arrow" />العودة إلى التحليل</a>} />
      <div className="app-container" id="main-content">
      <section className="page-heading"><div><p className="eyebrow">إدارة مصدر البيانات</p><h1>بيانات أدق. قرارات أوضح.</h1><p className="page-description">حدّث ملف القياس، تابع المزامنة، واستعرض إصدارات بياناتك من مكان واحد.</p></div><a className="help-link" href="/guide#data"><Icon name="book" />دليل تحديث البيانات<Icon name="arrow" /></a></section>
      {message && <div className="notice" role="status" style={{ marginTop: 20 }}><Icon name={busy ? "refresh" : "check"} /><p>{message}</p></div>}
      {error && <div className="notice error" role="alert" style={{ marginTop: 20 }}><Icon name="info" /><p>{error}</p><button type="button" aria-label="إغلاق رسالة الخطأ" onClick={() => setError("")}><Icon name="close" /></button></div>}
      <section className="upload-layout">
        <div className="upload-column">
          <section className="panel" aria-busy={busy}>
            <div className="panel-title"><span><Icon name="upload" /></span><div><h2>رفع ملف القياس</h2><p>يُفعّل الإصدار الجديد بعد التحقق من البيانات.</p></div></div>
            <label className={`upload-dropzone ${busy ? "disabled" : ""} ${dragging ? "dragging" : ""}`} onDragOver={(event) => { event.preventDefault(); if (!busy) setDragging(true); }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }} onDrop={(event) => {
              event.preventDefault(); setDragging(false);
              if (busy) return;
              if (event.dataTransfer.files.length !== 1) { setError("اختر ملف Excel واحدًا في كل مرة."); return; }
              void upload(event.dataTransfer.files[0]);
            }}>
              <input type="file" aria-label="اختر ملف Excel" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={busy} onChange={(event) => { void upload(event.target.files?.[0]); event.target.value = ""; }} />
              <span className="upload-icon"><Icon name="file" /></span><strong>{busy ? "جارٍ التحقق من بياناتك…" : dragging ? "أفلت الملف هنا" : "اسحب ملف Excel إلى هنا"}</strong><small>صيغة XLSX · بحد أقصى 15 ميجابايت</small><span className="button button-primary">{busy ? "جارٍ المعالجة…" : "اختر ملف Excel"}<Icon name="upload" /></span>
              {busy && <span className="upload-progress" aria-hidden="true" />}
            </label>
            {lastFile && <p className="upload-file-info">آخر ملف تم اختياره: {lastFile}</p>}
            <a className="upload-guide-link" href="/guide#data"><Icon name="book" />تعرّف على خطوات تجهيز الملف<Icon name="arrow" /></a>
          </section>
          <section className="local-sync-card panel">
            <span className="unit-list-icon"><Icon name="link" /></span><div className="sync-copy"><h2>مزامنة تلقائية مع Excel</h2><p>اربط ملفك مرة واحدة، واحفظ تعديلاته لتحديث اللوحة ما دام الموقع مفتوحًا.</p><strong>{linkedWorkbook ? linkedWorkbook.name : "لم يتم ربط ملف محلي"}</strong><span className={`sync-state ${linkedWorkbook && syncState.startsWith("متصل") ? "connected" : ""}`}><i />{syncState}</span></div>
            <button className="button button-outline" type="button" disabled={busy} onClick={linkWorkbook}>{linkedWorkbook ? "تغيير الملف" : "ربط الملف"}</button>
          </section>
          <details className="requirements-card panel">
            <summary>شروط ملف Excel<Icon name="chevron" /></summary>
            <ul>
              <li>الصيغة المطلوبة: <b>XLSX</b>، والحجم لا يتجاوز 15 MB.</li>
              <li>الشيتات المطلوبة بالأسماء نفسها: <b>{REQUIRED_SHEETS.join("، ")}</b>.</li>
              <li>يجب أن تحتوي «قائمة الوحدات» على كود فريد لكل وحدة، ومجموعتها، ووحدتها الرئيسية والفرعية والوحدة المقاسة.</li>
              <li>أوراق الإدخال الثلاث — <b>{GROUP_SHEETS.join("، ")}</b> — يجب أن تحتفظ بأعمدة الوحدة والمرحلة والعنصر وكود ونص نقطة التحقق ونسبتي الإنجاز الحالية والمستهدفة لعام 2026.</li>
              <li>شيت «النتائج» يجب أن يحتوي على 3 مراحل بالضبط، و«درجة المرحلة» و«درجة المرحلة المستهدفة لعام 2026» لكل وحدة.</li>
              <li>نسب الإنجاز الحالية والمستهدفة يجب أن تكون أرقامًا بين 0 و100، ويرتبط كل سجل بكود وحدة موجود في «قائمة الوحدات».</li>
              <li>يمكن اختلاف ترتيب الأعمدة، لكن يجب الحفاظ على أسماء الأعمدة المطلوبة كما هي.</li>
            </ul>
          </details>
        </div>

        <section className="versions-panel panel" aria-busy={loadingVersions}>
          <div className="versions-head"><div><h2>إصدارات البيانات</h2><p>الملف الحالي وسجل التحديثات السابقة.</p></div><span>{versions.length} إصدار</span></div>
          <div className="versions-list">
            {versions.map((version) => (
              <article className={`version-card ${version.active ? "current" : ""}`} key={version.id}>
                <div className="version-main"><span className="file-badge">XLSX</span><div><a href={`/api/versions/${version.id}/file`} download>{version.filename}</a><small>{new Date(version.createdAt).toLocaleString("ar-SA", { dateStyle: "medium", timeStyle: "short" })} · {version.rowCount} نقطة تحقق · {Math.round(version.sizeBytes / 1024)} KB</small><em>{version.stageNames.join(" · ")}</em></div></div>
                <div className="version-actions">
                  {version.active ? <b><Icon name="check" />الإصدار الحالي</b> : <button className="button button-outline" disabled={busy} onClick={() => mutate(`/api/versions/${version.id}/activate`, "POST")}><Icon name="refresh" />استرجاع وتفعيل</button>}
                  <a className="button button-quiet" href={`/api/versions/${version.id}/file`} download><Icon name="download" />تنزيل</a>
                  {!version.active && <button className="button button-quiet danger" disabled={busy} onClick={() => setPendingDelete(version)} aria-label={`حذف إصدار ${version.filename}`}><Icon name="trash" />حذف</button>}
                </div>
              </article>
            ))}
            {loadingVersions && <div className="loading-versions" role="status" aria-label="جارٍ تحميل الإصدارات"><span /><span /></div>}
            {!loadingVersions && !versions.length && !versionsFailed && <div className="empty-state"><Icon name="file" /><h3>إصدارك الأول يبدأ هنا</h3><p>ارفع ملف القياس ليظهر في سجل الإصدارات. تستخدم اللوحة الآن البيانات الأساسية.</p></div>}
            {!loadingVersions && versionsFailed && <div className="empty-state"><Icon name="info" /><h3>تعذر تحميل سجل الإصدارات</h3><p>حاول مرة أخرى للاطلاع على آخر إصدارات البيانات.</p><button className="button button-outline" type="button" onClick={() => { setLoadingVersions(true); void loadVersions().catch((reason) => setError(reason.message)); }}><Icon name="refresh" />إعادة المحاولة</button></div>}
          </div>
        </section>
      </section>
      <footer className="app-footer" style={{ marginTop: 32 }}><span>قياس نضج النموذج التشغيلي</span><span>يتحقق الموقع من البيانات قبل تفعيل أي إصدار</span></footer>
      </div>
      {pendingDelete && <Dialog className="confirm-dialog" labelId="delete-title" descriptionId="delete-description" onClose={() => setPendingDelete(null)}><Icon name="trash" /><h2 id="delete-title">حذف هذا الإصدار؟</h2><p id="delete-description">سيُحذف ملف «{pendingDelete.filename}» من سجل الإصدارات. لن تتمكن من استرجاعه بعد الحذف.</p><div className="confirm-actions"><button className="button button-outline" type="button" onClick={() => setPendingDelete(null)}>إلغاء</button><button className="button button-danger" type="button" onClick={() => { const id = pendingDelete.id; setPendingDelete(null); void mutate(`/api/versions/${id}`, "DELETE"); }}>حذف الإصدار</button></div></Dialog>}
    </main>
  );
}
