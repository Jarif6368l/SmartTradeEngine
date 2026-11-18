'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { backupHistory, verifyBackup, restoreBackup } = require('../scripts/signal-history-backup');

function fixture(t, rows = [{ id: 'one', outcome: 'OPEN' }]) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'signal-history-backup-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, '.signal-history.json');
  const backupDir = path.join(root, 'recovery-history');
  fs.writeFileSync(source, JSON.stringify(rows, null, 2));
  return { root, source, backupDir };
}

test('creates a non-overwriting snapshot with verifiable SHA-256 manifest', t => {
  const f = fixture(t);
  const result = backupHistory({ source: f.source, backupDir: f.backupDir, now: new Date('2026-11-18T12:00:00.000Z') });
  const verified = verifyBackup(result.backupFile);
  assert.equal(verified.recordCount, 1);
  assert.equal(verified.sha256, result.manifest.sha256);
  assert.throws(() => backupHistory({ source: f.source, backupDir: f.backupDir, now: new Date('2026-11-18T12:00:00.000Z') }), /already exists/);
});

test('rejects invalid source JSON without creating a backup', t => {
  const f = fixture(t);
  fs.writeFileSync(f.source, '{broken');
  assert.throws(() => backupHistory({ source: f.source, backupDir: f.backupDir }), SyntaxError);
  assert.equal(fs.existsSync(f.backupDir), false);
});

test('detects modified backup content', t => {
  const f = fixture(t);
  const result = backupHistory({ source: f.source, backupDir: f.backupDir });
  fs.appendFileSync(result.backupFile, ' ');
  assert.throws(() => verifyBackup(result.backupFile), /SHA-256/);
});

test('requires explicit restore confirmation and backs up current data first', t => {
  const f = fixture(t, [{ id: 'current' }]);
  const snapshot = backupHistory({ source: f.source, backupDir: f.backupDir });
  fs.writeFileSync(f.source, JSON.stringify([{ id: 'changed' }]));
  assert.throws(() => restoreBackup({ backupFile: snapshot.backupFile, source: f.source, backupDir: f.backupDir }), /pass --confirm/);
  const result = restoreBackup({ backupFile: snapshot.backupFile, source: f.source, backupDir: path.join(f.root, 'pre-restore'), confirm: true });
  assert.equal(result.restoredRecordCount, 1);
  assert.deepEqual(JSON.parse(fs.readFileSync(f.source, 'utf8')), [{ id: 'current' }]);
  assert.equal(fs.readdirSync(path.join(f.root, 'pre-restore')).length, 2);
});

test('does not restore an invalid or tampered backup', t => {
  const f = fixture(t);
  const snapshot = backupHistory({ source: f.source, backupDir: f.backupDir });
  fs.writeFileSync(snapshot.backupFile, '[]');
  assert.throws(() => restoreBackup({ backupFile: snapshot.backupFile, source: f.source, backupDir: path.join(f.root, 'pre-restore'), confirm: true }), /SHA-256/);
  assert.deepEqual(JSON.parse(fs.readFileSync(f.source, 'utf8')), [{ id: 'one', outcome: 'OPEN' }]);
});
