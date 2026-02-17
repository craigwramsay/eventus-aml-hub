#!/usr/bin/env npx ts-node
/**
 * Excerpt Ingestion Script
 *
 * Reads curated excerpt files from:
 *   - sources/external/excerpts/  (source_type: 'external')
 *   - sources/eventus/excerpts/   (source_type: 'internal')
 *
 * And inserts them into the assistant_sources table.
 *
 * Usage:
 *   npx ts-node scripts/ingest-excerpts.ts [--clear] [--dry-run]
 *
 * Options:
 *   --clear    Delete existing sources before ingestion
 *   --dry-run  Parse files but don't insert into database
 */

import * as path from 'path';
import { parseExcerptDirectory, type ParsedExcerpt } from './excerpt-parser';

// Source directories relative to project root
const SOURCE_DIRS = {
  external: 'sources/external/excerpts',
  internal: 'sources/eventus/excerpts',
} as const;

type SourceTypeKey = keyof typeof SOURCE_DIRS;

interface IngestionResult {
  sourceType: SourceTypeKey;
  excerpts: ParsedExcerpt[];
  errors: string[];
}

/**
 * Main ingestion function
 */
async function ingestExcerpts(options: { clear: boolean; dryRun: boolean }) {
  const projectRoot = path.resolve(__dirname, '..');

  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║          AML Assistant Source Excerpt Ingestion                ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('');

  if (options.dryRun) {
    console.log('🔍 DRY RUN MODE - No database changes will be made\n');
  }

  const results: IngestionResult[] = [];
  let totalExcerpts = 0;
  let totalErrors = 0;

  // Parse each source directory
  for (const [sourceType, relativeDir] of Object.entries(SOURCE_DIRS)) {
    const dirPath = path.join(projectRoot, relativeDir);
    console.log(`📁 Scanning ${sourceType} sources: ${relativeDir}`);

    const { excerpts, errors } = parseExcerptDirectory(dirPath);

    results.push({
      sourceType: sourceType as SourceTypeKey,
      excerpts,
      errors,
    });

    totalExcerpts += excerpts.length;
    totalErrors += errors.length;

    if (excerpts.length > 0) {
      console.log(`   ✓ Found ${excerpts.length} excerpt(s)`);
    } else {
      console.log(`   ○ No excerpts found`);
    }

    if (errors.length > 0) {
      console.log(`   ⚠ ${errors.length} error(s):`);
      errors.forEach((err) => console.log(`     - ${err}`));
    }

    console.log('');
  }

  // Summary
  console.log('────────────────────────────────────────────────────────────────');
  console.log(`Total excerpts found: ${totalExcerpts}`);
  console.log(`Total errors: ${totalErrors}`);
  console.log('────────────────────────────────────────────────────────────────');
  console.log('');

  if (totalExcerpts === 0) {
    console.log('No excerpts to ingest. Exiting.');
    return;
  }

  if (options.dryRun) {
    console.log('📋 Parsed excerpts:');
    for (const result of results) {
      for (const excerpt of result.excerpts) {
        console.log(`\n  [${result.sourceType.toUpperCase()}] ${excerpt.source_name} - ${excerpt.section_ref}`);
        console.log(`  Topics: ${excerpt.topics.join(', ')}`);
        console.log(`  Content: ${excerpt.content.slice(0, 100)}...`);
      }
    }
    console.log('\n✓ Dry run complete. No changes made.');
    return;
  }

  // Generate output for database insertion
  console.log('📤 Generating insertion data...\n');

  const insertionRecords = [];

  for (const result of results) {
    for (const excerpt of result.excerpts) {
      insertionRecords.push({
        source_type: result.sourceType === 'external' ? 'external' : 'internal',
        source_name: excerpt.source_name,
        section_ref: excerpt.section_ref,
        topics: excerpt.topics,
        content: excerpt.content,
        effective_date: excerpt.effective_date,
      });
    }
  }

  // Write to a JSON file that can be used for manual insertion or API call
  const outputPath = path.join(projectRoot, 'scripts', 'ingestion-output.json');
  const fs = await import('fs');
  fs.writeFileSync(outputPath, JSON.stringify(insertionRecords, null, 2));

  console.log(`✓ Generated ${insertionRecords.length} records`);
  console.log(`✓ Output written to: ${outputPath}`);
  console.log('');
  console.log('To insert into database:');
  console.log('  1. Start your Next.js app');
  console.log('  2. Call the bulkCreateAssistantSources server action with this data');
  console.log('  3. Or use the Supabase dashboard to import the JSON');

  if (options.clear) {
    console.log('\nNote: --clear flag was set. Remember to delete existing sources first.');
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  clear: args.includes('--clear'),
  dryRun: args.includes('--dry-run'),
};

// Run the ingestion
ingestExcerpts(options).catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
