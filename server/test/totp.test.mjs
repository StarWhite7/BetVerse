import {test} from 'node:test';
import assert from 'node:assert/strict';
import {base32,totp,validStep,encryptSecret,decryptSecret} from '../lib/totp.mjs';
test('TOTP matches RFC 6238 SHA1 vector, rejects replay and authenticates encrypted seeds',(t)=>{
  const secret=Buffer.from('12345678901234567890');
  assert.equal(base32(secret),'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  assert.equal(totp(secret,1),'287082');
  t.mock.method(Date,'now',()=>59000);
  assert.equal(validStep(secret,'287082'),1);
  assert.equal(validStep(secret,'287082',1),null);
  assert.equal(validStep(secret,'abc123'),null);
  const key='ab'.repeat(32),cipher=encryptSecret(secret,key);
  assert.deepEqual(decryptSecret(cipher,key),secret);
  assert.throws(()=>decryptSecret(cipher,'cd'.repeat(32)));
});
