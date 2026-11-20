/**
 * Imports the Riverrun products into Shopify through the Admin API, uploading the photos
 * straight from the handover folder (no public image hosting needed).
 *
 * It reads product-import/riverrun-products-import.csv, so rebuild that first if you changed
 * anything (node product-import/build-import.mjs). The image URLs in the CSV are ignored; the
 * file names are matched to the local Photos folder.
 *
 * Setup (once). Shopify no longer allows new custom apps to be created in the store admin
 * (since 2026-01-01), so create the app in the Dev Dashboard (https://dev.shopify.com/dashboard)
 * in the SAME organization that owns the store:
 *   1. Create app. In its version settings add the scopes:
 *      read_products, write_products, read_publications, write_publications, write_files
 *   2. Release the version, then install the app on riverrun-xybhjzxm.myshopify.com.
 *   3. Copy the Client ID and Client secret from the app's Settings page.
 *   4. Set them in your terminal only (never paste them into chat or commit them):
 *        PowerShell:  $env:SHOPIFY_CLIENT_ID = "..."; $env:SHOPIFY_CLIENT_SECRET = "..."
 * The script exchanges them for a 24-hour access token (client credentials grant). That only
 * works when the app's organization owns the store. If you already hold an Admin API token
 * (for example from an older custom app), set SHOPIFY_ADMIN_TOKEN instead.
 *
 * Usage:
 *   node product-import/import-to-shopify.mjs                 # dry run: shows the plan, changes nothing
 *   node product-import/import-to-shopify.mjs --run --limit 2 # create just the first 2 products to test
 *   node product-import/import-to-shopify.mjs --run           # create everything
 * Options: --store riverrun-xybhjzxm.myshopify.com   --api-version 2026-07
 *
 * Safe to re-run: products whose handle already exists are skipped.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const photosDir = path.join(here, '..', '6 Riverrun – website handover', '04 Products', 'Photos (2048 px, transparent WebP)');
const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const store = opt('store', 'riverrun-xybhjzxm.myshopify.com');
const version = opt('api-version', '2026-07');
const limit = Number(opt('limit', Infinity));
const run = flag('run');
let token = process.env.SHOPIFY_ADMIN_TOKEN;

// ---------- read the import CSV ----------
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else q = false;
      } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') {
      row.push(cur);
      cur = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cur);
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
const rows = parseCsv(fs.readFileSync(path.join(here, 'riverrun-products-import.csv'), 'utf8').replace(/^﻿/, ''));
const H = rows[0];
const col = (r, name) => r[H.indexOf(name)] ?? '';
const products = new Map();
for (const r of rows.slice(1)) {
  const handle = col(r, 'URL handle');
  if (!products.has(handle)) products.set(handle, { handle, images: [] });
  const p = products.get(handle);
  if (col(r, 'Title')) {
    Object.assign(p, {
      title: col(r, 'Title'),
      vendor: col(r, 'Vendor'),
      tags: col(r, 'Tags').split(',').map((t) => t.trim()).filter(Boolean),
      status: col(r, 'Status').toUpperCase(),
      published: col(r, 'Published on online store') === 'TRUE',
      sku: col(r, 'SKU'),
      price: col(r, 'Price') || '0.00',
    });
  }
  p.images.push({
    file: decodeURIComponent(col(r, 'Product image URL').split('/').pop()),
    position: Number(col(r, 'Image position')),
    alt: col(r, 'Image alt text'),
  });
}
const list = [...products.values()].slice(0, limit);

// ---------- checks before anything runs ----------
const missing = list.flatMap((p) => p.images.filter((i) => !fs.existsSync(path.join(photosDir, i.file))).map((i) => i.file));
console.log(`Store: ${store} | API ${version} | products: ${list.length} | photos: ${list.reduce((n, p) => n + p.images.length, 0)}`);
if (missing.length) {
  console.error('Missing photo files:', missing.slice(0, 10), missing.length > 10 ? `(+${missing.length - 10} more)` : '');
  process.exit(1);
}
if (!run) {
  for (const p of list.slice(0, 5)) console.log(`  would create ${p.title} (${p.handle}) tags=[${p.tags}] status=${p.status} photos=${p.images.length}`);
  console.log('Dry run only. Add --run to create the products (try --run --limit 2 first).');
  process.exit(0);
}
if (!token && process.env.SHOPIFY_CLIENT_ID && process.env.SHOPIFY_CLIENT_SECRET) {
  const res = await fetch(`https://${store}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.SHOPIFY_CLIENT_ID,
      client_secret: process.env.SHOPIFY_CLIENT_SECRET,
      grant_type: 'client_credentials',
    }),
  });
  if (!res.ok) {
    console.error(`Could not get an access token (HTTP ${res.status}). Check the Client ID and secret, that the app is installed on ${store}, and that the app's organization owns the store.`);
    process.exit(1);
  }
  token = (await res.json()).access_token;
}
if (!token) {
  console.error('Set SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET (or SHOPIFY_ADMIN_TOKEN) first. See the setup notes at the top of this file.');
  process.exit(1);
}

// ---------- Admin API helpers ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function gql(query, variables = {}) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(`https://${store}/admin/api/${version}/graphql.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
      body: JSON.stringify({ query, variables }),
    });
    if (res.status === 429 || res.status >= 500) {
      await sleep(1500 * (attempt + 1));
      continue;
    }
    const json = await res.json();
    if (json.errors?.some((e) => e.extensions?.code === 'THROTTLED')) {
      await sleep(2000 * (attempt + 1));
      continue;
    }
    if (json.errors) throw new Error(JSON.stringify(json.errors));
    return json.data;
  }
  throw new Error('Too many retries');
}
const userErrors = (label, errs) => {
  if (errs?.length) throw new Error(`${label}: ${errs.map((e) => `${e.field?.join('.') ?? ''} ${e.message}`).join('; ')}`);
};

// ---------- run ----------
const pubData = await gql(`{ publications(first: 20) { nodes { id name } } }`);
const onlineStore = pubData.publications.nodes.find((n) => /online store/i.test(n.name));
if (!onlineStore) console.warn('Online Store publication not found: products will be created but not published.');

let created = 0;
let skipped = 0;
for (const p of list) {
  try {
    const existing = await gql(`query($q: String!) { products(first: 1, query: $q) { nodes { id } } }`, { q: `handle:${p.handle}` });
    if (existing.products.nodes.length) {
      skipped++;
      console.log(`skip   ${p.title} (already exists)`);
      continue;
    }

    // 1. upload this product's photos to Shopify's staging storage
    const staged = (
      await gql(
        `mutation($input: [StagedUploadInput!]!) { stagedUploadsCreate(input: $input) { stagedTargets { url resourceUrl parameters { name value } } userErrors { field message } } }`,
        { input: p.images.map((i) => ({ resource: 'PRODUCT_IMAGE', filename: i.file, mimeType: 'image/webp', httpMethod: 'POST' })) }
      )
    ).stagedUploadsCreate;
    userErrors('stagedUploadsCreate', staged.userErrors);
    for (let k = 0; k < p.images.length; k++) {
      const t = staged.stagedTargets[k];
      const form = new FormData();
      for (const { name, value } of t.parameters) form.append(name, value);
      form.append('file', new Blob([fs.readFileSync(path.join(photosDir, p.images[k].file))], { type: 'image/webp' }), p.images[k].file);
      const up = await fetch(t.url, { method: 'POST', body: form });
      if (!up.ok) throw new Error(`photo upload failed (${up.status}) for ${p.images[k].file}`);
    }

    // 2. create the product with its photos
    const made = (
      await gql(
        `mutation($product: ProductCreateInput!, $media: [CreateMediaInput!]) {
           productCreate(product: $product, media: $media) {
             product { id variants(first: 1) { nodes { id } } }
             userErrors { field message }
           }
         }`,
        {
          product: { title: p.title, handle: p.handle, vendor: p.vendor, tags: p.tags, status: p.status },
          media: p.images.map((i, k) => ({ originalSource: staged.stagedTargets[k].resourceUrl, alt: i.alt, mediaContentType: 'IMAGE' })),
        }
      )
    ).productCreate;
    userErrors('productCreate', made.userErrors);

    // 3. set the single variant: price, SKU, stock tracking (stock stays 0 = cannot be bought)
    const variantId = made.product.variants.nodes[0].id;
    const upd = (
      await gql(
        `mutation($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
           productVariantsBulkUpdate(productId: $productId, variants: $variants) { userErrors { field message } }
         }`,
        {
          productId: made.product.id,
          variants: [{ id: variantId, price: p.price, inventoryPolicy: 'DENY', inventoryItem: { sku: p.sku, tracked: true, requiresShipping: true } }],
        }
      )
    ).productVariantsBulkUpdate;
    userErrors('productVariantsBulkUpdate', upd.userErrors);

    // 4. make it visible on the Online Store
    if (p.published && onlineStore) {
      const pub = (
        await gql(
          `mutation($id: ID!, $input: [PublicationInput!]!) { publishablePublish(id: $id, input: $input) { userErrors { field message } } }`,
          { id: made.product.id, input: [{ publicationId: onlineStore.id }] }
        )
      ).publishablePublish;
      userErrors('publishablePublish', pub.userErrors);
    }
    created++;
    console.log(`create ${p.title} (${p.images.length} photos)`);
    await sleep(300);
  } catch (e) {
    console.error(`FAILED ${p.title}: ${e.message}`);
    console.error('Stopping so nothing is left half-done. Fix the cause and re-run: finished products are skipped.');
    process.exit(1);
  }
}
console.log(`Done. Created ${created}, skipped ${skipped}.`);
