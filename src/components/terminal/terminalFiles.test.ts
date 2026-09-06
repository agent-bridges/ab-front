import { describe, expect, it } from 'vitest';
import {
  attachmentPrompt,
  filePathAt,
  findTerminalFileLinks,
  hasCommonFileExtension,
  isPreviewableText,
  normalizePosixPath,
  resolveTerminalFilePath,
  safeUploadName,
} from './terminalFiles';

describe('terminal file links', () => {
  it('finds absolute, relative and common bare file names without stealing web URLs', () => {
    const line = 'see /apps/demo/a.png, ./notes.md and README.md but https://example.test/a.png';
    expect(findTerminalFileLinks(line).map((link) => link.path)).toEqual([
      '/apps/demo/a.png',
      './notes.md',
      'README.md',
    ]);
  });

  it('keeps spaces inside markdown and quoted paths', () => {
    const markdown = '[preview](/apps/demo/final image.png)';
    const quoted = 'open "/apps/demo/final image.png" now';
    expect(filePathAt(markdown, markdown.indexOf('final'))?.path).toBe('/apps/demo/final image.png');
    expect(filePathAt(quoted, quoted.indexOf('image'))?.path).toBe('/apps/demo/final image.png');
  });

  it('unescapes shell spaces and strips source line suffixes', () => {
    const line = '/apps/demo/final\\ image.ts:18:4';
    expect(filePathAt(line, 4)?.path).toBe('/apps/demo/final image.ts');
  });

  it('recognises source, configuration and extensionless project files as text', () => {
    expect(isPreviewableText('worker.py')).toBe(true);
    expect(isPreviewableText('config.toml')).toBe(true);
    expect(isPreviewableText('Dockerfile')).toBe(true);
    expect(isPreviewableText('archive.zip')).toBe(false);
  });

  it('recognises a complete file only after a hard-wrapped path suffix is joined', () => {
    expect(hasCommonFileExtension('/apps/demo/latest-cleaned-')).toBe(false);
    expect(hasCommonFileExtension('/apps/demo/latest-cleaned-' + '62969.png')).toBe(true);
  });
});

describe('terminal file exchange paths', () => {
  it('resolves paths against the live PTY working directory', () => {
    expect(resolveTerminalFilePath('./out/photo.png', '/apps/demo')).toBe('/apps/demo/out/photo.png');
    expect(resolveTerminalFilePath('../shared/a.pdf', '/apps/demo')).toBe('/apps/shared/a.pdf');
    expect(resolveTerminalFilePath('/absolute/a.txt', '/ignored')).toBe('/absolute/a.txt');
    expect(normalizePosixPath('~/a/../b')).toBe('~/b');
  });

  it('sanitizes upload names and builds one bracketed-paste prompt', () => {
    expect(safeUploadName('../../bad`name.png')).toBe('bad_name.png');
    expect(attachmentPrompt('inspect this', ['/apps/demo/.ab-uploads/a.png'])).toBe(
      'inspect this\n\nAttached file:\n- /apps/demo/.ab-uploads/a.png',
    );
  });
});
