# CLAUDE.md

## Project: Startup Runway Dashboard (Ephemeral Financial Data)

Single Next.js 15 app (App Router) with SQLite (better-sqlite3 + Drizzle ORM).
Tailwind CSS for styling. Recharts for charts. No separate backend.

## CRITICAL RULE: No Financial Data on Disk
- The CSV file must NEVER be written to disk. Use `request.formData()` + `arrayBuffer()` — file stays as Buffer in RAM only.
- Individual transactions must NEVER be stored in SQLite or any file.
- Only anonymous monthly aggregates, vendor aliases, and category splits are persisted.
- After computing aggregates, set the transaction array to null and let it be garbage collected.
- No payee names, IBANs, payer names, or individual amounts are ever written anywhere.

## Commands
- `npm run dev` — start dev server (localhost:3000)
- `npm run build` — production build
- `npm run db:push` — apply schema changes to SQLite

## Code Style
- TypeScript strict mode, no `any` types
- Use Next.js App Router conventions (app/ directory, server components by default)
- Mark client components with "use client" only when needed (charts, forms, interactivity)

## Data Flow
1. User uploads CSV → API route receives it as FormData → Buffer (never hits disk)
2. Parse Buffer into array of transaction objects (in memory only)
3. Pass array to aggregator: compute monthly summaries, vendor aggregates, category splits
4. Write ONLY the aggregates to SQLite
5. Set the transaction array to null — done
6. Dashboard pages read from the aggregates in SQLite

## Database
- SQLite file at `data/runway.db` (auto-created on first run, gitignored)
- Schema in `lib/schema.ts` — contains ONLY: monthly_summaries, vendors, category_splits, scenarios, upload_log, users
- There is NO transactions table

## CSV Format (Revolut Business)
- 28 columns, comma-delimited, UTF-8 with BOM
- Key columns: 0=date, 2=UUID, 3=type, 4=state, 5=description, 7=payer, 14=amount, 16=exchange rate, 19=balance, 20=account currency, 25=MCC
- Skip rows where type=EXCHANGE or state≠COMPLETED
- Convert all amounts to EUR as base currency

## Charts
- Use Recharts (installed)
- Colors: green #22c55e, red #ef4444, yellow #eab308
- All charts are client components ("use client")

## Auth
- iron-session for encrypted HTTP-only cookies (8-hour expiry)
- bcryptjs for password hashing
- SESSION_SECRET must be set in .env.local (32+ char string)
- Owner role: upload + delete data; Viewer: read-only dashboard

## Testing
- `npm run build` to verify no errors
- After uploading a CSV, run: `sqlite3 data/runway.db ".tables"` — should show only: monthly_summaries vendors category_splits scenarios upload_log users
- Confirm no real payee names appear anywhere in the UI or database
