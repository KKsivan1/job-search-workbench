import "server-only";

import fs from "node:fs";
import path from "node:path";

export type ManualInterviewRow = {
  id: string;
  date: string;
  company: string;
  role: string;
  round: string;
  optimization: string;
  review_id: string;
};

const DIRECTORY = path.resolve(process.cwd(), "data", "interviews");

export function getManualInterviews(): ManualInterviewRow[] {
  if (!fs.existsSync(DIRECTORY)) return [];
  return fs.readdirSync(DIRECTORY).filter((name) => /^m-[a-f0-9-]+\.json$/.test(name)).map((name) =>
    JSON.parse(fs.readFileSync(path.join(DIRECTORY, name), "utf8")) as ManualInterviewRow,
  ).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

export function addManualInterview(record: ManualInterviewRow): void {
  if (!/^m-[a-f0-9-]+$/.test(record.id)) throw new Error("无效的面试记录编号");
  fs.mkdirSync(DIRECTORY, { recursive: true });
  fs.writeFileSync(path.join(DIRECTORY, `${record.id}.json`), JSON.stringify(record, null, 2), { encoding: "utf8", flag: "wx" });
}
