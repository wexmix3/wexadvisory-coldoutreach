# Migration 010: Add Enrichment Fields to Prospects

This migration adds enrichment tracking columns to the `prospects` table to support AI-driven prospect enrichment features.

## What's Being Added

The migration adds four new columns to the `prospects` table:

- `fit_score` (INTEGER) - Numerical score indicating fit quality (0-100 range, pending)
- `pain_signal` (TEXT) - Description of pain signals identified in the prospect
- `enrichment_status` (TEXT) - Status of enrichment: 'pending', 'in_progress', 'done', 'failed'
- `enriched_at` (TIMESTAMPTZ) - Timestamp when enrichment was completed

**Note:** Prospects that already have a `custom_intro` field (populated from previous manual generations) are automatically marked as `enrichment_status = 'done'` with `enriched_at = NOW()`.

## How to Apply

### Option 1: Using Supabase Dashboard (Recommended)

1. Go to https://app.supabase.com/project/idxuiibqevvbdiluxoth
2. Navigate to SQL Editor
3. Create a new query and paste the contents of `migrations/010_enrichment.sql`
4. Click "Execute"

### Option 2: Using Supabase CLI

First, get your access token:

1. Go to https://app.supabase.com/account/tokens
2. Create a new token or copy an existing one

Then run:

```bash
# Windows (PowerShell)
$env:SUPABASE_ACCESS_TOKEN = "your-token-here"
node apply-migration.js

# Or macOS/Linux
export SUPABASE_ACCESS_TOKEN="your-token-here"
node apply-migration.js
```

### Option 3: Using npm script (if configured)

```bash
npm run migrate:010
```

## Migration SQL

```sql
-- Migration 010: Add enrichment fields to prospects
ALTER TABLE prospects
  ADD COLUMN IF NOT EXISTS fit_score INTEGER,
  ADD COLUMN IF NOT EXISTS pain_signal TEXT,
  ADD COLUMN IF NOT EXISTS enrichment_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS enriched_at TIMESTAMPTZ;

-- Prospects that already have a custom_intro are already enriched (via manual generate)
UPDATE prospects
  SET enrichment_status = 'done', enriched_at = NOW()
  WHERE custom_intro IS NOT NULL AND custom_intro != '';
```

## Verification

To verify the migration applied successfully, run the verification script:

```bash
node verify-migration-010.js
```

Expected output:
```
Prospects table columns include:
  - fit_score
  - pain_signal
  - enrichment_status
  - enriched_at
  
✓ Migration 010 successfully applied!
```

## Rollback (if needed)

If you need to rollback, run:

```sql
ALTER TABLE prospects
  DROP COLUMN IF EXISTS fit_score,
  DROP COLUMN IF EXISTS pain_signal,
  DROP COLUMN IF EXISTS enrichment_status,
  DROP COLUMN IF EXISTS enriched_at;
```

## Related Files

- Migration SQL: `migrations/010_enrichment.sql`
- Application helper: `apply-migration.js`
- Verification script: `verify-migration-010.js`
