"use client";

import { useEffect, useState } from "react";
import * as XLSX from "xlsx";

type Version = { id: string; filename: string; createdAt: string; uploadedBy?: string; sizeBytes: number; rowCount: number; stageNames: string[]; active: boolean };
type ParsedData = { rows: Array<Record<string, string | number>>; stages: string[]; thresholds: { initialMax: number; advancedMinExclusive: number } };

const REQUIRED_SHEETS = ["الإدخال والحساب", "المرجع", "النتائج"];
const REQUIRED_HEADERS = ["ID", "القطاع", "الوحدة التنظيمية الرئيسية", "الوحدة التنظيمية الفرعية", "المرحلة", "العنصر", "الوزن في المرحلة", "نسبة التحقق %", "الوزن المكتسب"];

function parseWorkbook(file: File): Promise<ParsedData> {
  return file.arrayBuffer().then((buffer) => {
    const workbook = XLSX.read(buffer, { type: "array", cellNF: true });
    const missingSheets = REQUIRED_SHEETS.filter((name) => !workbook.SheetNames.includes(name));
    if (missingSheets.length) throw new Error(`الشيتات المفقودة: ${missingSheets.join("، ")}`);
    const sheet = workbook.Sheets["الإدخال والحساب"];
    const matrix = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, { header: 1, raw: true, defval: "" });
    const headers = (matrix[0] ?? []).map(String);
    const invalidHeaders = REQUIRED_HEADERS.filter((header, index) => headers[index]?.trim() !== header);
    if (invalidHeaders.length) throw new Error(`الأعمدة غير المطابقة: ${invalidHeaders.join("، ")}`);
    const rows = matrix.slice(1).filter((row) => String(row[0]).trim()).map((row, index) => {
      const weight = Number(row[6]);
      let verification = Number(row[7]);
      if (!Number.isFinite(weight) || !Number.isFinite(verification)) throw new Error(`قيمة رقمية غير صحيحة في الصف ${index + 2}`);
      if (verification >= 0 && verification <= 1) verification *= 100;
      if (verification < 0 || verification > 100) throw new Error(`نسبة التحقق خارج النطاق في الصف ${index + 2}`);
      return {
        id: String(row[0]).trim(), sector: String(row[1]).trim(), mainUnit: String(row[2]).trim(), subUnit: String(row[3]).trim(),
        stage: String(row[4]).trim(), element: String(row[5]).trim(), weight, verification,
        earnedWeight: Number((weight * verification / 100).toFixed(8)),
      };
    });
    if (!rows.length) throw new Error("شيت الإدخال والحساب لا يحتوي على سجلات.");
    if (rows.some((row) => !row.id || !row.stage || !row.element)) throw new Error("توجد صفوف ناقصة في المعرف أو المرحلة أو العنصر.");
    const stages = [...new Set(rows.map((row) => row.stage))];
    if (stages.length !== 3) throw new Error(`يجب أن يحتوي عمود المرحلة على 3 مراحل بالضبط؛ الموجود ${stages.length}.`);
    return { rows, stages, thresholds: { initialMax: 30, advancedMinExclusive: 70 } };
  });
}

export default function UploadPage() {
  const [versions, setVersions] = useState<Version[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadVersions() {
    const response = await fetch("/api/versions", { cache: "no-store" });
    if (!response.ok) throw new Error("تعذر تحميل الإصدارات.");
    setVersions((await response.json()).versions);
  }
  useEffect(() => { loadVersions().catch((reason) => setError(reason.message)); }, []);

  async function upload(file?: File) {
    if (!file) return;
    setBusy(true); setError(""); setMessage("جارٍ فحص الملف...");
    try {
      if (!file.name.toLowerCase().endsWith(".xlsx")) throw new Error("الملف يجب أن يكون بصيغة XLSX.");
      const data = await parseWorkbook(file);
      setMessage(`تم التحقق من ${data.rows.length} سجل. جارٍ إنشاء الإصدار...`);
      const form = new FormData(); form.append("file", file); form.append("data", JSON.stringify(data));
      const response = await fetch("/api/versions", { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "تعذر رفع الملف.");
      await loadVersions(); setMessage("تم رفع الملف وتفعيل الإصدار الجديد. لوحة التحليل تستخدم بياناته الآن.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "تعذر معالجة الملف."); setMessage(""); }
    finally { setBusy(false); }
  }

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

      <section className="page-hero upload-hero"><p>إدارة مصدر البيانات</p><h1>رفع البيانات والإصدارات</h1><span>ارفع ملفًا مطابقًا للهيكل؛ يُحفظ كإصدار مستقل وتنعكس بياناته على اللوحة بعد التفعيل.</span></section>

      <section className="upload-layout">
        <div className="upload-column">
          <label className={`upload-dropzone ${busy ? "disabled" : ""}`}>
            <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={busy} onChange={(event) => upload(event.target.files?.[0])} />
            <span className="upload-icon">↑</span><strong>{busy ? "جارٍ المعالجة..." : "اختر ملف Excel"}</strong><small>أو اسحب الملف هنا — الحد الأقصى 15 MB</small>
          </label>
          {message && <p className="system-message success">{message}</p>}{error && <p className="system-message error">{error}</p>}
          <article className="requirements-card">
            <h2>شروط ملف Excel</h2>
            <ul>
              <li>الصيغة المطلوبة: <b>XLSX</b>، والحجم لا يتجاوز 15 MB.</li>
              <li>الشيتات المطلوبة بالأسماء نفسها: <b>الإدخال والحساب، المرجع، النتائج</b>.</li>
              <li>أعمدة الشيت الأول وبالترتيب: {REQUIRED_HEADERS.join("، ")}.</li>
              <li>عمود المرحلة يجب أن يحتوي على ثلاث مراحل؛ ويمكن تغيير أسمائها وسيعكسها الموقع.</li>
              <li>نسبة التحقق بين 0 و100؛ والقيم العشرية مثل 0.1 تُحوّل إلى 10%.</li>
            </ul>
            <p>ملاحظة: بعد تعديل الملف على جهازك، أعد رفعه لإنشاء إصدار جديد. المتصفح لا يستطيع مراقبة ملف محلي مغلق أو مفتوح تلقائيًا.</p>
          </article>
        </div>

        <section className="versions-panel">
          <div className="versions-head"><div><p>سجل التحديثات</p><h2>إصدارات البيانات</h2></div><span>{versions.length} إصدار</span></div>
          <div className="versions-list">
            {versions.map((version) => (
              <article className={`version-card ${version.active ? "current" : ""}`} key={version.id}>
                <div className="version-main"><span className="file-badge">XLSX</span><div><a href={`/api/versions/${version.id}/file`} target="_blank" rel="noreferrer">{version.filename}</a><small>{new Date(version.createdAt).toLocaleString("ar-SA")} · {version.rowCount} سجل · {(version.sizeBytes / 1024).toFixed(0)} KB</small><em>{version.stageNames.join(" · ")}</em></div></div>
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
