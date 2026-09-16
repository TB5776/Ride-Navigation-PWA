# Ride Navigation

A portrait-first PWA for bike and scooter riders that uses real GPS and Mapbox navigation services when configured.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- `pnpm --filter @workspace/ride-navigation run dev` — run the Ride Navigation PWA

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

Ride Navigation is intentionally focused on a reliable first milestone: actual location, speed, Mapbox search/routing, route progress, settings, device capability reporting, and installable PWA behavior. Computer vision and safety perception are reserved for a later phase.

## User preferences

- Do not invent GPS data, map content, route geometry, telemetry, or AI detections when an external service or browser capability is unavailable.

## Gotchas

- Mapbox is a client-side external dependency configured through `artifacts/ride-navigation/.env.local` using `VITE_MAPBOX_TOKEN`; missing configuration must remain an explicit UI state.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
