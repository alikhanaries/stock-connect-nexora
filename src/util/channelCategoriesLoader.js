import fs from 'fs';
import path from 'path';
import { config } from '#config/config.js';

let _cache = null;

const stripBom = (str) => (str.charCodeAt(0) === 0xfeff ? str.slice(1) : str);

const parseDelimitedLine = (line, sep) => {
  const cells = [];
  let i = 0;
  let cur = '';
  let inQuotes = false;
  while (i < line.length) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i += 2;
        continue;
      }
      if (ch === '"') {
        inQuotes = false;
        i++;
        continue;
      }
      cur += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === sep) {
      cells.push(cur);
      cur = '';
      i++;
      continue;
    }
    cur += ch;
    i++;
  }
  cells.push(cur);
  return cells;
};

const parseChannelCategoriesCsv = (raw) => {
  const text = stripBom(raw).replace(/\r/g, '');
  const lines = text.split('\n');

  let sep = ',';
  let headerIdx = 0;

  if (lines[0]?.toLowerCase().startsWith('sep=')) {
    sep = lines[0].slice(4).trim() || ',';
    headerIdx = 1;
  }

  const header = parseDelimitedLine(lines[headerIdx] ?? '', sep).map((c) => c.trim().toLowerCase());
  const pathIdx = header.indexOf('channel_category_path');
  const canContainsIdx = header.indexOf('can_contains_products');

  if (pathIdx === -1) {
    throw new Error('channel_category_path column not found in channel categories CSV');
  }

  const paths = [];
  const seen = new Set();
  for (let l = headerIdx + 1; l < lines.length; l++) {
    const line = lines[l];
    if (!line || !line.trim()) continue;
    const cells = parseDelimitedLine(line, sep);
    const p = (cells[pathIdx] ?? '').trim();
    if (!p) continue;
    if (canContainsIdx !== -1) {
      const can = (cells[canContainsIdx] ?? '').trim().toLowerCase();
      if (can !== 'yes') continue;
    }
    if (seen.has(p)) continue;
    seen.add(p);
    paths.push(p);
  }
  return paths;
};

// Turn a Google Sheets share/edit URL into its CSV-export URL. Any other http(s)
// URL is used as-is (assumed to already return raw CSV).
const toSheetCsvUrl = (url) => {
  const sheet = url.match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!sheet) return url;
  const gid = url.match(/[#&?]gid=(\d+)/)?.[1] ?? '0';
  return `https://docs.google.com/spreadsheets/d/${sheet[1]}/export?format=csv&gid=${gid}`;
};

export const loadChannelCategories = async () => {
  if (_cache) return _cache;

  const csvSource = config.CHANNEL_CATEGORIES_CSV;
  if (!csvSource) {
    throw new Error('CHANNEL_CATEGORIES_CSV is not configured');
  }

  let raw;
  let sourceLabel;

  if (/^https?:\/\//i.test(csvSource)) {
    // Env override holding an HTTP(S) URL — e.g. a published Google Sheet.
    // Fetched once, then cached for the rest of the process.
    const url = toSheetCsvUrl(csvSource);
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to fetch channel categories CSV (${res.status} ${res.statusText}) from ${url}`);
    }
    raw = await res.text();
    sourceLabel = url;
  } else if (/\n/.test(csvSource) || /(sep=|channel_category_path|>)/i.test(csvSource)) {
    // Env override holding inline CSV content (multi-line, or has the CSV header/separator).
    raw = csvSource;
    sourceLabel = 'inline env value';
  } else {
    // Env override holding a file path (absolute, or relative to cwd).
    const absPath = path.isAbsolute(csvSource) ? csvSource : path.join(process.cwd(), csvSource);
    if (!fs.existsSync(absPath)) {
      throw new Error(`Channel categories CSV not found at: ${absPath}`);
    }
    raw = fs.readFileSync(absPath, 'utf8');
    sourceLabel = absPath;
  }

  const paths = parseChannelCategoriesCsv(raw);
  if (!paths.length) {
    throw new Error(`Channel categories CSV (${sourceLabel}) produced no usable paths`);
  }

  console.log(`[ChannelCategories] Loaded ${paths.length} category paths from ${sourceLabel}`);
  _cache = { paths, pathSet: new Set(paths) };
  return _cache;
};

export const clearChannelCategoriesCache = () => {
  _cache = null;
};

export const humanizeCategoryPath = (rawPath) => {
  if (!rawPath || typeof rawPath !== 'string') return '';
  return rawPath
    .split('>')
    .map((seg) => seg.trim())
    .filter(Boolean)
    .map((seg) =>
      seg
        .replace(/_and_/g, ' & ')
        .split('_')
        .map((tok) => (tok ? tok.charAt(0).toUpperCase() + tok.slice(1) : tok))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
    )
    .join(' > ');
};
