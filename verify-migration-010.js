#!/usr/bin/env node

/**
 * Verification script for Migration 010: Add enrichment fields to prospects
 *
 * This script checks that all required columns were added to the prospects table.
 *
 * Usage:
 *   node verify-migration-010.js
 */

const { createClient } = require('@supabase/supabase-js');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !url.startsWith('https://')) {
  console.error('Error: NEXT_PUBLIC_SUPABASE_URL is not set');
  process.exit(1);
}

if (!serviceRoleKey) {
  console.error('Error: SUPABASE_SERVICE_ROLE_KEY is not set');
  process.exit(1);
}

const client = createClient(url, serviceRoleKey);

const REQUIRED_COLUMNS = ['fit_score', 'pain_signal', 'enrichment_status', 'enriched_at'];

async function verifyMigration() {
  console.log('Verifying Migration 010: Add enrichment fields to prospects');
  console.log('');

  try {
    // Check if the enrichment_status column exists by querying the table
    // We'll do this by attempting to select one row and checking if the column exists
    const { data, error } = await client
      .from('prospects')
      .select('enrichment_status')
      .limit(1);

    if (error) {
      if (error.message.includes('undefined column')) {
        console.error('✗ Migration failed: enrichment_status column does not exist');
        console.error('  Error:', error.message);
        process.exit(1);
      }
      // Other errors might be permission-related, continue anyway
    }

    // Try to query all enrichment-related columns
    const { data: fullData, error: fullError } = await client
      .from('prospects')
      .select('id, fit_score, pain_signal, enrichment_status, enriched_at')
      .limit(1);

    if (fullError) {
      console.error('✗ Error querying enrichment columns:', fullError.message);
      process.exit(1);
    }

    console.log('✓ All enrichment columns are present in the prospects table');
    console.log('');
    console.log('Column summary:');
    console.log('  - fit_score: INTEGER');
    console.log('  - pain_signal: TEXT');
    console.log('  - enrichment_status: TEXT (default: "pending")');
    console.log('  - enriched_at: TIMESTAMPTZ');
    console.log('');

    // Check enrichment status distribution
    const { data: statusData, error: statusError } = await client
      .from('prospects')
      .select('enrichment_status');

    if (!statusError && statusData && statusData.length > 0) {
      const statusCounts = {};
      statusData.forEach(row => {
        const status = row.enrichment_status || 'null';
        statusCounts[status] = (statusCounts[status] || 0) + 1;
      });

      console.log('Enrichment status distribution:');
      Object.entries(statusCounts).forEach(([status, count]) => {
        console.log(`  - ${status}: ${count} prospects`);
      });
      console.log('');
    }

    console.log('✓ Migration 010 successfully verified!');
    process.exit(0);
  } catch (err) {
    console.error('✗ Verification failed:', err.message);
    process.exit(1);
  }
}

verifyMigration();
