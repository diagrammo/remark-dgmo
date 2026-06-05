import { describe, it, expect } from 'vitest';
import { parseFenceMeta } from '../src/fence-meta.js';

describe('parseFenceMeta', () => {
  it('returns empty for null/undefined/empty', () => {
    expect(parseFenceMeta(null)).toEqual({});
    expect(parseFenceMeta(undefined)).toEqual({});
    expect(parseFenceMeta('')).toEqual({});
  });

  it('parses bare mode flags', () => {
    expect(parseFenceMeta('showcase')).toEqual({ mode: 'showcase' });
    expect(parseFenceMeta('diagram')).toEqual({ mode: 'diagram' });
  });

  it('parses key=value pairs', () => {
    expect(parseFenceMeta('palette=catppuccin theme=light')).toEqual({
      palette: 'catppuccin',
      theme: 'light',
    });
  });

  it('rejects invalid theme values', () => {
    expect(parseFenceMeta('theme=neon')).toEqual({});
  });

  it('rejects invalid mode= values', () => {
    expect(parseFenceMeta('mode=ricochet')).toEqual({});
  });

  it('parses quoted titles with spaces', () => {
    expect(parseFenceMeta('showcase title="Login flow"')).toEqual({
      mode: 'showcase',
      title: 'Login flow',
    });
  });

  it('parses boolean overrides', () => {
    expect(parseFenceMeta('showcase showSource=false showCopy=false')).toEqual({
      mode: 'showcase',
      showSource: false,
      showCopy: false,
    });
  });

  it('parses negative bare flags', () => {
    expect(parseFenceMeta('showcase noCopy noOpenInEditor')).toEqual({
      mode: 'showcase',
      showCopy: false,
      showOpenInEditor: false,
    });
  });

  it('combines flags and pairs in any order', () => {
    expect(
      parseFenceMeta(
        'palette=gruvbox showcase title="My Diagram" theme=dark noCopy'
      )
    ).toEqual({
      palette: 'gruvbox',
      mode: 'showcase',
      title: 'My Diagram',
      theme: 'dark',
      showCopy: false,
    });
  });

  it('parses colorMode= override', () => {
    expect(parseFenceMeta('colorMode=light')).toEqual({ colorMode: 'light' });
    expect(parseFenceMeta('colorMode=dark')).toEqual({ colorMode: 'dark' });
    expect(parseFenceMeta('colorMode=auto')).toEqual({ colorMode: 'auto' });
  });

  it('rejects invalid colorMode= values', () => {
    expect(parseFenceMeta('colorMode=sepia')).toEqual({});
  });
});
