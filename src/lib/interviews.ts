import { promises as fs } from "node:fs";
import path from "node:path";
import { MAPPING_ID, TIMELINE_ID, parseMapping, parseTimeline } from "./core";
import { WIKI_ROOT, findWikiDocument, readWikiDocument } from "./wiki";

export {
  canonicalCompany,
  canonicalRole,
  parseMapping,
  parseTimeline,
  PRACTICE_THEMES,
  getPracticeGroups,
  type Interview,
} from "./core";

export async function getInterviews() {
  const [timeline, mapping] = await Promise.all([
    fs.readFile(path.join(WIKI_ROOT, TIMELINE_ID), "utf8"),
    fs.readFile(path.join(WIKI_ROOT, MAPPING_ID), "utf8"),
  ]);
  const mapped = parseMapping(mapping);
  return Promise.all(parseTimeline(timeline).map(async (record) => {
    const extras = mapped.get(record.reviewTitle);
    return {
      ...record,
      reviewId: await findWikiDocument(record.reviewTitle),
      optimization: extras?.optimization ?? "待整理",
      longTermLinks: extras?.longTermLinks ?? [],
    };
  }));
}

export async function getInterview(id: string) {
  return (await getInterviews()).find((item) => item.id === id) ?? null;
}

export async function getReview(id: string) {
  const interview = await getInterview(id);
  if (!interview?.reviewId) return null;
  return { interview, doc: await readWikiDocument(interview.reviewId) };
}
