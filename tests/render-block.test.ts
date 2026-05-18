import { describe, it, expect } from 'vitest';
import { renderDgmoBlock } from '../src/render-block.js';

const SAMPLE = `chart: sequence
A -> B
B -> C`;

describe('renderDgmoBlock (single-render path, colorMode: light)', () => {
  it('renders simple diagram mode by default', async () => {
    const { html } = await renderDgmoBlock(SAMPLE, null, {
      colorMode: 'light',
    });
    expect(html).toContain('dgmo--diagram');
    expect(html).toContain('<svg');
    expect(html).not.toContain('dgmo-pre');
    expect(html).not.toContain('dgmo-copy');
    expect(html).not.toContain('dgmo-open');
    expect(html).not.toContain('dgmo-light');
    expect(html).not.toContain('dgmo-dark');
  });

  it('renders showcase mode with source + copy + editor link', async () => {
    const { html } = await renderDgmoBlock(SAMPLE, 'showcase', {
      colorMode: 'light',
    });
    expect(html).toContain('dgmo--showcase');
    expect(html).toContain('dgmo-pre');
    expect(html).toContain('dgmo-copy');
    expect(html).toContain('dgmo-open');
    expect(html).toContain('online.diagrammo.app');
  });

  it('respects integration default mode = showcase', async () => {
    const { html } = await renderDgmoBlock(SAMPLE, null, {
      mode: 'showcase',
      colorMode: 'light',
    });
    expect(html).toContain('dgmo--showcase');
  });

  it('per-block diagram override beats integration showcase default', async () => {
    const { html } = await renderDgmoBlock(SAMPLE, 'diagram', {
      mode: 'showcase',
      colorMode: 'light',
    });
    expect(html).toContain('dgmo--diagram');
    expect(html).not.toContain('dgmo--showcase');
  });

  it('per-block title renders as caption', async () => {
    const { html } = await renderDgmoBlock(
      SAMPLE,
      'showcase title="Login flow"',
      { colorMode: 'light' }
    );
    expect(html).toContain('<figcaption');
    expect(html).toContain('Login flow');
  });

  it('per-block palette override changes resulting svg', async () => {
    const a = await renderDgmoBlock(SAMPLE, 'palette=nord', {
      colorMode: 'light',
    });
    const b = await renderDgmoBlock(SAMPLE, 'palette=dracula', {
      colorMode: 'light',
    });
    expect(a.html).not.toEqual(b.html);
  });

  it('escapes title HTML', async () => {
    const { html } = await renderDgmoBlock(
      SAMPLE,
      'showcase title="<script>x</script>"',
      { colorMode: 'light' }
    );
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('honors noOpenInEditor', async () => {
    const { html } = await renderDgmoBlock(SAMPLE, 'showcase noOpenInEditor', {
      colorMode: 'light',
    });
    expect(html).not.toContain('dgmo-open');
  });

  it('honors noSource (showcase without source listing)', async () => {
    const { html } = await renderDgmoBlock(SAMPLE, 'showcase noSource', {
      colorMode: 'light',
    });
    expect(html).toContain('dgmo--showcase');
    expect(html).not.toContain('dgmo-pre');
    expect(html).not.toContain('dgmo-toolbar');
  });

  it('uses custom editorBaseUrl', async () => {
    const { html } = await renderDgmoBlock(SAMPLE, 'showcase', {
      colorMode: 'light',
      editorBaseUrl: 'https://example.test/editor',
    });
    expect(html).toContain('https://example.test/editor');
  });

  it('returns parser diagnostics for unparsable input', async () => {
    const { html } = await renderDgmoBlock('totally not a diagram', null, {
      colorMode: 'light',
    });
    expect(html).toContain('dgmo--diagram');
  });
});

// AC-RD6: legacy class-name appending
describe('renderDgmoBlock — legacyClassNames (AC-RD6)', () => {
  it('appends legacy names to outer wrapper in plain mode', async () => {
    const { html } = await renderDgmoBlock(SAMPLE, null, {
      colorMode: 'light',
      legacyClassNames: ['astro-dgmo'],
    });
    expect(html).toContain('class="dgmo dgmo--diagram astro-dgmo"');
  });

  it('appends legacy names to outer wrapper and inner card in showcase mode', async () => {
    const { html } = await renderDgmoBlock(SAMPLE, 'showcase', {
      colorMode: 'light',
      legacyClassNames: ['astro-dgmo', 'astro-dgmo-card'],
    });
    // outer wrapper has both legacy entries appended after dgmo--showcase
    expect(html).toContain('dgmo--showcase astro-dgmo astro-dgmo-card');
    // inner card has the same legacy entries appended after dgmo-card
    expect(html).toContain('dgmo-card astro-dgmo astro-dgmo-card');
  });

  it('default behavior (no legacyClassNames) emits only new dgmo-* class names', async () => {
    const { html } = await renderDgmoBlock(SAMPLE, null, {
      colorMode: 'light',
    });
    expect(html).not.toContain('astro-dgmo');
    expect(html).toContain('dgmo--diagram');
  });
});
