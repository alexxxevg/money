import { randomBytes, scrypt as derive, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(derive);
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${(await scrypt(password, salt, 64)).toString('hex')}`;
}
export async function verifyPassword(password, encoded) {
  const [salt, hex] = encoded.split(':');
  const expected = Buffer.from(hex, 'hex');
  const actual = await scrypt(password, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export const tokenHash = token => createHash('sha256').update(token).digest('hex');
export const newToken = () => randomBytes(32).toString('hex');
export function checkPasswordChange(input) {
  const {currentPassword,newPassword,confirmPassword}=input;
  const reject=message=>{throw Object.assign(new Error(message),{status:400});};
  if(typeof currentPassword!=='string'||!currentPassword||currentPassword.length>128)reject('Введите текущий пароль.');
  if(typeof newPassword!=='string'||newPassword.length<10||newPassword.length>128)reject('Новый пароль: от 10 до 128 символов.');
  if(newPassword!==confirmPassword)reject('Новые пароли не совпадают.');
  if(newPassword===currentPassword)reject('Новый пароль должен отличаться от текущего.');
  return {currentPassword,password:newPassword};
}
export function checkCredentials(body) {
  const email = String(body.email || '').trim().toLowerCase();
  const password = body.password;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || typeof password !== 'string' || password.length < 10 || password.length > 128)
    throw Object.assign(new Error('Проверьте почту. Пароль: от 10 до 128 символов.'), { status: 400 });
  return { email, password };
}
