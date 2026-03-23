import type { ReactNode } from 'react';

const URL_PATTERN = '(?:https?:\\/\\/|mailto:|tel:)[^\\s)]+';

function renderInlineMarkdown(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = new RegExp(
    `(\\[([^\\]]+)\\](\\((${URL_PATTERN})\\))|(${URL_PATTERN})|\\\`([^\\\`]+)\\\`|\\*\\*([^*]+)\\*\\*|\\*([^*]+)\\*)`,
  );
  let rest = text;
  let index = 0;

  while (rest.length > 0) {
    const match = rest.match(pattern);
    if (!match || match.index === undefined) {
      nodes.push(rest);
      break;
    }
    if (match.index > 0) {
      nodes.push(rest.slice(0, match.index));
    }

    if (match[2] && match[4]) {
      nodes.push(
        <a
          key={`${keyPrefix}-link-${index}`}
          href={match[4]}
          target="_blank"
          rel="noreferrer"
          className="text-canvas-accent underline underline-offset-2"
          onClick={(e) => e.stopPropagation()}
        >
          {match[2]}
        </a>,
      );
    } else if (match[5]) {
      nodes.push(
        <a
          key={`${keyPrefix}-raw-link-${index}`}
          href={match[5]}
          target="_blank"
          rel="noreferrer"
          className="text-canvas-accent underline underline-offset-2"
          onClick={(e) => e.stopPropagation()}
        >
          {match[5]}
        </a>,
      );
    } else if (match[6]) {
      nodes.push(
        <code
          key={`${keyPrefix}-code-${index}`}
          className="px-1.5 py-0.5 rounded bg-canvas-bg border border-canvas-border text-canvas-accent font-mono text-[0.95em]"
        >
          {match[6]}
        </code>,
      );
    } else if (match[7]) {
      nodes.push(<strong key={`${keyPrefix}-strong-${index}`} className="font-semibold text-white">{match[7]}</strong>);
    } else if (match[8]) {
      nodes.push(<em key={`${keyPrefix}-em-${index}`} className="italic text-canvas-text">{match[8]}</em>);
    }

    rest = rest.slice(match.index + match[0].length);
    index += 1;
  }

  return nodes;
}

export default function MarkdownPreview({ content }: { content: string }) {
  const lines = content.split('\n');
  const blocks: ReactNode[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) continue;

    if (trimmed.startsWith('```')) {
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i += 1;
      }
      blocks.push(
        <pre key={`code-${i}`} className="rounded-lg border border-canvas-border bg-canvas-bg p-3 overflow-x-auto text-xs text-canvas-text font-mono">
          <code>{codeLines.join('\n')}</code>
        </pre>,
      );
      continue;
    }

    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      const className =
        level === 1
          ? 'text-xl font-semibold text-white'
          : level === 2
            ? 'text-lg font-semibold text-white'
            : 'text-base font-semibold text-white';
      blocks.push(
        <div key={`heading-${i}`} className={className}>
          {renderInlineMarkdown(heading[2], `heading-${i}`)}
        </div>,
      );
      continue;
    }

    if (/^>\s?/.test(trimmed)) {
      const quoteLines = [trimmed.replace(/^>\s?/, '')];
      while (i + 1 < lines.length && /^>\s?/.test(lines[i + 1].trim())) {
        i += 1;
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
      }
      blocks.push(
        <blockquote key={`quote-${i}`} className="border-l-2 border-canvas-accent pl-3 text-canvas-muted italic">
          {quoteLines.map((quoteLine, idx) => (
            <p key={`quote-line-${idx}`}>{renderInlineMarkdown(quoteLine, `quote-${i}-${idx}`)}</p>
          ))}
        </blockquote>,
      );
      continue;
    }

    if (/^[-*+]\s+/.test(trimmed)) {
      const items: string[] = [trimmed.replace(/^[-*+]\s+/, '')];
      while (i + 1 < lines.length && /^[-*+]\s+/.test(lines[i + 1].trim())) {
        i += 1;
        items.push(lines[i].trim().replace(/^[-*+]\s+/, ''));
      }
      blocks.push(
        <ul key={`ul-${i}`} className="list-disc pl-5 text-sm text-canvas-text space-y-1">
          {items.map((item, idx) => (
            <li key={`ul-item-${idx}`}>{renderInlineMarkdown(item, `ul-${i}-${idx}`)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [trimmed.replace(/^\d+\.\s+/, '')];
      while (i + 1 < lines.length && /^\d+\.\s+/.test(lines[i + 1].trim())) {
        i += 1;
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ''));
      }
      blocks.push(
        <ol key={`ol-${i}`} className="list-decimal pl-5 text-sm text-canvas-text space-y-1">
          {items.map((item, idx) => (
            <li key={`ol-item-${idx}`}>{renderInlineMarkdown(item, `ol-${i}-${idx}`)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    const paragraphLines = [line];
    while (
      i + 1 < lines.length &&
      lines[i + 1].trim() &&
      !/^(#{1,3})\s+/.test(lines[i + 1].trim()) &&
      !/^>\s?/.test(lines[i + 1].trim()) &&
      !/^[-*+]\s+/.test(lines[i + 1].trim()) &&
      !/^\d+\.\s+/.test(lines[i + 1].trim()) &&
      !lines[i + 1].trim().startsWith('```')
    ) {
      i += 1;
      paragraphLines.push(lines[i]);
    }

    blocks.push(
      <p key={`p-${i}`} className="text-sm leading-6 text-canvas-text whitespace-pre-wrap">
        {renderInlineMarkdown(paragraphLines.join('\n'), `p-${i}`)}
      </p>,
    );
  }

  if (blocks.length === 0) {
    return <div className="text-sm text-canvas-muted">Nothing to preview yet.</div>;
  }

  return <div className="h-full overflow-auto rounded-lg border border-canvas-border bg-canvas-surface p-4 space-y-4">{blocks}</div>;
}
