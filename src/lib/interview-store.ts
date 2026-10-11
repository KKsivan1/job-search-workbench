import { getManualInterviews } from "./manual-interviews";
import { getInterviews, type Interview } from "./interviews";
import { readWikiDocument } from "./wiki";

export async function getAllInterviews(): Promise<Interview[]> {
  const wiki = await getInterviews();
  const manual: Interview[] = getManualInterviews().map((row) => ({
    id: row.id,
    date: row.date,
    company: row.company,
    role: row.role,
    round: row.round,
    confidence: "手动录入",
    reviewTitle: `${row.date} ${row.company} ${row.role}面试记录`,
    reviewId: row.review_id,
    optimization: row.optimization || "待整理",
    longTermLinks: [],
  }));
  return [...wiki, ...manual].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

export async function getStoredReview(id: string) {
  const interview = (await getAllInterviews()).find((item) => item.id === id);
  if (!interview?.reviewId) return null;
  return { interview, doc: await readWikiDocument(interview.reviewId) };
}
