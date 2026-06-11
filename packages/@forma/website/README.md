# @forma/website

Static Vite/React site for `forma-lang.com`.

## Local

```sh
pnpm --filter @forma/website dev
pnpm --filter @forma/website test
pnpm --filter @forma/website build
pnpm --filter @forma/website exec wrangler deploy --dry-run
```

The demo compiler runs entirely in the browser through `src/engine/worker.ts`.
Share state is encoded in the URL with `step`, `src`, `sel`, and optional
`embed=1`.

## Cloudflare Deploy

`wrangler.jsonc` uses Workers static assets with SPA fallback:

```jsonc
{
  "name": "forma-website",
  "main": "./src/worker.ts",
  "assets": {
    "binding": "ASSETS",
    "directory": "./dist",
    "html_handling": "none",
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/", "/about", "/demo", "/demo/*"]
  }
}
```

`src/worker.ts` runs only for document routes and injects route-specific
`<title>`, description, and Open Graph tags before returning the SPA shell.
Hashed JavaScript, CSS, images, and worker assets are still served directly by
the static asset handler.

For local deployment, authenticate Wrangler and run:

```sh
pnpm --filter @forma/website exec wrangler login
pnpm --filter @forma/website exec wrangler whoami
pnpm deploy:forma
```

Alternatively, set `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` in the
shell before running `pnpm deploy:forma`.

For GitHub deployment, configure repository secrets:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

The workflow at `.github/workflows/forma-website.yml` builds and dry-runs on PRs,
then deploys on `main`.

Attach `forma-lang.com` as a custom domain to the `forma-website` Worker in the
Cloudflare dashboard after the first successful deploy. Keep the DNS zone and
Worker in the same Cloudflare account as `CLOUDFLARE_ACCOUNT_ID`.
