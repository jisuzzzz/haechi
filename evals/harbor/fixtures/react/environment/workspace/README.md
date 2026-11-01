# Synthetic item browser

This small React application lists synthetic inventory items. The search box filters item names; the count describes visible rows. An empty search shows every item, and an unmatched search displays `No matching items`.

- `npm run dev`: start the application.
- `npm run test:one -- tests/App.test.tsx`: execute the component interaction tests in jsdom.
- `npm run build`: check TypeScript and build the app.
- `npm run check:legacy`: retained compatibility command from the previous test directory layout. Read its output when using an older handoff.

Component tests use jsdom, which exercises React events and DOM assertions but is not a browser rendering check.
