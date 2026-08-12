import * as XLSX from "xlsx";

export const REQUIRED_SHEETS = ["الإدخال والحساب", "المرجع", "النتائج"];

export const COLUMN_KEYS = [
  "id",
  "sector",
  "mainUnit",
  "subUnit",
  "stage",
  "element",
  "weight",
  "verification",
  "earnedWeight",
] as const;

export type ColumnKey = (typeof COLUMN_KEYS)[number];
export type ColumnLabels = Record<ColumnKey, string>;

export const DEFAULT_COLUMN_LABELS: ColumnLabels = {
  id: "ID",
  sector: "القطاع",
  mainUnit: "الوحدة التنظيمية الرئيسية",
  subUnit: "الوحدة التنظيمية الفرعية",
  stage: "المرحلة",
  element: "العنصر",
  weight: "الوزن في المرحلة",
  verification: "نسبة التحقق %",
  earnedWeight: "الوزن المكتسب",
};

export type WorkbookRow = {
  id: string;
  sector: string;
  mainUnit: string;
  subUnit: string;
  stage: string;
  element: string;
  weight: number;
  verification: number;
  earnedWeight: number;
};

export type ParsedData = {
  rows: WorkbookRow[];
  stages: string[];
  columns: ColumnLabels;
  thresholds: { initialMax: number; advancedMinExclusive: number };
};

export type LocalFileHandle = {
  kind: "file";
  name: string;
  getFile: () => Promise<File>;
  queryPermission?: (options?: { mode?: "read" }) => Promise<PermissionState>;
  requestPermission?: (options?: { mode?: "read" }) => Promise<PermissionState>;
};

export const LOCAL_WORKBOOK_NAME = "operating-model-maturity.xlsx";
export const LOCAL_WORKBOOK_URL = "ms-excel:ofe|u|file:///C:/Users/moath/Documents/momma/operating-model-maturity.xlsx";
export const LOCAL_SYNC_FINGERPRINT_KEY = "maturity-last-synced-fingerprint-v2";
const LOCAL_SYNC_DB = "maturity-local-sync";
const LOCAL_SYNC_STORE = "settings";
const LOCAL_SYNC_KEY = "linked-workbook";

export function fileFingerprint(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function openLocalSyncDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(LOCAL_SYNC_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(LOCAL_SYNC_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function readLinkedWorkbook() {
  const db = await openLocalSyncDatabase();
  return new Promise<LocalFileHandle | null>((resolve, reject) => {
    const request = db.transaction(LOCAL_SYNC_STORE, "readonly").objectStore(LOCAL_SYNC_STORE).get(LOCAL_SYNC_KEY);
    request.onsuccess = () => {
      db.close();
      const handle = (request.result as LocalFileHandle | undefined) ?? null;
      resolve(handle?.name === LOCAL_WORKBOOK_NAME ? handle : null);
    };
    request.onerror = () => { db.close(); reject(request.error); };
  });
}

export async function saveLinkedWorkbook(handle: LocalFileHandle) {
  const db = await openLocalSyncDatabase();
  return new Promise<void>((resolve, reject) => {
    const request = db.transaction(LOCAL_SYNC_STORE, "readwrite").objectStore(LOCAL_SYNC_STORE).put(handle, LOCAL_SYNC_KEY);
    request.onsuccess = () => { db.close(); resolve(); };
    request.onerror = () => { db.close(); reject(request.error); };
  });
}

export function parseWorkbook(file: File): Promise<ParsedData> {
  return file.arrayBuffer().then((buffer) => {
    const workbook = XLSX.read(buffer, { type: "array", cellNF: true });
    const missingSheets = REQUIRED_SHEETS.filter((name) => !workbook.SheetNames.includes(name));
    if (missingSheets.length) throw new Error(`الشيتات المفقودة: ${missingSheets.join("، ")}`);

    const sheet = workbook.Sheets["الإدخال والحساب"];
    const matrix = XLSX.utils.sheet_to_json<Array<string | number | boolean>>(sheet, { header: 1, raw: true, defval: "" });
    const sourceHeaders = (matrix[0] ?? []).map((value) => String(value).trim());
    const missingHeaderPositions = COLUMN_KEYS
      .map((_, index) => sourceHeaders[index] ? -1 : index + 1)
      .filter((index) => index > 0);
    if (missingHeaderPositions.length) {
      throw new Error(`يجب أن تكون الأعمدة التسعة الأولى موجودة وبالترتيب نفسه. الأعمدة الفارغة: ${missingHeaderPositions.join("، ")}`);
    }

    const columns = Object.fromEntries(COLUMN_KEYS.map((key, index) => [key, sourceHeaders[index]])) as ColumnLabels;
    const rows = matrix.slice(1).filter((row) => String(row[0]).trim()).map((row, index) => {
      const weight = Number(row[6]);
      let verification = Number(row[7]);
      if (!Number.isFinite(weight) || !Number.isFinite(verification)) {
        throw new Error(`قيمة رقمية غير صحيحة في الصف ${index + 2}`);
      }
      if (verification >= 0 && verification <= 1) verification *= 100;
      if (verification < 0 || verification > 100) {
        throw new Error(`نسبة التحقق خارج النطاق في الصف ${index + 2}`);
      }
      const sourceEarnedWeight = Number(row[8]);
      const earnedWeight = Number.isFinite(sourceEarnedWeight)
        ? sourceEarnedWeight
        : Number((weight * verification / 100).toFixed(8));
      return {
        id: String(row[0]).trim(),
        sector: String(row[1]).trim(),
        mainUnit: String(row[2]).trim(),
        subUnit: String(row[3]).trim(),
        stage: String(row[4]).trim(),
        element: String(row[5]).trim(),
        weight,
        verification,
        earnedWeight,
      };
    });

    if (!rows.length) throw new Error("شيت الإدخال والحساب لا يحتوي على سجلات.");
    if (rows.some((row) => !row.id || !row.stage || !row.element)) {
      throw new Error("توجد صفوف ناقصة في المعرف أو المرحلة أو العنصر.");
    }
    const stages = [...new Set(rows.map((row) => row.stage))];
    if (stages.length !== 3) {
      throw new Error(`يجب أن يحتوي عمود ${columns.stage} على 3 مراحل بالضبط؛ الموجود ${stages.length}.`);
    }
    return { rows, stages, columns, thresholds: { initialMax: 30, advancedMinExclusive: 70 } };
  });
}

export async function uploadWorkbookVersion(file: File, parsedData?: ParsedData) {
  const data = parsedData ?? await parseWorkbook(file);
  const form = new FormData();
  form.append("file", file);
  form.append("data", JSON.stringify(data));
  const response = await fetch("/api/versions", { method: "POST", body: form });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "تعذر رفع الملف.");
  return { data, result };
}
