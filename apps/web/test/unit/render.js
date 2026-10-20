import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Test helper: render a React element to HTML, with no browser needed.
 *
 * Returns two things:
 *   html — the real HTML React produced (to check tags, classes, attributes)
 *   text — only the words a person would read on screen
 *
 * React adds invisible "<!-- -->" markers between pieces of text, so `text`
 * removes every tag and marker and turns HTML escape codes back into
 * characters. This is static rendering: clicks and typing are not simulated.
 */
export function render(element) {
  const html = renderToStaticMarkup(element);
  const text = html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'");
  return { html, text };
}

/** Shortcut so tests can write h(Component, props) instead of React.createElement. */
export const h = React.createElement;
