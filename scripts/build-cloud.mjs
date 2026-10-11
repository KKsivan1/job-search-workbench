import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, copyFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const configPath = path.resolve(root, "cloud.config.json");
const local = existsSync(configPath) ? JSON.parse(readFileSync(configPath, "utf8")) : {};
const config = {
  env: process.env.NEXT_PUBLIC_CB_ENV || local.env,
  region: process.env.NEXT_PUBLIC_CB_REGION || local.region || "ap-shanghai",
  accessKey: process.env.NEXT_PUBLIC_CB_ACCESS_KEY || local.accessKey,
};

for (const key of ["env", "region", "accessKey"]) {
  if (!config[key]) {
    console.error(`缺少云端构建配置：${key}。请设置 NEXT_PUBLIC_CB_* 环境变量或本地 cloud.config.json。`);
    process.exit(1);
  }
}

const env = {
  ...process.env,
  NEXT_PUBLIC_CLOUD: "1",
  NEXT_PUBLIC_CB_ENV: config.env,
  NEXT_PUBLIC_CB_REGION: config.region,
  NEXT_PUBLIC_CB_ACCESS_KEY: config.accessKey,
};

console.log(`[build:cloud] env=${config.env} region=${config.region}`);
// Stage the cloud entry physically: bundler aliases can leave local Server
// Actions reachable, which static exports reject. Personal data is never copied.
const isSubpath = Boolean(process.env.NEXT_PUBLIC_BASE_PATH);
const staging = path.join(root, isSubpath ? ".cloud-build-tcb" : ".cloud-build");
function copyTree(source, target) {
  if (!statSync(source).isDirectory()) { copyFileSync(source, target); return; }
  mkdirSync(target, { recursive: true });
  for (const item of readdirSync(source)) copyTree(path.join(source, item), path.join(target, item));
}
mkdirSync(staging, { recursive: true });
for (const item of ["src", "next.config.ts", "next-env.d.ts", "tsconfig.json", "tsconfig.cloud.json", "package.json"]) {
  copyTree(path.join(root, item), path.join(staging, item));
}
writeFileSync(path.join(staging, "src/lib/api-entry.ts"), 'export { cloudApi as api } from "./cloud-api";\n');
const result = spawnSync(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "build", "--webpack"], {
  cwd: staging,
  stdio: "inherit",
  env,
});
if (result.status === 0) copyTree(path.join(staging, ".next-cloud"), path.join(root, isSubpath ? "out-cloudbase" : "out"));
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
