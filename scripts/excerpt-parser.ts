/**
 * Excerpt File Parser
 *
 * Parses curated excerpt files (txt/md) with YAML-style frontmatter.
 *
 * File format:
 * ---
 * source_name: MLR 2017
 * section_ref: reg. 28
 * topics: [cdd, verification, identity]
 * effective_date: 2017-06-26
 * ---
 * Content of the excerpt goes here...
 */

import * as fs from 'fs';
import * as path from 'path';

export interface ParsedExcerpt {
  source_name: string;
  section_ref: string;
  topics: string[];
  content: string;
  effective_date: string | null;
  filePath: string;
}

export interface ParseResult {
  success: boolean;
  excerpt?: ParsedExcerpt;
  error?: string;
}

/**
 * Parse a single excerpt file
 */
export function parseExcerptFile(filePath: string): ParseResult {
  try {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    return parseExcerptContent(fileContent, filePath);
  } catch (error) {
    return {
      success: false,
      error: `Failed to read file ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Parse excerpt content string
 */
export function parseExcerptContent(content: string, filePath: string = ''): ParseResult {
  // Check for frontmatter delimiters
  const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return {
      success: false,
      error: `File ${filePath} does not have valid frontmatter (must start with --- and have closing ---)`,
    };
  }

  const [, frontmatter, body] = match;

  // Parse frontmatter
  const metadata = parseFrontmatter(frontmatter);

  // Extract and validate required fields
  const sourceName = getStringValue(metadata.source_name);
  const sectionRef = getStringValue(metadata.section_ref);
  const topics = getArrayValue(metadata.topics);
  const effectiveDate = getStringValue(metadata.effective_date);

  if (!sourceName) {
    return { success: false, error: `Missing required field: source_name in ${filePath}` };
  }
  if (!sectionRef) {
    return { success: false, error: `Missing required field: section_ref in ${filePath}` };
  }
  if (!topics || topics.length === 0) {
    return { success: false, error: `Missing required field: topics in ${filePath}` };
  }

  const trimmedContent = body.trim();
  if (!trimmedContent) {
    return { success: false, error: `Empty content in ${filePath}` };
  }

  return {
    success: true,
    excerpt: {
      source_name: sourceName,
      section_ref: sectionRef,
      topics: topics,
      content: trimmedContent,
      effective_date: effectiveDate,
      filePath,
    },
  };
}

/**
 * Safely extract a string value from metadata
 */
function getStringValue(value: string | string[] | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value[0] || null;
  return value;
}

/**
 * Safely extract an array value from metadata
 */
function getArrayValue(value: string | string[] | null | undefined): string[] | null {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value;
  return [value];
}

/**
 * Parse YAML-style frontmatter (simple key: value format)
 */
function parseFrontmatter(frontmatter: string): Record<string, string | string[] | null> {
  const result: Record<string, string | string[] | null> = {};
  const lines = frontmatter.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) continue;

    const key = trimmed.slice(0, colonIndex).trim();
    let value = trimmed.slice(colonIndex + 1).trim();

    // Handle array syntax: [item1, item2, item3]
    if (value.startsWith('[') && value.endsWith(']')) {
      const arrayContent = value.slice(1, -1);
      result[key] = arrayContent
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
    } else {
      // Handle quoted strings
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      result[key] = value || null;
    }
  }

  return result;
}

/**
 * Recursively find all excerpt files in a directory
 */
export function findExcerptFiles(dirPath: string): string[] {
  const files: string[] = [];

  if (!fs.existsSync(dirPath)) {
    return files;
  }

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      files.push(...findExcerptFiles(fullPath));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (ext === '.txt' || ext === '.md') {
        files.push(fullPath);
      }
    }
  }

  return files;
}

/**
 * Parse all excerpt files in a directory
 */
export function parseExcerptDirectory(dirPath: string): {
  excerpts: ParsedExcerpt[];
  errors: string[];
} {
  const excerpts: ParsedExcerpt[] = [];
  const errors: string[] = [];

  const files = findExcerptFiles(dirPath);

  for (const filePath of files) {
    const result = parseExcerptFile(filePath);
    if (result.success && result.excerpt) {
      excerpts.push(result.excerpt);
    } else if (result.error) {
      errors.push(result.error);
    }
  }

  return { excerpts, errors };
}
