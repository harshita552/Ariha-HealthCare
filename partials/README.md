# Shared components

## Footer

`footer.html` is the single source of truth for the site footer.

**To change the footer:**

1. Edit `partials/footer.html`
2. Run:

```bash
node tools/sync-footer.js
```

3. Commit the changed pages along with the partial.

The script writes the footer into all six pages, so the HTML files stay
complete and standalone — they open correctly with Live Server and Netlify
needs no build step. Relative paths are rewritten per page depth, so
`services/adolescent-health-care.html` gets `../` prefixes automatically.

Running it twice is safe; it reports `ok` for pages already up to date.

**Do not edit the footer directly in a page** — the next sync will overwrite it.

### Adding a new page

Add its path to the `PAGES` array in `tools/sync-footer.js`. Pages in a
subdirectory are handled automatically.

### Why not a build step or JS include?

- A JS include would keep the footer out of the initial HTML, which hurts SEO
  and causes a visible flash before it appears.
- A build step would mean the repo's HTML no longer matches what ships, and
  Netlify's deploy would depend on it running correctly.

Writing real HTML into each page avoids both, at the cost of remembering to
run the script.
