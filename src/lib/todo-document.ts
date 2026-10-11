export type TodoDocument = { id: string; title: string; category: string };
export function validateDocumentId(id: string): string {
  if (typeof id !== "string" || id.length > 1000 || (id && (!id.endsWith(".md") || id.startsWith("/") || /[\\\x00-\x1f:#?]/.test(id) || id.split("/").some((part) => !part || part === "." || part === "..")))) throw new Error("请选择知识库中的有效文档");
  return id;
}
export function todoDocumentHref(id: string): string { validateDocumentId(id); return `/wiki?target=${encodeURIComponent(id)}&from=tasks`; }
export function documentLabel(id: string): string { return id.split("/").pop()?.replace(/\.md$/, "") || id; }
