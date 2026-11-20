/**
 * Builds the Shopify product import CSV for Riverrun from the client's handover folder.
 *
 * Usage (from anywhere):
 *   node product-import/build-import.mjs --image-base "https://your-host.example/riverrun/products/"
 *
 * Inputs (read only):  <handover>/04 Products/Product list - 147 pieces (photo numbers).csv
 *                      <handover>/04 Products/Photos (2048 px, transparent WebP)/*.webp
 *                      <handover>/04 Products/Product sheet - tab Product - Empty (147 pieces).csv (column template)
 * Outputs:             product-import/riverrun-products-import.csv   (upload this to Shopify)
 *                      product-import/review/product-review.csv      (what to check before publishing)
 *                      product-import/review/unassigned-photos.csv   (photos not in the import)
 *
 * Shopify needs a public https URL for every image, so --image-base is the folder URL the
 * WebP files will be served from (upload the Photos folder there, or to Shopify Files and
 * use the CDN folder URL). Filenames are kept as-is (FRA_8001.webp).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const project = path.resolve(here, '..');
const handover = path.join(project, '6 Riverrun – website handover', '04 Products');
const photosDir = path.join(handover, 'Photos (2048 px, transparent WebP)');

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
let imageBase = arg('image-base', 'https://REPLACE-WITH-IMAGE-HOST/riverrun/products/');
if (!imageBase.endsWith('/')) imageBase += '/';
// Pieces are "enquire only" for now (client decision): tagged `enquire`, price 0.00 and stock 0 so they
// cannot be bought, even with a hand-made cart request. The theme shows "enquire" instead of a price.
// When a price is set: remove the `enquire` tag and set the stock to 1.
const status = arg('status', 'active');

// ---------- helpers ----------
const readText = (f) => fs.readFileSync(f, 'utf8').replace(/^﻿/, '');
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cur);
      cur = '';
    } else if (c === '\n') {
      row.push(cur.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      cur = '';
    } else cur += c;
  }
  if (cur !== '' || row.length) {
    row.push(cur);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v !== ''));
}
const esc = (v) => {
  const s = String(v ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (header, rows) => [header, ...rows].map((r) => r.map(esc).join(',')).join('\r\n') + '\r\n';

// ---------- load ----------
const listRows = parseCsv(readText(path.join(handover, 'Product list - 147 pieces (photo numbers).csv')));
const products = listRows.slice(1).map(([file, name]) => ({ number: Number(file.slice(4)), file, name }));
const template = parseCsv(readText(path.join(handover, 'Product sheet - tab Product - Empty (147 pieces).csv')))[0];
const photoNumbers = fs
  .readdirSync(photosDir)
  .filter((f) => /^FRA_\d{4}\.webp$/.test(f))
  .map((f) => Number(f.slice(4, 8)))
  .sort((a, b) => a - b);

// Photos checked by eye on contact sheets and found to belong to a different piece than the
// range rule suggests. They are left out of the gallery and listed for review instead.
const MANUAL_EXCLUDE = new Map([
  [8041, 'Different grey cabinet from No. 8037 (seen on contact sheet)'],
  [8586, 'Close-up of a carved table leg, not the stool No. 8579 (seen on contact sheet)'],
]);

// ---------- group photos by "first pick" ranges ----------
// Rule: a piece's photos are the numbers from its first-pick up to the next first-pick.
// This is only reliable for small groups, so large groups and single photos are flagged.
const groups = products.map((p, i) => {
  const next = products[i + 1]?.number ?? Infinity;
  const files = photoNumbers.filter((n) => n >= p.number && n < next);
  return { ...p, rangeFiles: files };
});
const unassigned = [];
for (const n of photoNumbers.filter((n) => n < products[0].number)) {
  unassigned.push({ n, reason: 'Before the first listed piece (No. 8001); possibly a piece missing from the client list' });
}

const reviewRows = [];
const importRows = [];

groups.forEach((g, i) => {
  const size = g.rangeFiles.length;
  const prev = groups[i - 1];
  const nextG = groups[i + 1];
  const flags = [];

  let gallery;
  if (size >= 6) {
    gallery = [g.number];
    g.rangeFiles
      .filter((n) => n !== g.number)
      .forEach((n) => unassigned.push({ n, reason: `Group of ${size} photos starting at No. ${g.number} mixes several pieces`, near: g.number }));
    flags.push(`large group (${size} photos): only the first-pick is imported, extra photos are in unassigned-photos.csv`);
  } else {
    gallery = [];
    for (const n of g.rangeFiles) {
      if (MANUAL_EXCLUDE.has(n)) {
        unassigned.push({ n, reason: MANUAL_EXCLUDE.get(n), near: g.number });
        flags.push(`photo ${n} left out: ${MANUAL_EXCLUDE.get(n)}`);
      } else gallery.push(n);
    }
    if (size === 1) flags.push('single photo: neighbouring photos may belong to this piece');
    else flags.push('gallery photos come from number order and are not verified');
  }
  if (prev && g.number - prev.number === 1) flags.push(`first-pick is next to No. ${prev.number}: may be the same piece`);
  if (nextG && nextG.number - g.number === 1) flags.push(`first-pick is next to No. ${nextG.number}: may be the same piece`);

  const confidence = size >= 6 || size === 1 || flags.some((f) => f.includes('left out') || f.includes('same piece')) ? 'low' : 'medium';

  const handle = `no-${g.number}`;
  gallery.forEach((n, idx) => {
    const url = `${imageBase}FRA_${n}.webp`;
    const alt = idx === 0 ? g.name : `${g.name}, photo ${idx + 1}`;
    const row = Object.fromEntries(template.map((h) => [h, '']));
    row['URL handle'] = handle;
    row['Product image URL'] = url;
    row['Image position'] = idx + 1;
    row['Image alt text'] = alt;
    if (idx === 0) {
      Object.assign(row, {
        Title: g.name,
        Vendor: 'Riverrun',
        Tags: 'enquire',
        'Published on online store': status === 'active' ? 'TRUE' : 'FALSE',
        Status: status,
        SKU: g.file,
        'Option1 name': 'Title',
        'Option1 value': 'Default Title',
        Price: '0.00',
        'Charge tax': 'TRUE',
        'Inventory tracker': 'shopify',
        'Inventory quantity': 0,
        'Continue selling when out of stock': 'deny',
        'Requires shipping': 'TRUE',
        'Fulfillment service': 'manual',
        'Gift card': 'FALSE',
      });
    }
    importRows.push(template.map((h) => row[h]));
  });

  reviewRows.push([g.name, handle, g.file + '.webp', size, gallery.length, confidence, flags.join(' | ')]);
});

// ---------- write ----------
const reviewDir = path.join(here, 'review');
fs.mkdirSync(reviewDir, { recursive: true });
fs.writeFileSync(path.join(here, 'riverrun-products-import.csv'), toCsv(template, importRows), 'utf8');
fs.writeFileSync(
  path.join(reviewDir, 'product-review.csv'),
  toCsv(
    ['Title', 'URL handle', 'First-pick photo', 'Photos in number range', 'Photos imported', 'Confidence', 'What to check'],
    reviewRows
  ),
  'utf8'
);
const nearestPiece = (n) => products.filter((p) => p.number <= n).at(-1)?.number;
fs.writeFileSync(
  path.join(reviewDir, 'unassigned-photos.csv'),
  toCsv(
    ['Photo file', 'Reason', 'Nearest earlier piece (No.)'],
    unassigned.sort((a, b) => a.n - b.n).map((u) => [`FRA_${u.n}.webp`, u.reason, u.near ?? nearestPiece(u.n) ?? ''])
  ),
  'utf8'
);

const imported = new Set(importRows.map((r) => r[template.indexOf('Product image URL')]));
console.log(
  JSON.stringify(
    {
      products: products.length,
      csvRows: importRows.length,
      imagesImported: imported.size,
      photosInFolder: photoNumbers.length,
      photosNotImported: photoNumbers.length - imported.size,
      status,
      imageBase,
    },
    null,
    2
  )
);
