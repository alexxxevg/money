import test from 'node:test';
import assert from 'node:assert/strict';
import {hashPassword,verifyPassword,tokenHash,newToken,checkCredentials} from './security.js';
test('passwords salted, verified and never stored as plaintext',async()=>{
 const a=await hashPassword('a-long-test-password'),b=await hashPassword('a-long-test-password');
 assert.notEqual(a,b);assert.ok(!a.includes('a-long-test-password'));
 assert.equal(await verifyPassword('a-long-test-password',a),true);
 assert.equal(await verifyPassword('wrong-password',a),false);
});
test('session tokens random; database stores only digest',()=>{
 const a=newToken(),b=newToken();assert.match(a,/^[a-f0-9]{64}$/);assert.notEqual(a,b);assert.notEqual(a,tokenHash(a));assert.equal(tokenHash(a),tokenHash(a));
});
test('credential validation normalizes email and rejects malformed input',()=>{
 assert.deepEqual(checkCredentials({email:' USER@Example.com ',password:'long-password'}),{email:'user@example.com',password:'long-password'});
 for(const input of [{email:'wrong',password:'long-password'},{email:'a@b.ru',password:'short'},{email:'a@b.ru',password:'x'.repeat(129)},{email:'a@b.ru',password:{}}])assert.throws(()=>checkCredentials(input));
});

 test('password change validates confirmation, length and difference',async()=>{
 const {checkPasswordChange}=await import('./security.js');
 const valid={currentPassword:'old-password-123',newPassword:'new-password-456',confirmPassword:'new-password-456'};
 assert.equal(checkPasswordChange(valid).password,valid.newPassword);
 for(const patch of [{currentPassword:null},{newPassword:'short',confirmPassword:'short'},{confirmPassword:'different'},{newPassword:valid.currentPassword,confirmPassword:valid.currentPassword},{newPassword:'x'.repeat(129),confirmPassword:'x'.repeat(129)}])assert.throws(()=>checkPasswordChange({...valid,...patch}),{status:400});
 });
