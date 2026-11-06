import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createEncryptedBackup,restoreEncryptedBackup,backupWorker} from '../lib/backups.mjs';
test('encrypted backup restores an independent database and rejects alteration, wrong key and overwrite',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'bv-backup-'));
  const db=new DatabaseSync(':memory:');
  t.after(async()=>{db.close();await rm(directory,{recursive:true,force:true});});
  db.exec("CREATE TABLE sample(value TEXT);INSERT INTO sample VALUES ('private-example');");
  const key='ab'.repeat(32),copy=await createEncryptedBackup(db,{directory,key});
  const encrypted=await readFile(copy.file);
  assert.equal(encrypted.includes(Buffer.from('private-example')),false);
  const output=join(directory,'restored.sqlite');
  assert.equal((await restoreEncryptedBackup({input:copy.file,output,key})).sha256,copy.sha256);
  const restored=new DatabaseSync(output);assert.equal(restored.prepare('SELECT value FROM sample').get().value,'private-example');restored.close();
  await assert.rejects(()=>restoreEncryptedBackup({input:copy.file,output,key}));
  await assert.rejects(()=>restoreEncryptedBackup({input:copy.file,output:join(directory,'wrong.sqlite'),key:'cd'.repeat(32)}));
  encrypted[encrypted.length-1]^=1;await writeFile(copy.file,encrypted);
  await assert.rejects(()=>restoreEncryptedBackup({input:copy.file,output:join(directory,'altered.sqlite'),key}));
});
test('backup worker is inert by default and uploads encrypted bytes without following redirects',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'bv-upload-')),db=new DatabaseSync(':memory:');db.exec('CREATE TABLE sample(id INTEGER);');
  t.after(async()=>{db.close();await rm(directory,{recursive:true,force:true});});
  let calls=0;
  const disabled=backupWorker(db,{});assert.equal(disabled.state.configured,false);await assert.rejects(disabled.run);assert.equal(calls,0);
  const worker=backupWorker(db,{backupKey:'ab'.repeat(32),backupDirectory:directory,backupUploadBase:'https://storage.example/backups/',backupFetch:async(url,options)=>{
    calls++;assert.equal(new URL(url).host,'storage.example');assert.equal(options.redirect,'error');assert.equal(options.method,'PUT');assert.equal(options.body.subarray(0,6).toString(),'BVBK01');return new Response(null,{status:201});
  }});
  assert.equal(calls,0);await worker.run();assert.equal(calls,1);assert.ok(worker.state.lastSuccess);worker.stop();
});
