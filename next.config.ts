import path from "node:path";
import type { NextConfig } from "next";

// 云端构建（npm run build:cloud）通过 NEXT_PUBLIC_CLOUD=1 切换为静态导出，
// 并把 @/lib/api-entry 别名到云端实现，确保 server-only 代码不进入浏览器包。
const isCloud = process.env.NEXT_PUBLIC_CLOUD === "1";

const nextConfig: NextConfig = {
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
  ...(isCloud
    ? {
        output: "export" as const,
        basePath: process.env.NEXT_PUBLIC_BASE_PATH || "",
        trailingSlash: Boolean(process.env.NEXT_PUBLIC_BASE_PATH),
        distDir: ".next-cloud",
        typescript: { tsconfigPath: "tsconfig.cloud.json" },
        images: { unoptimized: true },
        turbopack: {
          resolveAlias: {
            "@/lib/api-entry": path.resolve("./src/lib/api-entry.cloud.ts"),
          },
        },
        webpack: (config: { resolve: { alias: Record<string, string> } }) => {
          config.resolve.alias["@/lib/api-entry"] = path.resolve("./src/lib/api-entry.cloud.ts");
          return config;
        },
      }
    : {}),
};

export default nextConfig;
