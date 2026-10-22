const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createResumeStorage } = require('../services/resumeStorage');

test('one task can read another task\'s S3 upload using the exact object prefix', async () => {
  const objects = new Map();
  const commands = [];
  const client = { async send(command) {
    commands.push(command);
    const { Bucket, Key, Body } = command.input;
    if (Body) { objects.set(`${Bucket}/${Key}`, Body); return {}; }
    return { Body: { transformToByteArray: async () => objects.get(`${Bucket}/${Key}`) } };
  } };
  const writer = createResumeStorage({ bucket: 'uploads', client });
  const reader = createResumeStorage({ bucket: 'uploads', client });
  await writer.write('uuid.txt', Buffer.from('resume'));
  assert.equal((await reader.read('uuid.txt')).toString(), 'resume');
  assert.equal(commands[0].input.Key, 'resumes/uuid.txt');
  assert.equal(commands[0].input.ServerSideEncryption, 'AES256');
});

test('storage rejects traversal and invalid names before touching S3', async () => {
  const client = { send() { assert.fail('must not access S3'); } };
  const storage = createResumeStorage({ bucket: 'uploads', client });
  for (const name of ['../secrets.env', '/etc/passwd', '', null, 'a/b.txt']) {
    await assert.rejects(storage.read(name), { statusCode: 400 });
    await assert.rejects(storage.write(name, Buffer.from('x')), { statusCode: 400 });
  }
});

test('local storage still supports development without AWS', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'gradhunt-storage-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const storage = createResumeStorage({ bucket: '', directory });
  await storage.write('local.txt', Buffer.from('local'));
  assert.equal((await storage.read('local.txt')).toString(), 'local');
});
