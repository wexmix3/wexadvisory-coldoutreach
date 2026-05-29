#!/usr/bin/env node

/**
 * Apply Migration 010: Add enrichment fields to prospects
 *
 * This script applies the migration via the Supabase Management API.
 *
 * Requirements:
 *   - SUPABASE_ACCESS_TOKEN environment variable must be set
 *   - Token must have access to project 'idxuiibqevvbdiluxoth'
 *
 * To get your access token:
 *   1. Go to https://app.supabase.com/account/tokens
 *   2. Create a new token or copy an existing one
 *   3. Set the environment variable:
 *      - Windows (PowerShell): $env:SUPABASE_ACCESS_TOKEN = "your-token-here"
 *      - macOS/Linux: export SUPABASE_ACCESS_TOKEN="your-token-here"
 *   4. Run this script: node apply-migration.js
 *
 * Usage:
 *   node apply-migration.js
 */

const fs = require('fs');
const path = require('path');

const projectRef = 'idxuiibqevvbdiluxoth';
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;

// Read the migration SQL file
const migrationPath = path.join(__dirname, 'migrations', '010_enrichment.sql');
const migrationSql = fs.readFileSync(migrationPath, 'utf-8');

console.log('Migration 010: Add enrichment fields to prospects');
console.log('================================================\n');

if (!accessToken) {
  console.error('ERROR: SUPABASE_ACCESS_TOKEN environment variable is not set.');
  console.error('');
  console.error('To get your access token:');
  console.error('1. Go to https://app.supabase.com/account/tokens');
  console.error('2. Create a new token or copy an existing one');
  console.error('3. Set the environment variable:');
  console.error('');
  console.error('   Windows (PowerShell):');
  console.error('     $env:SUPABASE_ACCESS_TOKEN = "your-token-here"');
  console.error('');
  console.error('   macOS/Linux (bash/zsh):');
  console.error('     export SUPABASE_ACCESS_TOKEN="your-token-here"');
  console.error('');
  console.error('4. Run this script again: node apply-migration.js');
  process.exit(1);
}

console.log('Configuration:');
console.log(`  Project Ref: ${projectRef}`);
console.log(`  Access Token: ${accessToken.substring(0, 10)}...`);
console.log('');

console.log('Migration SQL:');
console.log('─'.repeat(60));
console.log(migrationSql);
console.log('─'.repeat(60));
console.log('');

console.log('Applying migration...');
console.log('');

fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ query: migrationSql }),
})
  .then((res) => {
    console.log(`API Response Status: ${res.status} ${res.statusText}`);
    console.log('');
    return res.json();
  })
  .then((data) => {
    if (data.error) {
      console.error('✗ API Error:');
      console.error(JSON.stringify(data.error, null, 2));
      process.exit(1);
    }

    if (data.message && data.message.includes('error')) {
      console.error('✗ Migration Error:');
      console.error(JSON.stringify(data, null, 2));
      process.exit(1);
    }

    console.log('✓ Migration applied successfully!');
    console.log('');
    console.log('Response Data:');
    if (Array.isArray(data)) {
      console.log(`  Affected rows: ${data.length}`);
      if (data.length > 0) {
        console.log('  First row:', JSON.stringify(data[0], null, 2));
      }
    } else {
      console.log(JSON.stringify(data, null, 2));
    }
    console.log('');
    console.log('Next steps:');
    console.log('  1. Verify the migration applied correctly:');
    console.log('     node verify-migration-010.js');
    console.log('  2. Update your application to use the new columns');
    console.log('  3. Test the enrichment feature in your app');
  })
  .catch((err) => {
    console.error('✗ Request Error:', err.message);
    process.exit(1);
  });
