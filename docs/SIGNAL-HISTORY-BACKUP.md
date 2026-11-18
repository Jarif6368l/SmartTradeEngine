# Signal history backup and recovery

This procedure is manual. It does not connect to GitHub Gist, read secrets, change Render settings, or start/stop the trading watcher.

## Before any history or sync change

1. Stop any process that may write `.signal-history.json` before making a filesystem-level backup. Do not take a live copy while the watcher may be writing.
2. Run the backup command from the application root (or pass the exact history path).
3. Copy the resulting `recovery-history/` directory to a second, independent location that is not the same disk/container.
4. Run the verification command against the copied snapshot. Keep both the JSON snapshot and its manifest.
5. Do not proceed with a restore or cloud-sync operation unless the snapshot verifies and the independent copy is available.

## Create a snapshot

```sh
node scripts/signal-history-backup.js backup
```

For a different source path or backup directory:

```sh
node scripts/signal-history-backup.js backup --file /absolute/path/.signal-history.json --dir /absolute/path/recovery-history
```

The tool validates that the source is a JSON array, writes a timestamped snapshot without overwriting an existing snapshot, and writes a manifest containing record count, byte length, creation time, and SHA-256 digest.

## Verify a snapshot

```sh
node scripts/signal-history-backup.js verify /absolute/path/recovery-history/signal-history-<timestamp>.json
```

Verification checks JSON structure, record count, byte length, and SHA-256 digest. A missing or mismatched manifest is a hard failure.

## Restore a snapshot

Restore is deliberately explicit. First verify the selected snapshot and make sure the watcher is stopped. Then:

```sh
node scripts/signal-history-backup.js restore /absolute/path/recovery-history/signal-history-<timestamp>.json --confirm
```

The tool verifies the snapshot again, creates a new timestamped backup of the current history before replacing it, and atomically writes the restored JSON. Never restore a snapshot that has not been independently copied and verified.

## Scope and limitations

- This is a local filesystem backup/recovery utility. It does not make or verify a GitHub Gist backup.
- It does not run against Render or change deployment/environment configuration.
- It does not access Upstox, broker credentials, Demo Trading, or Indian Market settings.
- A snapshot is not proof that the source was complete at capture time. Stop the writer first and retain an independent copy.
