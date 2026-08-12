/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  FILES: R2Bucket;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

const CREATE_VERSIONS_TABLE = `CREATE TABLE IF NOT EXISTS data_versions (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  object_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  uploaded_by TEXT,
  size_bytes INTEGER NOT NULL,
  row_count INTEGER NOT NULL,
  stage_names TEXT NOT NULL,
  data_json TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 0
)`;
const CREATE_ACTIVE_INDEX = "CREATE INDEX IF NOT EXISTS data_versions_active_idx ON data_versions (is_active, created_at DESC)";

async function ensureStorage(env: Env) {
  await env.DB.batch([
    env.DB.prepare(CREATE_VERSIONS_TABLE),
    env.DB.prepare(CREATE_ACTIVE_INDEX),
  ]);
}

function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { "cache-control": "no-store" } });
}

function versionIdFromPath(pathname: string, suffix = "") {
  const pattern = suffix
    ? new RegExp(`^/api/versions/([^/]+)/${suffix}$`)
    : /^\/api\/versions\/([^/]+)$/;
  return pathname.match(pattern)?.[1] ?? null;
}

async function handleApi(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/")) return null;
  await ensureStorage(env);

  if (url.pathname === "/api/data" && request.method === "GET") {
    const row = await env.DB.prepare("SELECT id, filename, created_at, data_json FROM data_versions WHERE is_active = 1 ORDER BY created_at DESC LIMIT 1").first<Record<string, string>>();
    if (!row) return json({ active: null }, 404);
    return json({ id: row.id, filename: row.filename, createdAt: row.created_at, data: JSON.parse(row.data_json) });
  }

  if (url.pathname === "/api/versions" && request.method === "GET") {
    const result = await env.DB.prepare("SELECT id, filename, created_at, uploaded_by, size_bytes, row_count, stage_names, is_active FROM data_versions ORDER BY created_at DESC").all();
    return json({ versions: result.results.map((row: any) => ({
      id: row.id, filename: row.filename, createdAt: row.created_at, uploadedBy: row.uploaded_by,
      sizeBytes: row.size_bytes, rowCount: row.row_count, stageNames: JSON.parse(row.stage_names), active: Boolean(row.is_active),
    })) });
  }

  if (url.pathname === "/api/versions" && request.method === "POST") {
    const form = await request.formData();
    const file = form.get("file");
    const dataText = form.get("data");
    if (!(file instanceof File) || typeof dataText !== "string") return json({ error: "الملف أو البيانات غير مكتملة." }, 400);
    if (file.size > 15 * 1024 * 1024) return json({ error: "حجم الملف يتجاوز 15 ميجابايت." }, 400);
    let parsed: any;
    try { parsed = JSON.parse(dataText); } catch { return json({ error: "تعذر قراءة البيانات المحللة." }, 400); }
    if (!Array.isArray(parsed.rows) || parsed.rows.length === 0 || !Array.isArray(parsed.stages) || parsed.stages.length === 0) {
      return json({ error: "هيكل البيانات غير صالح." }, 400);
    }
    const id = crypto.randomUUID();
    const objectKey = `versions/${id}/${file.name.replace(/[^\p{L}\p{N}._ -]/gu, "_")}`;
    const createdAt = new Date().toISOString();
    const uploadedBy = request.headers.get("oai-authenticated-user-email");
    await env.FILES.put(objectKey, file.stream(), { httpMetadata: { contentType: file.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" } });
    await env.DB.batch([
      env.DB.prepare("UPDATE data_versions SET is_active = 0 WHERE is_active = 1"),
      env.DB.prepare("INSERT INTO data_versions (id, filename, object_key, created_at, uploaded_by, size_bytes, row_count, stage_names, data_json, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)")
        .bind(id, file.name, objectKey, createdAt, uploadedBy, file.size, parsed.rows.length, JSON.stringify(parsed.stages), dataText),
    ]);
    return json({ id, active: true }, 201);
  }

  const activateId = versionIdFromPath(url.pathname, "activate");
  if (activateId && request.method === "POST") {
    const exists = await env.DB.prepare("SELECT id FROM data_versions WHERE id = ?").bind(activateId).first();
    if (!exists) return json({ error: "الإصدار غير موجود." }, 404);
    await env.DB.batch([
      env.DB.prepare("UPDATE data_versions SET is_active = 0 WHERE is_active = 1"),
      env.DB.prepare("UPDATE data_versions SET is_active = 1 WHERE id = ?").bind(activateId),
    ]);
    return json({ active: activateId });
  }

  const fileId = versionIdFromPath(url.pathname, "file");
  if (fileId && request.method === "GET") {
    const row = await env.DB.prepare("SELECT filename, object_key FROM data_versions WHERE id = ?").bind(fileId).first<{ filename: string; object_key: string }>();
    if (!row) return json({ error: "الإصدار غير موجود." }, 404);
    const object = await env.FILES.get(row.object_key);
    if (!object) return json({ error: "ملف الإصدار غير موجود." }, 404);
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("content-disposition", `inline; filename*=UTF-8''${encodeURIComponent(row.filename)}`);
    headers.set("cache-control", "private, no-store");
    return new Response(object.body, { headers });
  }

  const deleteId = versionIdFromPath(url.pathname);
  if (deleteId && request.method === "DELETE") {
    const row = await env.DB.prepare("SELECT object_key, is_active FROM data_versions WHERE id = ?").bind(deleteId).first<{ object_key: string; is_active: number }>();
    if (!row) return json({ error: "الإصدار غير موجود." }, 404);
    if (row.is_active) return json({ error: "لا يمكن حذف الإصدار النشط. فعّل إصدارًا آخر أولًا." }, 409);
    await env.FILES.delete(row.object_key);
    await env.DB.prepare("DELETE FROM data_versions WHERE id = ?").bind(deleteId).run();
    return json({ deleted: deleteId });
  }

  return json({ error: "المسار غير موجود." }, 404);
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    const apiResponse = await handleApi(request, env);
    if (apiResponse) return apiResponse;

    const response = await handler.fetch(request, env, ctx);
    const contentType = response.headers.get("content-type") ?? "";
    if (request.method === "GET" && contentType.includes("text/html")) {
      const headers = new Headers(response.headers);
      headers.set("cache-control", "no-store, no-cache, must-revalidate, max-age=0");
      headers.set("pragma", "no-cache");
      headers.set("expires", "0");
      headers.set("clear-site-data", '"cache"');
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    }
    return response;
  },
};

export default worker;
