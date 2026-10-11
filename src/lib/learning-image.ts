import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { LearningImage } from "./learning-input";

export function decodeLearningImage(image: LearningImage) {
  const match = image.data.match(/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/);
  if (!match || image.data.length > 5_600_000) throw new Error("请上传 4MB 以内的 PNG 或 JPG 文字截图");
  const bytes = Buffer.from(match[2], "base64");
  const png = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const jpg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (bytes.length > 4_194_304 || !(match[1] === "png" ? png : jpg)) throw new Error("图片内容或格式不正确");
  return { bytes, extension: match[1] === "png" ? ".png" : ".jpg" };
}
export async function readLearningImage(image: LearningImage) {
  if (process.platform !== "win32") throw new Error("图片识别目前使用本机 Windows OCR；请粘贴识别后的文字");
  const { bytes, extension } = decodeLearningImage(image);
  const directory = path.resolve("data", "learning", "images");
  await fs.mkdir(directory, { recursive: true });
  // Immutable source copy; original name is never used as a filesystem path.
  const filename = path.join(directory, randomUUID() + extension);
  await fs.writeFile(filename, bytes, { flag: "wx" });
  try {
    const { stdout } = await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-File", path.resolve("scripts/learning-ocr.ps1"), "-ImagePath", filename], { timeout: 45_000, maxBuffer: 500_000, windowsHide: true, encoding: "utf8" });
    if (stdout.trim().length < 30) throw new Error("识别的文字少于 30 字，请上传清晰文字截图或直接粘贴正文");
    return stdout.trim().replace(/(?<=\p{Script=Han})[ \t]+(?=\p{Script=Han})/gu, "");
  } catch (error) {
    if (error instanceof Error && /少于/.test(error.message)) throw error;
    throw new Error("图片 OCR 失败，请上传更清晰的 PNG/JPG 或直接粘贴文字（可能缺少系统 OCR 语言包）");
  }
}
