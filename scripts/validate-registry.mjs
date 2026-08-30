#!/usr/bin/env node
/**
 * Validate registry.json — structure first, then (optionally) the live state
 * of every listed mod on GitHub.
 *
 * Usage:
 *   node scripts/validate-registry.mjs            # structure only
 *   node scripts/validate-registry.mjs --live     # + fetch mod.json, HEAD every file URL
 *
 * Exits non-zero when any check fails, so CI can gate on it. The --live mode
 * performs exactly the requests the launcher performs on install (fetch
 * mod.json from main/master, resolve each files[].path, platform-filtered),
 * so a green run means every registry entry is installable.
 */
import { readFile } from 'node:fs/promises';

const LIVE = process.argv.includes('--live');
const REGISTRY_PATH = new URL('../registry.json', import.meta.url);

const errors = [];
const warnings = [];
const err = (msg) => errors.push(msg);
const warn = (msg) => warnings.push(msg);

const raw = await readFile(REGISTRY_PATH, 'utf8');
let registry;
try {
  registry = JSON.parse(raw);
} catch (e) {
  console.error(`registry.json is not valid JSON: ${e.message}`);
  process.exit(1);
}

// ---------------------------------------------------------------- structure
if (registry.version !== 1) err(`version must be 1, got ${JSON.stringify(registry.version)}`);
if (typeof registry.lastUpdated !== 'string' || Number.isNaN(Date.parse(registry.lastUpdated))) {
  err(`lastUpdated must be an ISO 8601 timestamp, got ${JSON.stringify(registry.lastUpdated)}`);
}
if (!Array.isArray(registry.mods)) err('mods must be an array');
if (!Array.isArray(registry.categories)) err('categories must be an array');

const categoryIds = new Set((registry.categories || []).map((c) => c && c.id).filter(Boolean));
for (const c of registry.categories || []) {
  if (!c || typeof c.id !== 'string' || typeof c.name !== 'string') {
    err(`invalid category entry: ${JSON.stringify(c)}`);
  }
}

const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const seenIds = new Set();
for (const [i, mod] of (registry.mods || []).entries()) {
  const where = `mods[${i}]${mod && mod.id ? ` (${mod.id})` : ''}`;
  if (!mod || typeof mod !== 'object') { err(`${where}: not an object`); continue; }
  if (typeof mod.id !== 'string' || !mod.id) err(`${where}: missing id`);
  else if (seenIds.has(mod.id)) err(`${where}: duplicate id`);
  else seenIds.add(mod.id);
  if (typeof mod.name !== 'string' || !mod.name.trim()) err(`${where}: missing name`);
  // The launcher installs from `githubRepo || id`, so whichever is present
  // must look like owner/repo.
  const repo = mod.githubRepo || mod.id;
  if (typeof repo !== 'string' || !REPO_RE.test(repo)) {
    err(`${where}: neither githubRepo nor id is a valid "owner/repo" (${JSON.stringify(repo)})`);
  }
  if (mod.category !== undefined && !categoryIds.has(mod.category)) {
    err(`${where}: category "${mod.category}" is not declared in categories[]`);
  }
  for (const key of ['featured', 'verified']) {
    if (mod[key] !== undefined && typeof mod[key] !== 'boolean') {
      err(`${where}: ${key} must be a boolean`);
    }
  }
  if (mod.tags !== undefined && (!Array.isArray(mod.tags) || mod.tags.some((t) => typeof t !== 'string'))) {
    err(`${where}: tags must be an array of strings`);
  }
}

// --------------------------------------------------------------------- live
// Mirrors the launcher's install pipeline (mods-handlers.js): mod.json is
// fetched from raw.githubusercontent.com on main then master; files[].path is
// either an absolute GitHub URL constrained to the mod's own repository, or a
// repo-relative path resolved against the manifest's branch.
const PLATFORMS = ['windows', 'macos', 'linux'];
const EXT_PLATFORM = { '.dll': 'windows', '.dylib': 'macos', '.so': 'linux' };
const ALLOWED_HOSTS = new Set(['github.com', 'raw.githubusercontent.com', 'codeload.github.com']);

async function fetchOk(url, method = 'GET') {
  const res = await fetch(url, { method, redirect: 'follow', headers: { 'User-Agent': 'ugaris-mod-registry-ci' } });
  return res;
}

async function checkMod(mod) {
  const repo = mod.githubRepo || mod.id;
  if (!REPO_RE.test(repo || '')) return; // structural error already recorded
  const where = `mod ${repo}`;

  let manifest = null;
  let branch = null;
  for (const b of ['main', 'master']) {
    const res = await fetchOk(`https://raw.githubusercontent.com/${repo}/${b}/mod.json`);
    if (res.ok) {
      try {
        manifest = JSON.parse(await res.text());
        branch = b;
      } catch (e) {
        err(`${where}: mod.json on ${b} is not valid JSON (${e.message})`);
        return;
      }
      break;
    }
  }
  if (!manifest) {
    err(`${where}: no mod.json reachable on main or master`);
    return;
  }

  if (typeof manifest.name !== 'string' || !Array.isArray(manifest.files) || manifest.files.length === 0) {
    err(`${where}: mod.json missing required fields (name, files)`);
    return;
  }
  if (manifest.type !== 'dll' && manifest.type !== 'lua') {
    warn(`${where}: mod.json type is ${JSON.stringify(manifest.type)} (launcher treats anything but "lua" as "dll")`);
  }
  const useBranch = typeof manifest.branch === 'string' && /^[\w.-]+$/.test(manifest.branch) ? manifest.branch : branch;

  const covered = new Set();
  const nativePerPlatform = {};
  for (const [i, file] of manifest.files.entries()) {
    const fwhere = `${where} files[${i}]`;
    if (!file || typeof file !== 'object' || typeof file.path !== 'string') {
      err(`${fwhere}: invalid entry`);
      continue;
    }
    const name = typeof file.name === 'string' ? file.name : String(file.path).split('/').pop();
    const ext = (name.match(/\.[a-z0-9]+$/i) || [''])[0].toLowerCase();
    const platform = file.platform ? String(file.platform).toLowerCase() : EXT_PLATFORM[ext] || null;
    if (file.platform && !PLATFORMS.includes(platform)) {
      err(`${fwhere}: unknown platform "${file.platform}"`);
    }
    if (platform) {
      covered.add(platform);
      if (EXT_PLATFORM[ext]) {
        nativePerPlatform[platform] = (nativePerPlatform[platform] || 0) + 1;
        if (EXT_PLATFORM[ext] !== platform) {
          err(`${fwhere}: extension ${ext} does not match platform ${platform}`);
        }
      }
    }

    // Resolve the URL the launcher would download.
    let url;
    if (/^[a-z][a-z0-9+.-]*:/i.test(file.path)) {
      let u;
      try { u = new URL(file.path); } catch { err(`${fwhere}: invalid URL ${file.path}`); continue; }
      if (u.protocol !== 'https:') { err(`${fwhere}: must be https (${file.path})`); continue; }
      if (!ALLOWED_HOSTS.has(u.hostname.toLowerCase())) { err(`${fwhere}: host ${u.hostname} not allowed by the launcher`); continue; }
      if (!`${u.pathname.toLowerCase()}/`.startsWith(`/${repo.toLowerCase()}/`)) {
        err(`${fwhere}: URL must point into the mod's own repository (${file.path})`);
        continue;
      }
      url = u.toString();
    } else {
      if (file.path.includes('..') || file.path.startsWith('/')) { err(`${fwhere}: unsafe repo path ${file.path}`); continue; }
      url = `https://raw.githubusercontent.com/${repo}/${useBranch}/${file.path.split('/').map(encodeURIComponent).join('/')}`;
    }
    const res = await fetchOk(url, 'HEAD');
    if (!res.ok) err(`${fwhere}: ${res.status} for ${url}`);
  }

  if (manifest.type !== 'lua') {
    for (const p of PLATFORMS) {
      if (!covered.has(p)) warn(`${where}: no file for platform ${p}`);
      if ((nativePerPlatform[p] || 0) > 1) err(`${where}: more than one native library for ${p} (launcher rejects this)`);
    }
  }
}

if (LIVE && errors.length === 0) {
  for (const mod of registry.mods || []) {
    await checkMod(mod);
  }
}

for (const w of warnings) console.log(`WARN  ${w}`);
for (const e of errors) console.log(`ERROR ${e}`);
console.log(`\n${registry.mods?.length ?? 0} mods checked${LIVE ? ' (live)' : ''}: ${errors.length} error(s), ${warnings.length} warning(s)`);
process.exit(errors.length ? 1 : 0);
