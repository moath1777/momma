import { spawn } from "node:child_process";

const children = [];
const app = spawn(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "dev:app"], {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit",
  windowsHide: true,
  shell: process.platform === "win32",
});
const watcher = spawn(process.execPath, ["--experimental-strip-types", "scripts/watch-workbook.mjs"], {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit",
  windowsHide: true,
});
children.push(app, watcher);

function stop() {
  for (const child of children) {
    if (!child.killed) child.kill();
  }
}

app.on("exit", (code) => { stop(); process.exit(code ?? 0); });
watcher.on("exit", (code) => {
  if (code && code !== 0) console.error(`[workbook-sync] watcher stopped (${code})`);
});
process.on("SIGINT", () => { stop(); process.exit(0); });
process.on("SIGTERM", () => { stop(); process.exit(0); });
