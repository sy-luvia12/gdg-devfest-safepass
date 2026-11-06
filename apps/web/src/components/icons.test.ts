import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import * as icons from './icons';

describe('Nucleo Glass SVG', () => {
  it('keeps gradient, filter and mask references unique across repeated icons', () => {
    const all = [...Object.values(icons), icons.Calendar, icons.Calendar, icons.MapPin];
    const markup = renderToStaticMarkup(createElement(Fragment, null,
      ...all.map((Icon, index) => createElement(Icon, { key: index })),
    ));
    const ids = [...markup.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
    const references = [...markup.matchAll(/url\(#([^\s)"']+)/g)].map((match) => match[1]);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    const targets = new Set(ids);
    expect(references.filter((id) => !targets.has(id))).toEqual([]);
  });

  it('preserves accessible names, requested size and state color', () => {
    const markup = renderToStaticMarkup(createElement(icons.Check, {
      size: 20, 'aria-label': '인증 완료', className: 'text-success',
    }));
    expect(markup).toContain('role="img"');
    expect(markup).toContain('aria-label="인증 완료"');
    expect(markup).toContain('width="20"');
    expect(markup).toContain('--nc-gradient-1-color-1:currentColor');
    expect(markup).not.toContain('aria-hidden="true"');
  });
});
