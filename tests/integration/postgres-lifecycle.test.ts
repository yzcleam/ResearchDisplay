import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import { postgresControl } from '../../scripts/postgres-control.js';

test('数据库启动失败返回真实原因；连续启停不残留 PID 并保留已写数据', { timeout: 90000 }, async () => {
  const directory = path.resolve('.local', `lifecycle-${randomUUID()}`), password = randomUUID(), port = 55435;
  const initializer = new EmbeddedPostgres({ databaseDir: directory, user: 'lifecycle', password, port, persistent: true,
    authMethod: 'scram-sha-256', initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {}, onError: () => {} });
  await initializer.initialise();
  const control = await postgresControl(directory, path.join(directory, 'startup.log'), 5);
  const configFile = path.join(directory, 'postgresql.conf'), original = await readFile(configFile, 'utf8');
  try {
    await writeFile(configFile, original + '\ninvalid_lifecycle_setting = true\n');
    await assert.rejects(control.start(port), /invalid_lifecycle_setting/);
    await control.stop(); // The failed server has already exited: stopping again must be safe.
    await writeFile(configFile, original);
    for (let run = 0; run < 2; run++) {
      await control.start(port);
      const client = new pg.Client({ user: 'lifecycle', password, port, host: '127.0.0.1', database: 'postgres', connectionTimeoutMillis: 2000 });
      try {
        await client.connect();
        if (!run) { await client.query('CREATE TABLE lifecycle_probe(value integer)'); await client.query('INSERT INTO lifecycle_probe VALUES (42)'); }
        assert.equal((await client.query('SELECT value FROM lifecycle_probe')).rows[0].value, 42);
      } finally { await client.end(); }
      await control.stop(); await control.stop();
      assert.equal((await control.status()).code, 3);
      assert(!existsSync(path.join(directory, 'postmaster.pid')));
    }
  } finally { await writeFile(configFile, original); await control.stop(); }
});
