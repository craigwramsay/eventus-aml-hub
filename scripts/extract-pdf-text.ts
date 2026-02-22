/**
 * PDF Text Extraction Utility
 *
 * Extracts text from PDF files in sources/sources_external/
 * Usage: npx tsx scripts/extract-pdf-text.ts [filename] [--all]
 *
 * --all: Extract all PDFs to sources/sources_external/extracted/
 * filename: Extract a specific PDF (partial match supported)
 */

import * as fs from 'fs';
import * as path from 'path';
import pdfParse from 'pdf-parse';

const SOURCE_DIR = path.resolve(__dirname, '../sources/sources_external');
const OUTPUT_DIR = path.join(SOURCE_DIR, 'extracted');

async function extractPdf(pdfPath: string): Promise<string> {
  const buffer = fs.readFileSync(pdfPath);
  const data = await pdfParse(buffer);
  return data.text;
}

async function extractToFile(pdfPath: string): Promise<void> {
  const basename = path.basename(pdfPath, '.pdf');
  const outputPath = path.join(OUTPUT_DIR, `${basename}.txt`);

  console.log(`Extracting: ${path.basename(pdfPath)}`);
  const text = await extractPdf(pdfPath);
  fs.writeFileSync(outputPath, text, 'utf-8');
  console.log(`  -> ${path.basename(outputPath)} (${text.length} chars)`);
}

async function main() {
  const args = process.argv.slice(2);
  const extractAll = args.includes('--all');
  const fileArg = args.find((a) => !a.startsWith('--'));

  // Ensure output dir exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Find PDF files
  const pdfFiles = fs.readdirSync(SOURCE_DIR)
    .filter((f) => f.toLowerCase().endsWith('.pdf'))
    .map((f) => path.join(SOURCE_DIR, f));

  if (extractAll) {
    console.log(`Extracting all ${pdfFiles.length} PDFs...\n`);
    for (const pdf of pdfFiles) {
      await extractToFile(pdf);
    }
    console.log('\nDone!');
  } else if (fileArg) {
    const match = pdfFiles.find((f) =>
      path.basename(f).toLowerCase().includes(fileArg.toLowerCase())
    );
    if (!match) {
      console.error(`No PDF matching "${fileArg}" found in ${SOURCE_DIR}`);
      console.log('Available PDFs:', pdfFiles.map((f) => path.basename(f)).join('\n  '));
      process.exit(1);
    }
    const text = await extractPdf(match);
    console.log(text);
  } else {
    console.log('Usage: npx tsx scripts/extract-pdf-text.ts [filename|--all]');
    console.log('\nAvailable PDFs:');
    pdfFiles.forEach((f) => console.log(`  ${path.basename(f)}`));
  }
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
