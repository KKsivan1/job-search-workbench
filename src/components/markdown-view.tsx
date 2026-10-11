"use client";

import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Part = { kind: "markdown"; text: string } | { kind: "callout"; title: string; tone: string; folded: boolean; text: string };

export function headingId(title: string): string {
  return title.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^\p{L}\p{N}_-]/gu, "");
}

function nodeText(children: ReactNode): string {
  if (typeof children === "string" || typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(nodeText).join("");
  if (children && typeof children === "object" && "props" in children) return nodeText((children as { props: { children?: ReactNode } }).props.children);
  return "";
}

function wikiLinks(text: string): string {
  return text.replace(/\[\[([^\]]+)\]\]/g, (_, value: string) => {
    const [target, label] = value.split("|");
    return `[${label || target.split("#")[0]}](/wiki?target=${encodeURIComponent(target)})`;
  });
}

function splitCallouts(text: string): Part[] {
  const lines = text.split(/\r?\n/);
  const parts: Part[] = [];
  let regular: string[] = [];
  const flush = () => {
    if (regular.length) parts.push({ kind: "markdown", text: regular.join("\n") });
    regular = [];
  };
  for (let index = 0; index < lines.length; index++) {
    const match = lines[index].match(/^>\s*\[!([\w-]+)\](-)?\s*(.*)$/);
    if (!match) { regular.push(lines[index]); continue; }
    flush();
    const body: string[] = [];
    while (index + 1 < lines.length && /^>/.test(lines[index + 1])) {
      index++;
      body.push(lines[index].replace(/^>\s?/, ""));
    }
    parts.push({ kind: "callout", tone: match[1], folded: Boolean(match[2]), title: match[3] || match[1], text: body.join("\n") });
  }
  flush();
  return parts;
}

function MarkdownBlock({ text }: { text: string }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
    a: ({ href, children }) => <a href={href} target={href?.startsWith("http") ? "_blank" : undefined} rel={href?.startsWith("http") ? "noreferrer" : undefined}>{children}</a>,
    h2: ({ children }) => <h2 id={headingId(nodeText(children))}>{children}</h2>,
    h3: ({ children }) => <h3 id={headingId(nodeText(children))}>{children}</h3>,
    h4: ({ children }) => <h4 id={headingId(nodeText(children))}>{children}</h4>,
  }}>{wikiLinks(text)}</ReactMarkdown>;
}

export function MarkdownView({ source, compact = false }: { source: string; compact?: boolean }) {
  return <div className={`markdown-body ${compact ? "compact" : ""}`}>
    {splitCallouts(source).map((part, index) => part.kind === "markdown"
      ? <MarkdownBlock key={index} text={part.text} />
      : <details key={index} className={`callout callout-${part.tone}`} open={!part.folded}>
          <summary>{part.title}</summary>
          <div><MarkdownBlock text={part.text} /></div>
        </details>)}
  </div>;
}
