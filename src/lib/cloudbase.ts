import cloudbase from "@cloudbase/js-sdk";

const env = process.env.NEXT_PUBLIC_CB_ENV;
const region = process.env.NEXT_PUBLIC_CB_REGION || "ap-shanghai";
const accessKey = process.env.NEXT_PUBLIC_CB_ACCESS_KEY;

if (!env || !accessKey) {
  throw new Error("缺少 CloudBase 环境配置（NEXT_PUBLIC_CB_ENV / NEXT_PUBLIC_CB_ACCESS_KEY），请使用 npm run build:cloud 构建。");
}

export const cbApp = cloudbase.init({
  env,
  region,
  accessKey,
  auth: { detectSessionInUrl: true },
});

export const cbAuth = cbApp.auth;
export const db = cbApp.database();
