# Repository guidelines

## Build and tests

- Use Node.js 22 and install from the lockfile with `npm ci`.
- Run `npm run check` and `npm run build` before handing off a change. There is no separate automated browser test suite yet.
- For Pages changes, verify that `dist/CNAME` contains exactly `lisetteenbjarty.nl`.

## UX

- Preserve names, Dutch copy, photos, routes, and visual design unless the task explicitly requests a change.
- Keep changes responsive, accessible by keyboard, and free of avoidable layout shifts.

## Safety

- Never run `npm run deploy`, modify or delete `gh-pages`, push commits, or change GitHub/Pages settings without explicit approval.
- Keep both `CNAME` files synchronized and never commit secrets, `.env` files, `node_modules`, or `dist`.
- Give workflows least privilege and pin third-party Actions to immutable commit SHAs.
- Keep RSVP fail-closed unless activation is explicitly approved. Never put raw invitation tokens in Git, Sheets, application/CI logs, or query strings; writer URLs, HMAC values, and Turnstile secrets also never belong in Git or `VITE_` variables.
- Do not deploy or reconfigure Cloudflare, Apps Script, Sheets, DNS, or mail as part of a code change; first show the tested diff and exact migration steps.
