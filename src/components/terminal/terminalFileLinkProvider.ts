import type { IBufferLine, ILink, ILinkProvider, Terminal } from '@xterm/xterm';
import { findTerminalFileLinks, hasCommonFileExtension } from './terminalFiles';

const MAX_LOGICAL_LINE_LENGTH = 2048;

function windowedLineStrings(lineIndex: number, terminal: Terminal): [string[], number] {
  let line: IBufferLine | undefined;
  let topIndex = lineIndex;
  let bottomIndex = lineIndex;
  let length = 0;
  let content = '';
  const lines: string[] = [];

  line = terminal.buffer.active.getLine(lineIndex);
  if (!line) return [lines, topIndex];
  const current = line.translateToString(true);

  if (line.isWrapped && current[0] !== ' ') {
    while ((line = terminal.buffer.active.getLine(--topIndex)) && length < MAX_LOGICAL_LINE_LENGTH) {
      content = line.translateToString(true);
      length += content.length;
      lines.push(content);
      if (!line.isWrapped || content.includes(' ')) break;
    }
    lines.reverse();
  }

  lines.push(current);
  length = 0;
  while ((line = terminal.buffer.active.getLine(++bottomIndex)) && line.isWrapped && length < MAX_LOGICAL_LINE_LENGTH) {
    content = line.translateToString(true);
    length += content.length;
    lines.push(content);
    if (content.includes(' ')) break;
  }
  return [lines, topIndex];
}

/** Maps a JavaScript string offset back to xterm's 0-based buffer cell. */
function mapStringIndex(terminal: Terminal, lineIndex: number, rowIndex: number, stringIndex: number): [number, number] {
  const buffer = terminal.buffer.active;
  const cell = buffer.getNullCell();
  let start = rowIndex;
  while (stringIndex) {
    const line = buffer.getLine(lineIndex);
    if (!line) return [-1, -1];
    for (let column = start; column < line.length; column += 1) {
      line.getCell(column, cell);
      const chars = cell.getChars();
      const width = cell.getWidth();
      if (width) {
        stringIndex -= chars.length || 1;
        // Correct for a wide character split across the physical wrap edge.
        if (column === line.length - 1 && chars === '') {
          const nextLine = buffer.getLine(lineIndex + 1);
          if (nextLine?.isWrapped) {
            nextLine.getCell(0, cell);
            if (cell.getWidth() === 2) stringIndex += 1;
          }
        }
      }
      if (stringIndex < 0) return [lineIndex, column];
    }
    lineIndex += 1;
    start = 0;
  }
  return [lineIndex, start];
}

function hardWrappedFileLink(
  terminal: Terminal,
  firstLineIndex: number,
  secondLineIndex: number,
  onPath: (path: string) => void,
): ILink | null {
  const firstLine = terminal.buffer.active.getLine(firstLineIndex);
  const secondLine = terminal.buffer.active.getLine(secondLineIndex);
  if (!firstLine || !secondLine || secondLine.isWrapped) return null;

  const firstText = firstLine.translateToString(true);
  if (firstText.length < terminal.cols - 2) return null;
  const firstLink = findTerminalFileLinks(firstText).reverse().find((link) => link.end === firstText.length && !hasCommonFileExtension(link.path));
  if (!firstLink) return null;

  const secondText = secondLine.translateToString(true);
  const leadingSpaces = secondText.length - secondText.trimStart().length;
  const secondTrimmed = secondText.slice(leadingSpaces);
  const secondLink = findTerminalFileLinks(secondTrimmed).find((link) => link.start === 0);
  if (!secondLink) return null;

  const path = firstLink.path + secondLink.path;
  if (!hasCommonFileExtension(path)) return null;
  const [startY, startX] = mapStringIndex(terminal, firstLineIndex, 0, firstLink.start);
  const [endY, endX] = mapStringIndex(terminal, secondLineIndex, 0, leadingSpaces + secondLink.end);
  if (startY < 0 || startX < 0 || endY < 0 || endX < 0) return null;
  return {
    text: path,
    range: {
      start: { x: startX + 1, y: startY + 1 },
      end: { x: endX, y: endY + 1 },
    },
    decorations: { pointerCursor: true, underline: true },
    activate: () => onPath(path),
  };
}

export function createTerminalFileLinkProvider(terminal: Terminal, onPath: (path: string) => void): ILinkProvider {
  return {
    provideLinks(bufferLineNumber, callback) {
      const [lines, startLineIndex] = windowedLineStrings(bufferLineNumber - 1, terminal);
      const text = lines.join('');
      if (!text) {
        callback(undefined);
        return;
      }
      const ordinaryLinks: ILink[] = findTerminalFileLinks(text).flatMap((link) => {
        const [startY, startX] = mapStringIndex(terminal, startLineIndex, 0, link.start);
        const [endY, endX] = mapStringIndex(terminal, startLineIndex, 0, link.end);
        if (startY < 0 || startX < 0 || endY < 0 || endX < 0) return [];
        if (bufferLineNumber < startY + 1 || bufferLineNumber > endY + 1) return [];
        return [{
          text: link.path,
          range: {
            start: { x: startX + 1, y: startY + 1 },
            end: { x: endX, y: endY + 1 },
          },
          decorations: { pointerCursor: true, underline: true },
          activate: () => onPath(link.path),
        }];
      });
      const lineIndex = bufferLineNumber - 1;
      const hardLinks = [
        hardWrappedFileLink(terminal, lineIndex - 1, lineIndex, onPath),
        hardWrappedFileLink(terminal, lineIndex, lineIndex + 1, onPath),
      ].filter((link): link is ILink => link !== null);
      const links = [
        ...hardLinks,
        ...ordinaryLinks.filter((ordinary) => !hardLinks.some((hard) => hard.text.startsWith(ordinary.text) || hard.text.endsWith(ordinary.text))),
      ];
      callback(links.length ? links : undefined);
    },
  };
}
