#!/usr/bin/env node
/*
 * Single source of truth for the site footer.
 *
 *   Edit  partials/footer.html
 *   Run   node tools/sync-footer.js
 *
 * Every page gets the updated footer written straight into it, so the HTML
 * files stay complete and standalone - they open correctly with Live Server
 * and need no build step on Netlify. Relative paths are rewritten per page
 * depth, so pages inside services/ get ../ prefixes automatically.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PARTIAL = path.join(ROOT, 'partials', 'footer.html');
const OPEN_TAG = '<section class="footer nav-light section-2 section-3"';

const PAGES = [
  'index.html',
  'about-us.html',
  'contact-us.html',
  'blogs.html',
  'second-trimester-what-to-expect.html',
  'puberty-in-girls-whats-normal.html',
  'vaginal-delivery-or-c-section.html',
  path.join('services', 'adolescent-health-care.html'),
  path.join('services', 'pre-pregnancy-care.html'),
  path.join('services', 'obstetrics-maternity-care.html'),
  path.join('services', 'pcos-hormonal-health.html'),
  path.join('services', 'menopause-care.html'),
  path.join('services', 'gynecology-care.html'),
  path.join('services', 'laparoscopy.html')
];

// Finds the footer <section> and its matching close, counting nested sections.
function findFooter(html) {
  const start = html.indexOf(OPEN_TAG);
  if (start < 0) return null;

  const re = /<\/?section\b/gi;
  re.lastIndex = start;
  let depth = 0;
  let m;
  while ((m = re.exec(html))) {
    if (m[0][1] === '/') {
      depth--;
      if (depth === 0) {
        const gt = html.indexOf('>', re.lastIndex);
        return { start, end: gt + 1 };
      }
    } else {
      depth++;
    }
  }
  return null;
}

// Rewrites relative href/src values for a page nested `depth` folders deep.
function applyDepth(footer, depth) {
  if (depth === 0) return footer;
  const prefix = '../'.repeat(depth);
  return footer.replace(/(href|src|srcset)="([^"]*)"/gi, (full, attr, value) => {
    if (attr.toLowerCase() === 'srcset') {
      const rewritten = value
        .split(',')
        .map(part => {
          const bits = part.trim().split(/\s+/);
          if (!bits[0] || !isRelative(bits[0])) return part.trim();
          bits[0] = prefix + bits[0];
          return bits.join(' ');
        })
        .join(', ');
      return `${attr}="${rewritten}"`;
    }
    if (!isRelative(value)) return full;
    return `${attr}="${prefix}${value}"`;
  });
}

function isRelative(value) {
  return !/^(https?:|\/\/|\/|#|tel:|mailto:|data:|javascript:)/i.test(value);
}

function main() {
  if (!fs.existsSync(PARTIAL)) {
    console.error('Missing partials/footer.html');
    process.exit(1);
  }
  const partial = fs.readFileSync(PARTIAL, 'utf8').trim();

  let changed = 0;
  let unchanged = 0;
  for (const page of PAGES) {
    const file = path.join(ROOT, page);
    const html = fs.readFileSync(file, 'utf8');
    const range = findFooter(html);
    if (!range) {
      console.error(`  SKIP  ${page} - no footer section found`);
      process.exitCode = 1;
      continue;
    }
    const depth = page.split(/[\\/]/).length - 1;
    const footer = applyDepth(partial, depth);
    const current = html.slice(range.start, range.end);
    if (current === footer) {
      unchanged++;
      console.log(`  ok    ${page}`);
      continue;
    }
    fs.writeFileSync(file, html.slice(0, range.start) + footer + html.slice(range.end));
    changed++;
    console.log(`  wrote ${page}`);
  }
  console.log(`\n${changed} updated, ${unchanged} already current`);
}

main();
