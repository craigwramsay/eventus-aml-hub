/**
 * Split large LSAG raw extracts into focused excerpt files with frontmatter.
 *
 * Usage: npx tsx scripts/split-lsag-excerpts.ts [--dry]
 */

import * as fs from 'fs';
import * as path from 'path';

const EXCERPTS_DIR = path.resolve(__dirname, '../sources/external/excerpts');
const EXTRACTED_DIR = path.resolve(__dirname, '../sources/sources_external/extracted');

interface SplitDef {
  /** Output excerpt filename */
  excerptFile: string;
  /** Source raw extract filename */
  rawFile: string;
  /** 1-based start line (inclusive) */
  startLine: number;
  /** 1-based end line (inclusive), 0 = end of file */
  endLine: number;
  /** YAML frontmatter fields */
  frontmatter: {
    source_name: string;
    section_ref: string;
    topics: string[];
    effective_date: string;
  };
}

const SPLITS: SplitDef[] = [
  // =============================================
  // CDD (lsag2025-cdd.txt, 85KB, 1651 lines)
  // =============================================
  {
    excerptFile: 'lsag2025-s6-cdd-overview.txt',
    rawFile: 'lsag2025-cdd.txt',
    startLine: 1,
    endLine: 385,
    frontmatter: {
      source_name: 'LSAG Sectoral Guidance 2025',
      section_ref: 's. 6.1-6.13',
      topics: ['cdd', 'due-diligence', 'verification', 'identity', 'legal-sector', 'timing', 'risk-based-approach'],
      effective_date: '2025-04-23',
    },
  },
  {
    excerptFile: 'lsag2025-s6-cdd-natural-persons.txt',
    rawFile: 'lsag2025-cdd.txt',
    startLine: 386,
    endLine: 518,
    frontmatter: {
      source_name: 'LSAG Sectoral Guidance 2025',
      section_ref: 's. 6.14-6.14.4',
      topics: ['cdd', 'verification', 'natural-persons', 'electronic-verification', 'identity-documents'],
      effective_date: '2025-04-23',
    },
  },
  {
    excerptFile: 'lsag2025-s6-cdd-verification.txt',
    rawFile: 'lsag2025-cdd.txt',
    startLine: 519,
    endLine: 728,
    frontmatter: {
      source_name: 'LSAG Sectoral Guidance 2025',
      section_ref: 's. 6.14.5-6.14.10',
      topics: ['cdd', 'verification', 'face-to-face', 'remote-clients', 'professionals', 'non-natural-persons'],
      effective_date: '2025-04-23',
    },
  },
  {
    excerptFile: 'lsag2025-s6-cdd-companies.txt',
    rawFile: 'lsag2025-cdd.txt',
    startLine: 729,
    endLine: 953,
    frontmatter: {
      source_name: 'LSAG Sectoral Guidance 2025',
      section_ref: 's. 6.14.11',
      topics: ['cdd', 'companies', 'corporate', 'public-companies', 'private-companies', 'overseas-entities', 'verification'],
      effective_date: '2025-04-23',
    },
  },
  {
    excerptFile: 'lsag2025-s6-cdd-other-entities.txt',
    rawFile: 'lsag2025-cdd.txt',
    startLine: 1252,
    endLine: 1387,
    frontmatter: {
      source_name: 'LSAG Sectoral Guidance 2025',
      section_ref: 's. 6.14.14-6.14.21',
      topics: ['cdd', 'foundations', 'charities', 'estates', 'clubs', 'government', 'churches', 'schools', 'entity-types'],
      effective_date: '2025-04-23',
    },
  },
  {
    excerptFile: 'lsag2025-s6-beneficial-ownership.txt',
    rawFile: 'lsag2025-cdd.txt',
    startLine: 1388,
    endLine: 0, // end of file
    frontmatter: {
      source_name: 'LSAG Sectoral Guidance 2025',
      section_ref: 's. 6.15-6.16',
      topics: ['cdd', 'beneficial-ownership', 'ubo', 'control', 'companies', 'trusts', 'verification'],
      effective_date: '2025-04-23',
    },
  },

  // =============================================
  // Corporate Structures (lsag2025-corporate-structures.txt, 29KB)
  // =============================================
  {
    excerptFile: 'lsag2025-s5-product-service-risk.txt',
    rawFile: 'lsag2025-corporate-structures.txt',
    startLine: 1,
    endLine: 163,
    frontmatter: {
      source_name: 'LSAG Sectoral Guidance 2025',
      section_ref: 's. 5.6.3',
      topics: ['risk-assessment', 'legal-sector', 'conveyancing', 'trusts', 'corporate-structures', 'client-account', 'product-service-risk'],
      effective_date: '2025-04-23',
    },
  },
  {
    excerptFile: 'lsag2025-s6-cdd-trusts.txt',
    rawFile: 'lsag2025-corporate-structures.txt',
    startLine: 164,
    endLine: 378,
    frontmatter: {
      source_name: 'LSAG Sectoral Guidance 2025',
      section_ref: 's. 6.14.12',
      topics: ['cdd', 'trusts', 'beneficial-ownership', 'settlor', 'trustee', 'beneficiary', 'verification'],
      effective_date: '2025-04-23',
    },
  },
  {
    excerptFile: 'lsag2025-s6-cdd-partnerships.txt',
    rawFile: 'lsag2025-corporate-structures.txt',
    startLine: 379,
    endLine: 0, // end of file
    frontmatter: {
      source_name: 'LSAG Sectoral Guidance 2025',
      section_ref: 's. 6.14.13-6.14.14',
      topics: ['cdd', 'partnerships', 'llp', 'limited-partnership', 'slp', 'foundations', 'verification'],
      effective_date: '2025-04-23',
    },
  },

  // =============================================
  // EDD (lsag2025-edd.txt, 27KB)
  // =============================================
  {
    excerptFile: 'lsag2025-s6-edd.txt',
    rawFile: 'lsag2025-edd.txt',
    startLine: 1,
    endLine: 158,
    frontmatter: {
      source_name: 'LSAG Sectoral Guidance 2025',
      section_ref: 's. 6.18',
      topics: ['edd', 'enhanced-due-diligence', 'source-of-wealth', 'enhanced-monitoring', 'hrtc'],
      effective_date: '2025-04-23',
    },
  },
  {
    excerptFile: 'lsag2025-s6-edd-application.txt',
    rawFile: 'lsag2025-edd.txt',
    startLine: 159,
    endLine: 280,
    frontmatter: {
      source_name: 'LSAG Sectoral Guidance 2025',
      section_ref: 's. 6.19.1-6.19.2',
      topics: ['edd', 'enhanced-due-diligence', 'hrtc', 'high-risk-third-countries', 'risk-factors', 'application'],
      effective_date: '2025-04-23',
    },
  },
  {
    excerptFile: 'lsag2025-s6-edd-peps.txt',
    rawFile: 'lsag2025-edd.txt',
    startLine: 281,
    endLine: 0, // end of file
    frontmatter: {
      source_name: 'LSAG Sectoral Guidance 2025',
      section_ref: 's. 6.19.3',
      topics: ['edd', 'pep', 'politically-exposed-person', 'family-member', 'close-associate', 'senior-management'],
      effective_date: '2025-04-23',
    },
  },

  // =============================================
  // Red Flags (lsag2025-red-flags.txt, 39KB)
  // =============================================
  {
    excerptFile: 'lsag2025-s18-red-flags.txt',
    rawFile: 'lsag2025-red-flags.txt',
    startLine: 1,
    endLine: 253,
    frontmatter: {
      source_name: 'LSAG Sectoral Guidance 2025',
      section_ref: 's. 18.1-18.2',
      topics: ['red-flags', 'suspicious-activity', 'client-risk', 'source-of-funds', 'indicators'],
      effective_date: '2025-04-23',
    },
  },
  {
    excerptFile: 'lsag2025-s18-red-flags-transactions.txt',
    rawFile: 'lsag2025-red-flags.txt',
    startLine: 254,
    endLine: 446,
    frontmatter: {
      source_name: 'LSAG Sectoral Guidance 2025',
      section_ref: 's. 18.3-18.6',
      topics: ['red-flags', 'transactions', 'trusts', 'property', 'conveyancing', 'company-commercial'],
      effective_date: '2025-04-23',
    },
  },
  {
    excerptFile: 'lsag2025-s18-red-flags-sectors.txt',
    rawFile: 'lsag2025-red-flags.txt',
    startLine: 447,
    endLine: 0, // end of file
    frontmatter: {
      source_name: 'LSAG Sectoral Guidance 2025',
      section_ref: 's. 18.7-18.10',
      topics: ['red-flags', 'tcsp', 'litigation', 'proliferation-financing', 'sanctions', 'sector-specific'],
      effective_date: '2025-04-23',
    },
  },
];

function buildFrontmatter(fm: SplitDef['frontmatter']): string {
  return [
    '---',
    `source_name: ${fm.source_name}`,
    `section_ref: ${fm.section_ref}`,
    `topics: [${fm.topics.join(', ')}]`,
    `effective_date: ${fm.effective_date}`,
    '---',
  ].join('\n');
}

function extractLines(filePath: string, startLine: number, endLine: number): string {
  const content = fs.readFileSync(filePath, 'utf-8');
  let lines = content.split('\n');
  const start = startLine - 1; // Convert to 0-based
  const end = endLine === 0 ? lines.length : endLine;
  lines = lines.slice(start, end);

  // Clean LSAG-specific artifacts
  lines = lines.filter((line) => {
    const trimmed = line.trim();
    // Remove standalone page numbers (1-3 digits on their own line)
    if (/^\d{1,3}$/.test(trimmed)) return false;
    // Remove stray "---" separators (not YAML frontmatter)
    if (trimmed === '---') return false;
    return true;
  });

  // Collapse 3+ consecutive blank lines into 2
  let result = lines.join('\n');
  result = result.replace(/\n{4,}/g, '\n\n');

  return result.trimEnd();
}

function main() {
  const dryRun = process.argv.includes('--dry');

  let created = 0;
  let errors = 0;

  for (const split of SPLITS) {
    const rawPath = path.join(EXTRACTED_DIR, split.rawFile);
    const excerptPath = path.join(EXCERPTS_DIR, split.excerptFile);

    if (!fs.existsSync(rawPath)) {
      console.error(`  ERROR: Raw extract not found: ${split.rawFile}`);
      errors++;
      continue;
    }

    try {
      const body = extractLines(rawPath, split.startLine, split.endLine);
      const frontmatter = buildFrontmatter(split.frontmatter);
      const content = `${frontmatter}\n${body}\n`;

      const exists = fs.existsSync(excerptPath);
      const action = exists ? 'REPLACE' : 'CREATE';

      if (dryRun) {
        console.log(`  ${action}: ${split.excerptFile} (${content.length} bytes, lines ${split.startLine}-${split.endLine || 'EOF'} of ${split.rawFile})`);
      } else {
        fs.writeFileSync(excerptPath, content, 'utf-8');
        console.log(`  ✓ ${action}: ${split.excerptFile} (${content.length} bytes)`);
      }
      created++;
    } catch (err) {
      console.error(`  ERROR: ${split.excerptFile}: ${(err as Error).message}`);
      errors++;
    }
  }

  console.log(`\n${dryRun ? 'DRY RUN' : 'DONE'}: ${created} files, ${errors} errors`);
}

main();
