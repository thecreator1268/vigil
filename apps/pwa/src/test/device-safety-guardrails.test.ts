/**
 * Enforces the two device-safety rules documented in .claude/rules/pwa.md
 * that have no feature to attach a behavioral test to yet: no autoplay
 * media, and any future export/download file name must stay neutral. A
 * static scan over the source tree, so the rule breaks the build the
 * moment someone adds either, instead of only living in a doc nobody reads.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// vitest's root is apps/pwa (see vitest.config.ts); import.meta.url is
// rewritten by Vite's transform here, so resolve from cwd instead.
const SRC = resolve(process.cwd(), 'src');

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

// Words that would identify this app or its purpose to anyone glancing at a
// file name — on a device, in a Downloads folder, in a "Shared with you" list.
const REVEALING_WORDS = ['vigil', 'checkin', 'check-in', 'distress', 'victim', 'survivor', 'crisis', 'atrocit', 'counselor', 'abuse'];

describe('device-safety guardrails', () => {
  const files = sourceFiles(SRC);

  it('no <video> or <audio> element ever autoplays', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      for (const tag of text.matchAll(/<(video|audio)\b[^>]*>/gi)) {
        if (/\bautoplay\b/i.test(tag[0])) offenders.push(`${file}: ${tag[0].replace(/\s+/g, ' ')}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('any downloaded/exported file name stays neutral — never names this app or its purpose', () => {
    const offenders: string[] = [];
    const patterns = [
      /\bdownload\s*=\s*["'`]([^"'`{}]+)["'`]/g, // <a download="...">
      /\.save\(\s*["'`]([^"'`]+)["'`]/g, // jsPDF's doc.save("...")
      /\bsaveAs\(\s*[^,]+,\s*["'`]([^"'`]+)["'`]/g, // file-saver's saveAs(blob, "...")
    ];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      for (const pattern of patterns) {
        for (const match of text.matchAll(pattern)) {
          const found = match[1];
          if (!found) continue;
          // Strip `${...}` interpolations before checking: a variable NAME
          // like `victimId` mentions "victim" in the source, but its RUNTIME
          // VALUE is an opaque id — it's the static parts of the template
          // that are actually reviewable and controllable here.
          const staticParts = found.replace(/\$\{[^}]*\}/g, '').toLowerCase();
          if (REVEALING_WORDS.some((word) => staticParts.includes(word))) offenders.push(`${file}: "${found}"`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
