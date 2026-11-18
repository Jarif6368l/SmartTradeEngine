#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function parseHistory(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const rows = JSON.parse(raw);
  if (!Array.isArray(rows)) throw new Error(`Signal history must be a JSON array: ${filePath}`);
  return { raw, rows };
}

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function atomicWrite(filePath, content) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tempPath = `${filePath}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  let fd;
  try {
    fd = fs.openSync(tempPath, 'wx', 0o600);
    fs.writeFileSync(fd, content, 'utf8');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.renameSync(tempPath, filePath);
    try {
      const dirFd = fs.openSync(dir, 'r');
      try { fs.fsyncSync(dirFd); } finally { fs.closeSync(dirFd); }
    } catch { /* Directory fsync is not supported on every platform. */ }
  } catch (error) {
    if (fd !== undefined) fs.closeSync(fd);
    try { fs.unlinkSync(tempPath); } catch { /* best effort cleanup */ }
    throw error;
  }
}

function backupHistory({ source, backupDir, now = new Date() }) {
  const { raw, rows } = parseHistory(source);
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(backupDir, `signal-history-${stamp}.json`);
  const manifestFile = `${backupFile}.manifest.json`;
  if (fs.existsSync(backupFile) || fs.existsSync(manifestFile)) {
    throw new Error(`Backup already exists; refusing to overwrite: ${backupFile}`);
  }
  const manifest = {
    format: 1,
    createdAt: now.toISOString(),
    source: path.basename(source),
    recordCount: rows.length,
    byteLength: Buffer.byteLength(raw, 'utf8'),
    sha256: sha256(raw)
  };
  atomicWrite(backupFile, raw);
  try {
    atomicWrite(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
  } catch (error) {
    throw new Error(`Snapshot created but manifest write failed (${backupFile}): ${error.message}`);
  }
  return { backupFile, manifestFile, manifest };
}

function verifyBackup(backupFile) {
  const manifestFile = `${backupFile}.manifest.json`;
  const raw = fs.readFileSync(backupFile, 'utf8');
  const rows = JSON.parse(raw);
  if (!Array.isArray(rows)) throw new Error('Backup JSON root must be an array');
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  if (manifest.format !== 1) throw new Error('Unsupported backup manifest format');
  if (manifest.sha256 !== sha256(raw)) throw new Error('Backup SHA-256 does not match manifest');
  if (manifest.recordCount !== rows.length) throw new Error('Backup record count does not match manifest');
  if (manifest.byteLength !== Buffer.byteLength(raw, 'utf8')) throw new Error('Backup byte length does not match manifest');
  return { backupFile, recordCount: rows.length, sha256: manifest.sha256, createdAt: manifest.createdAt };
}

function restoreBackup({ backupFile, source, confirm = false, backupDir }) {
  if (!confirm) throw new Error('Restore is destructive; pass --confirm after reviewing the verified backup');
  verifyBackup(backupFile);
  if (fs.existsSync(source)) backupHistory({ source, backupDir });
  const { rows } = parseHistory(backupFile);
  atomicWrite(source, `${JSON.stringify(rows, null, 2)}\n`);
  return { source, restoredRecordCount: rows.length };
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let i = 0; i < rest.length; i++) {
    const item = rest[i];
    if (item === '--confirm') options.confirm = true;
    else if (item.startsWith('--')) {
      const key = item.slice(2);
      const value = rest[++i];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${item}`);
      options[key] = value;
    } else if (!options.backupFile) options.backupFile = item;
    else throw new Error(`Unexpected argument: ${item}`);
  }
  return { command, options };
}

function main(argv = process.argv.slice(2)) {
  const { command, options } = parseArgs(argv);
  const source = path.resolve(options.file || path.join(process.cwd(), '.signal-history.json'));
  const backupDir = path.resolve(options.dir || path.join(process.cwd(), 'recovery-history'));
  if (command === 'backup') {
    console.log(JSON.stringify(backupHistory({ source, backupDir }), null, 2));
  } else if (command === 'verify') {
    if (!options.backupFile) throw new Error('Usage: verify <backup-file>');
    console.log(JSON.stringify(verifyBackup(path.resolve(options.backupFile)), null, 2));
  } else if (command === 'restore') {
    if (!options.backupFile) throw new Error('Usage: restore <backup-file> --confirm');
    console.log(JSON.stringify(restoreBackup({ backupFile: path.resolve(options.backupFile), source, confirm: options.confirm === true, backupDir }), null, 2));
  } else {
    throw new Error('Usage: backup [--file path] [--dir path] | verify <backup-file> | restore <backup-file> --confirm [--file path] [--dir path]');
  }
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(`[Signal History Backup] ${error.message}`); process.exitCode = 1; }
}

module.exports = { backupHistory, verifyBackup, restoreBackup };
