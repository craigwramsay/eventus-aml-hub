/**
 * Replace paraphrased excerpts with verbatim text from raw extracts.
 *
 * Usage: npx tsx scripts/replace-excerpts.ts [--dry]
 */

import * as fs from 'fs';
import * as path from 'path';

const EXCERPTS_DIR = path.resolve(__dirname, '../sources/external/excerpts');
const EXTRACTED_DIR = path.resolve(__dirname, '../sources/sources_external/extracted');

// Mapping: excerpt filename → raw extract filename
const EXCERPT_TO_RAW: Record<string, string> = {
  // FATF
  'fatf-black-list-2025.txt': 'fatf-black-list-2025.txt',
  'fatf-grey-list-2025.txt': 'fatf-grey-list-2025.txt',
  // Rule B9
  'lss-rule-b9.txt': 'rule-b9.txt',
  // MLR 2017
  'mlr2017-reg5-beneficial-ownership-corporates.txt': 'mlr2017-reg5.txt',
  'mlr2017-reg6-beneficial-ownership-trusts.txt': 'mlr2017-reg6.txt',
  'mlr2017-reg12-scope.txt': 'mlr2017-reg12.txt',
  'mlr2017-reg18-risk-assessment.txt': 'mlr2017-reg18.txt',
  'mlr2017-reg19-policies-controls.txt': 'mlr2017-reg19.txt',
  'mlr2017-reg21-internal-controls.txt': 'mlr2017-reg21.txt',
  'mlr2017-reg27-when-cdd-applies.txt': 'mlr2017-reg27.txt',
  'mlr2017-reg28-cdd.txt': 'mlr2017-reg28.txt',
  'mlr2017-reg30-timing-verification.txt': 'mlr2017-reg30.txt',
  'mlr2017-reg31-failure-to-complete-cdd.txt': 'mlr2017-reg31.txt',
  'mlr2017-reg33-edd.txt': 'mlr2017-reg33.txt',
  'mlr2017-reg35-pep-edd.txt': 'mlr2017-reg35.txt',
  'mlr2017-reg37-simplified-dd.txt': 'mlr2017-reg37.txt',
  'mlr2017-reg40-record-keeping.txt': 'mlr2017-reg40.txt',
  'mlr2017-reg86-criminal-offence.txt': 'mlr2017-reg86.txt',
  // POCA 2002
  'poca2002-s327-concealing.txt': 'poca2002-s327.txt',
  'poca2002-s328-arrangements.txt': 'poca2002-s328.txt',
  'poca2002-s329-acquisition.txt': 'poca2002-s329.txt',
  'poca2002-s330-failure-to-disclose.txt': 'poca2002-s330.txt',
  'poca2002-s333a-tipping-off.txt': 'poca2002-s333A.txt',
  'poca2002-s335-consent-regime.txt': 'poca2002-s335.txt',
  'poca2002-s340-definitions.txt': 'poca2002-s340.txt',
  // NRA & Scottish
  'nra2025-legal-sector-response.txt': 'nra2025-legal-sector.txt',
  'scottish-sectoral-risk-2022.txt': 'scottish-sectoral-risk-key-findings.txt',
  // LSAG small sections
  'lsag2025-s5-delivery-channel.txt': 'lsag2025-delivery-channel.txt',
  'lsag2025-s5-geographic-risk.txt': 'lsag2025-geographic-risk.txt',
  'lsag2025-s6-ongoing-monitoring.txt': 'lsag2025-ongoing-monitoring.txt',
  'lsag2025-s6-source-of-funds.txt': 'lsag2025-source-of-funds.txt',
};

function cleanRawText(text: string, source: string): string {
  // Remove multi-line "Changes to legislation:" blocks (legislation.gov.uk boilerplate)
  // POCA blocks end with "View outstanding changes" (which comes AFTER "See end of Document")
  // MLR blocks end with "(See end of Document for details)" only
  // Try the longer match first (View outstanding changes), then fall back to shorter
  text = text.replace(
    /Changes to legislation:[\s\S]*?View outstanding changes\n?/g,
    ''
  );
  // Catch any remaining MLR-style blocks that end earlier
  text = text.replace(
    /Changes to legislation:[\s\S]*?\(See end of Document for details\)\n?/g,
    ''
  );

  let lines = text.split('\n');

  // Legislation.gov.uk common: Remove "Document Generated:" lines
  if (source.startsWith('poca2002') || source.startsWith('mlr2017')) {
    lines = lines.filter((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('Document Generated:')) return false;
      return true;
    });
  }

  // POCA-specific: Remove repeated header/footer blocks
  if (source.startsWith('poca2002')) {
    lines = lines.filter((line) => {
      const trimmed = line.trim();
      if (trimmed === 'Proceeds of Crime Act 2002 (c. 29)') return false;
      if (/^Part \d+ [–—-] /.test(trimmed)) return false;
      if (/^Chapter \d+ [–—-] /.test(trimmed)) return false;
      // Standalone page numbers (3+ digit numbers alone on a line)
      if (/^\d{3,}$/.test(trimmed)) return false;
      return true;
    });
  }

  // MLR-specific: Remove legislation.gov.uk boilerplate
  if (source.startsWith('mlr2017')) {
    lines = lines.filter((line) => {
      const trimmed = line.trim();
      if (/^The Money Laundering.*Regulations 2017$/.test(trimmed)) return false;
      // Standalone page numbers (1-3 digits)
      if (/^\d{1,3}$/.test(trimmed)) return false;
      return true;
    });
  }

  // FATF: Strip "Note:" attribution lines (from our compiled extracts)
  if (source.startsWith('fatf-')) {
    lines = lines.filter((line) => {
      if (line.startsWith('Note: Content compiled from')) return false;
      return true;
    });
  }

  // Universal: Remove standalone page numbers (1-3 digits on their own line)
  // These appear in LSAG, NRA, and Scottish PDF extracts
  if (source.startsWith('lsag2025') || source.startsWith('nra2025') || source.startsWith('scottish')) {
    lines = lines.filter((line) => {
      const trimmed = line.trim();
      if (/^\d{1,3}$/.test(trimmed)) return false;
      return true;
    });
  }

  // General: collapse 3+ consecutive blank lines into 2
  let result = lines.join('\n');
  result = result.replace(/\n{4,}/g, '\n\n\n');

  // Trim trailing whitespace
  result = result.trimEnd();

  return result;
}

function extractFrontmatter(content: string): { frontmatter: string; body: string } {
  const match = content.match(/^(---\n[\s\S]*?\n---)\n([\s\S]*)$/);
  if (!match) {
    throw new Error('No frontmatter found');
  }
  return { frontmatter: match[1], body: match[2] };
}

function main() {
  const dryRun = process.argv.includes('--dry');

  let processed = 0;
  let skipped = 0;
  let errors = 0;

  for (const [excerptFile, rawFile] of Object.entries(EXCERPT_TO_RAW)) {
    const excerptPath = path.join(EXCERPTS_DIR, excerptFile);
    const rawPath = path.join(EXTRACTED_DIR, rawFile);

    // Check files exist
    if (!fs.existsSync(excerptPath)) {
      console.error(`  SKIP: Excerpt not found: ${excerptFile}`);
      skipped++;
      continue;
    }
    if (!fs.existsSync(rawPath)) {
      console.error(`  SKIP: Raw extract not found: ${rawFile}`);
      skipped++;
      continue;
    }

    try {
      const excerptContent = fs.readFileSync(excerptPath, 'utf-8');
      const rawContent = fs.readFileSync(rawPath, 'utf-8');

      const { frontmatter } = extractFrontmatter(excerptContent);
      const cleanedRaw = cleanRawText(rawContent, rawFile);

      const newContent = `${frontmatter}\n${cleanedRaw}\n`;

      if (dryRun) {
        const oldSize = excerptContent.length;
        const newSize = newContent.length;
        console.log(`  ${excerptFile}: ${oldSize} → ${newSize} bytes (${rawFile})`);
      } else {
        fs.writeFileSync(excerptPath, newContent, 'utf-8');
        console.log(`  ✓ ${excerptFile} (from ${rawFile})`);
      }
      processed++;
    } catch (err) {
      console.error(`  ERROR: ${excerptFile}: ${(err as Error).message}`);
      errors++;
    }
  }

  console.log(`\n${dryRun ? 'DRY RUN' : 'DONE'}: ${processed} processed, ${skipped} skipped, ${errors} errors`);
}

main();
