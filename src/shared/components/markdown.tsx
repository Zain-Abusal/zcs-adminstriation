import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Tiny markdown renderer for database-editable blog / docs / changelog / legal copy.
 * Supports: #/##/### headings (with inline formatting inside), - and 1. lists,
 * > quotes, ```fenced code```, `inline code`, **bold**, *italic*, [links](url),
 * ![images](url), --- rules, and paragraphs.
 * Inline constructs nest into each other in both directions:
 *   [![img](src)](href)        → image inside a link
 *   **bold [link](url) text**  → link inside bold (same for *italic*)
 * URLs may contain balanced parentheses (Wikipedia-style) and an optional
 * quoted "title" (e.g. [text](url "title")). Malformed constructs fall back to
 * plain text instead of leaking raw markdown everywhere.
 * Deliberately does NOT render raw HTML. Content is escaped by React.
 */

type InlineToken =
  | { kind: "code"; start: number; end: number; value: string }
  | { kind: "bold"; start: number; end: number; value: string }
  | { kind: "italic"; start: number; end: number; value: string }
  | {
      kind: "link";
      start: number;
      end: number;
      label: string;
      href: string;
      title?: string | undefined;
    }
  | {
      kind: "image";
      start: number;
      end: number;
      alt: string;
      src: string;
      title?: string | undefined;
    };

/** Characters that can open an inline token, used to skip literal runs fast. */
const TOKEN_START = /[!`*[]/;

/** Schemes that must never end up in an href/src. `data:image/…` is image-only. */
const UNSAFE_SCHEME = /^\s*(?:javascript|vbscript|data):/i;

function safeUrl(url: string, isImage: boolean): string | null {
  const trimmed = url.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;
  if (UNSAFE_SCHEME.test(trimmed) && !(isImage && /^data:image\//i.test(trimmed))) {
    return null;
  }
  return trimmed;
}

/**
 * Returns the inline token starting exactly at `start`, or null when the
 * character does not open a complete token (the caller then treats it as text).
 */
function findToken(text: string, start: number): InlineToken | null {
  const ch = text[start];
  if (ch === "`") {
    const end = text.indexOf("`", start + 1);
    if (end > start + 1) {
      return { kind: "code", start, end: end + 1, value: text.slice(start + 1, end) };
    }
    return null;
  }
  if (ch === "*") {
    if (text[start + 1] === "*") {
      // "***bold italic***" → italic wrapping bold.
      if (text[start + 2] === "*") {
        const close = text.indexOf("***", start + 3);
        if (close !== -1) {
          return {
            kind: "italic",
            start,
            end: close + 3,
            value: `**${text.slice(start + 3, close)}**`,
          };
        }
      }
      const end = text.indexOf("**", start + 2);
      if (end !== -1) {
        return { kind: "bold", start, end: end + 2, value: text.slice(start + 2, end) };
      }
      return null;
    }
    const end = text.indexOf("*", start + 1);
    if (end > start + 1) {
      return { kind: "italic", start, end: end + 1, value: text.slice(start + 1, end) };
    }
    return null;
  }
  const isImage = ch === "!" && text[start + 1] === "[";
  if (ch !== "[" && !isImage) return null;

  // Label: scan to the matching "]" while allowing nested bracket levels so
  // [Evidence [Bot]](url) and [![img](src)](url) both parse.
  let depth = 1;
  let i = start + (isImage ? 2 : 1);
  while (i < text.length) {
    const c = text[i];
    if (c === "[") {
      depth += 1;
    } else if (c === "]") {
      depth -= 1;
      if (depth === 0) break;
    }
    i += 1;
  }
  if (i >= text.length || text[i + 1] !== "(") return null;
  const label = text.slice(start + (isImage ? 2 : 1), i);

  // Destination: balanced "(…)" pairs belong to the URL (Wikipedia-style);
  // otherwise the URL ends at whitespace or the closing ")".
  let j = i + 2;
  let dest = "";
  let parenDepth = 0;
  while (j < text.length) {
    const c = text[j];
    if (c === " " || c === "\t") break;
    if (c === "(") {
      parenDepth += 1;
    } else if (c === ")") {
      if (parenDepth === 0) break;
      parenDepth -= 1;
    }
    dest += c;
    j += 1;
  }
  // Optional quoted title between the destination and the closing paren:
  // [text](url "title"). The plain case is just [text](url).
  let end = -1;
  let title: string | undefined;
  const withTitle = /^\s+"([^"]*)"\s*\)/.exec(text.slice(j));
  if (withTitle) {
    title = withTitle[1];
    end = j + withTitle[0].length;
  } else {
    const plain = /^\s*\)/.exec(text.slice(j));
    if (plain) end = j + plain[0].length;
  }
  if (end === -1) return null;

  const url = safeUrl(dest, isImage);
  if (!url) return null;
  return isImage
    ? { kind: "image", start, end, alt: label, src: url, title }
    : { kind: "link", start, end, label, href: url, title };
}

/**
 * Renders one line's inline markdown to React nodes. Nesting recurses back into
 * here, so links render inside bold/italic and images render inside links.
 */
function inline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  let i = 0;
  let n = 0;
  while (i < text.length) {
    const token = findToken(text, i);
    if (token) {
      const key = `${keyPrefix}-${n++}`;
      if (token.kind === "code") {
        out.push(
          <code
            key={key}
            className="mono rounded-md border-2 border-hairline bg-secondary px-1.5 py-0.5 text-[0.85em] font-bold"
          >
            {token.value}
          </code>,
        );
      } else if (token.kind === "bold") {
        out.push(
          <strong key={key} className="font-bold text-foreground">
            {inline(token.value, key)}
          </strong>,
        );
      } else if (token.kind === "italic") {
        out.push(<em key={key}>{inline(token.value, key)}</em>);
      } else if (token.kind === "image") {
        out.push(
          <img
            key={key}
            src={token.src}
            alt={token.alt}
            {...(token.title ? { title: token.title } : {})}
            loading="lazy"
            decoding="async"
            className="my-1 inline-block max-w-full rounded-[10px] border-2 border-ink align-middle"
          />,
        );
      } else {
        const external = /^https?:/i.test(token.href);
        out.push(
          <a
            key={key}
            href={token.href}
            {...(token.title ? { title: token.title } : {})}
            {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
            className="font-bold text-foreground underline decoration-accent decoration-2 underline-offset-2 hover:decoration-lime"
          >
            {inline(token.label, key)}
          </a>,
        );
      }
      i = token.end;
      continue;
    }
    // Literal run: fast-forward to the next char that could open a token.
    let next = i + 1;
    while (next < text.length && !TOKEN_START.test(text[next]!)) next += 1;
    out.push(text.slice(i, next));
    i = next;
  }
  return out;
}

export function slugifyHeading(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

/**
 * Plain text behind inline markdown, used for heading anchors and the
 * "On this page" nav so `## See [Label](url)` shows/lists as `See Label`.
 */
function stripInlineMarkdown(text: string) {
  return text
    .replace(/!\[([^[]*)]\(([^)]*)\)/g, "$1")
    .replace(/\[([^[]*)]\(([^)]*)\)/g, "$1")
    .replace(/[*`]/g, "")
    .trim();
}

export function extractHeadings(markdown: string) {
  return markdown
    .split("\n")
    .filter((l) => /^#{2,3}\s/.test(l))
    .map((l) => {
      const level = l.startsWith("###") ? 3 : 2;
      const text = stripInlineMarkdown(l.replace(/^#{2,3}\s+/, ""));
      return { level, text, id: slugifyHeading(text) };
    });
}

export function Markdown({ source, className }: { source: string; className?: string }) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let code: { lang: string; lines: string[] } | null = null;
  let key = 0;

  const flushList = () => {
    if (!list) return;
    const items = list.items.map((item, idx) => (
      <li key={idx} className="pl-1">
        {inline(item, `li-${key}-${idx}`)}
      </li>
    ));
    blocks.push(
      list.ordered ? (
        <ol key={`b${key++}`} className="my-4 ml-5 list-decimal space-y-2 text-muted-foreground">
          {items}
        </ol>
      ) : (
        <ul key={`b${key++}`} className="my-4 ml-5 list-disc space-y-2 text-muted-foreground">
          {items}
        </ul>
      ),
    );
    list = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (line.trim().startsWith("```")) {
      if (code) {
        blocks.push(
          <pre
            key={`b${key++}`}
            className="mono my-5 overflow-x-auto rounded-[14px] border-2 border-ink bg-ink p-4 text-xs leading-relaxed text-ink-foreground shadow-pop-sm"
          >
            <code>{code.lines.join("\n")}</code>
          </pre>,
        );
        code = null;
      } else {
        flushList();
        code = { lang: line.trim().slice(3), lines: [] };
      }
      continue;
    }
    if (code) {
      code.lines.push(raw);
      continue;
    }

    if (!line.trim()) {
      flushList();
      continue;
    }

    if (/^---+$/.test(line.trim())) {
      flushList();
      blocks.push(<hr key={`b${key++}`} className="my-8 border-t-2 border-hairline" />);
      continue;
    }

    // Standalone image line: ![alt](url "optional caption")
    const image = /^!\[([^\]]*)\]\((\S+?)(?:\s+"([^"]*)")?\)$/.exec(line.trim());
    if (image) {
      flushList();
      const caption = image[3] ?? "";
      blocks.push(
        <figure key={`b${key++}`} className="my-6">
          <img
            src={image[2]!}
            alt={image[1] ?? ""}
            loading="lazy"
            decoding="async"
            className="w-full rounded-[14px] border-2 border-ink shadow-pop-sm"
          />
          {caption ? (
            <figcaption className="mono mt-2 text-center text-[11px] text-muted-foreground">
              {caption}
            </figcaption>
          ) : null}
        </figure>,
      );
      continue;
    }

    // Standalone linked image: [![alt](src "caption")](href "title")
    const linkedImage =
      /^\[!\[([^\]]*)\]\((\S+?)(?:\s+"([^"]*)")?\)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)$/.exec(
        line.trim(),
      );
    if (linkedImage) {
      flushList();
      const href = linkedImage[4]!;
      const external = /^https?:/i.test(href);
      blocks.push(
        <figure key={`b${key++}`} className="my-6">
          <a
            href={href}
            {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
            {...(linkedImage[5] ? { title: linkedImage[5] } : {})}
          >
            <img
              src={linkedImage[2]!}
              alt={linkedImage[1] ?? ""}
              loading="lazy"
              decoding="async"
              className="w-full rounded-[14px] border-2 border-ink shadow-pop-sm"
            />
          </a>
          {linkedImage[3] ? (
            <figcaption className="mono mt-2 text-center text-[11px] text-muted-foreground">
              {linkedImage[3]}
            </figcaption>
          ) : null}
        </figure>,
      );
      continue;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      flushList();
      const level = heading[1]!.length;
      const text = heading[2]!.trim();
      const id = slugifyHeading(stripInlineMarkdown(text));
      if (level === 1) {
        blocks.push(
          <h2
            key={`b${key++}`}
            id={id}
            className="display-xl mt-12 scroll-mt-28 border-b-2 border-hairline pb-2 text-2xl first:mt-0"
          >
            {inline(text, `h${key}`)}
          </h2>,
        );
      } else if (level === 2) {
        blocks.push(
          <h2
            key={`b${key++}`}
            id={id}
            className="display-xl mt-12 scroll-mt-28 border-b-2 border-hairline pb-2 text-2xl first:mt-0"
          >
            {inline(text, `h${key}`)}
          </h2>,
        );
      } else {
        blocks.push(
          <h3 key={`b${key++}`} id={id} className="mt-8 scroll-mt-28 text-lg font-bold">
            {inline(text, `h${key}`)}
          </h3>,
        );
      }
      continue;
    }

    if (line.trim().startsWith("> ")) {
      flushList();
      blocks.push(
        <blockquote
          key={`b${key++}`}
          className="my-5 rounded-[14px] border-2 border-ink bg-soft-yellow p-4 text-sm font-medium shadow-pop-sm"
        >
          {inline(line.trim().slice(2), `q${key}`)}
        </blockquote>,
      );
      continue;
    }

    const bullet = /^[-*]\s+(.*)$/.exec(line.trim());
    if (bullet) {
      if (!list || list.ordered) {
        flushList();
        list = { ordered: false, items: [] };
      }
      list.items.push(bullet[1]!);
      continue;
    }

    const ordered = /^\d+[.)]\s+(.*)$/.exec(line.trim());
    if (ordered) {
      if (!list || !list.ordered) {
        flushList();
        list = { ordered: true, items: [] };
      }
      list.items.push(ordered[1]!);
      continue;
    }

    flushList();
    blocks.push(
      <p key={`b${key++}`} className="my-4 leading-relaxed text-muted-foreground">
        {inline(line, `p${key}`)}
      </p>,
    );
  }
  flushList();
  if (code) {
    blocks.push(
      <pre
        key={`b${key++}`}
        className="mono my-5 overflow-x-auto rounded-[14px] border-2 border-ink bg-ink p-4 text-xs text-ink-foreground"
      >
        <code>{code.lines.join("\n")}</code>
      </pre>,
    );
  }

  return <div className={cn("text-[15px]", className)}>{blocks}</div>;
}
