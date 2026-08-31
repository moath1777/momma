import { readFile, stat } from "node:fs/promises";
import { File } from "node:buffer";
import path from "node:path";
import { parseWorkbook } from "../app/workbook-data.ts";

const projectDir = path.resolve(import.meta.dirname, "..");
const workbookPath = path.join(projectDir, "قياس_نضج_النموذج_التشغيلي_بالهيكل (4).xlsx");
const localBaseUrl = process.env.MNGDP_LOCAL_SYNC_URL || "http://localhost:3000";
const remoteBaseUrl = process.env.MNGDP_SYNC_REMOTE_URL;
const remoteToken = process.env.MNGDP_SYNC_REMOTE_TOKEN;
const targets = [
  { name: "local", baseUrl: localBaseUrl, token: "" },
  ...(remoteBaseUrl && remoteToken ? [{ name: "remote", baseUrl: remoteBaseUrl, token: remoteToken }] : []),
];

const uploadedFingerprints = new Map();
let observedFingerprint = "";
let stableObservations = 0;
let syncing = false;

async function upload(target, file, parsed, fingerprint) {
  if (uploadedFingerprints.get(target.name) === fingerprint) return;
  const form = new FormData();
  form.append("file", file);
  form.append("data", JSON.stringify(parsed));
  const headers = target.token ? { "OAI-Sites-Authorization": `Bearer ${target.token}` } : undefined;
  const response = await fetch(`${target.baseUrl}/api/versions`, { method: "POST", headers, body: form });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `${target.name}: HTTP ${response.status}`);
  uploadedFingerprints.set(target.name, fingerprint);
  console.log(`[workbook-sync] ${target.name} updated: ${parsed.stages.join(" | ")}`);
}

async function synchronize() {
  if (syncing) return;
  try {
    const details = await stat(workbookPath);
    const fingerprint = `${details.size}:${details.mtimeMs}`;
    if (fingerprint !== observedFingerprint) {
      observedFingerprint = fingerprint;
      stableObservations = 0;
      return;
    }
    stableObservations += 1;
    if (stableObservations < 2 || targets.every((target) => uploadedFingerprints.get(target.name) === fingerprint)) return;

    syncing = true;
    const bytes = await readFile(workbookPath);
    const file = new File([bytes], path.basename(workbookPath), {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      lastModified: details.mtimeMs,
    });
    const parsed = await parseWorkbook(file);
    for (const target of targets) {
      try {
        await upload(target, file, parsed, fingerprint);
      } catch (error) {
        console.error(`[workbook-sync] ${target.name} failed:`, error instanceof Error ? error.message : error);
      }
    }
  } catch (error) {
    console.error("[workbook-sync] waiting for a readable workbook:", error instanceof Error ? error.message : error);
  } finally {
    syncing = false;
  }
}

console.log(`[workbook-sync] watching ${workbookPath}`);
await synchronize();
setInterval(synchronize, 750);
