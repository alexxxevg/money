import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { emptyData, validateData } from './dist/model.js';
import { hashPassword, verifyPassword, tokenHash, newToken, checkCredentials, checkPasswordChange } from './security.js';

const sql = postgres(process.env.DATABASE_URL, { max: 8, prepare: false, connect_timeout: 10 });
const origin = new URL(process.env.APP_URL || 'http://localhost:3000').origin;
const secure = origin.startsWith('https:');
const cookieName = secure ? '__Host-money_session' : 'money_session';
await sql`CREATE TABLE IF NOT EXISTS money_users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL UNIQUE, name text NOT NULL, password_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`;
await sql`CREATE TABLE IF NOT EXISTS money_sessions (token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES money_users(id) ON DELETE CASCADE, expires_at timestamptz NOT NULL)`;
await sql`CREATE TABLE IF NOT EXISTS money_states (user_id uuid PRIMARY KEY REFERENCES money_users(id) ON DELETE CASCADE, revision integer NOT NULL DEFAULT 0, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`;
const dummyHash = await hashPassword(newToken());
const limits = new Map();
setInterval(() => { const now = Date.now(); for (const [k,v] of limits) if (v.until < now) limits.delete(k); sql`DELETE FROM money_sessions WHERE expires_at < now()`.catch(()=>{}); }, 60000).unref();
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const send = (res, status, value) => { res.writeHead(status, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store' }); res.end(JSON.stringify(value)); };
async function body(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) fail(415, 'Требуется JSON.');
  let size = 0, chunks = [];
  for await (const chunk of req) { size += chunk.length; if (size > 10000000) fail(413, 'Файл слишком большой.'); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString()); } catch { fail(400, 'Некорректный JSON.'); }
}
function cookie(res, token, age = 2592000) {
  res.setHeader('Set-Cookie', `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${secure?'; Secure':''}`);
}
async function current(req) {
  const raw = req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1);
  if (!raw || !/^[a-f0-9]{64}$/.test(raw)) return null;
  const [user] = await sql`SELECT u.id,u.name,u.email FROM money_users u JOIN money_sessions s ON s.user_id=u.id WHERE s.token_hash=${tokenHash(raw)} AND s.expires_at>now()`;
  return user ? { user, hash:tokenHash(raw) } : null;
}
const assets = new Map(Object.entries({ '/':'index.html', '/index.html':'index.html', '/app.js':'app.js', '/app.css':'app.css', '/model.js':'model.js', '/auth.js':'auth.js', '/sw.js':'sw.js', '/manifest.webmanifest':'manifest.webmanifest', '/icon.svg':'icon.svg', '/icon-192.png':'icon-192.png', '/icon-512.png':'icon-512.png', '/icon-maskable.png':'icon-maskable.png' }));
const mime = { html:'text/html', js:'text/javascript', css:'text/css', webmanifest:'application/manifest+json', svg:'image/svg+xml', png:'image/png' };
const server = http.createServer(async (req,res) => {
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','same-origin');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
  try {
    const path = new URL(req.url, origin).pathname;
    if (path === '/api/health' && req.method === 'GET') { await sql`SELECT 1`; return send(res,200,{ok:true}); }
    if (path.startsWith('/api/')) {
      if (!['GET','POST','PUT'].includes(req.method)) fail(405,'Метод не поддерживается.');
      if (req.method !== 'GET' && req.headers.origin !== origin) fail(403,'Недопустимый источник запроса.');
      if (['/api/auth/register','/api/auth/login'].includes(path) && req.method === 'POST') {
        // Use the socket address, never an arbitrary client-supplied forwarding header.
        const key = req.socket.remoteAddress;
        let entry = limits.get(key); if (!entry || entry.until<Date.now()) { entry={count:0,until:Date.now()+900000}; limits.set(key,entry); }
        if (++entry.count>30) fail(429,'Слишком много попыток. Повторите через 15 минут.');
        const input = await body(req), {email,password} = checkCredentials(input);
        let user, token=newToken();
        if (path.endsWith('register')) {
          const name = String(input.name || '').trim(); if (!name || name.length>100) fail(400,'Введите имя.');
          const passwordHash = await hashPassword(password);
          try { user = await sql.begin(async tx => {
            const [created] = await tx`INSERT INTO money_users(email,name,password_hash) VALUES(${email},${name},${passwordHash}) RETURNING id,name,email`;
            await tx`INSERT INTO money_states(user_id,data) VALUES(${created.id},${tx.json(emptyData())})`;
            return created;
          }); } catch(error) { if(error.code==='23505') fail(409,'Не удалось создать аккаунт с этой почтой. Попробуйте войти.'); throw error; }
        } else {
          user=await sql.begin(async tx=>{
          const [found] = await tx`SELECT id,name,email,password_hash FROM money_users WHERE email=${email} FOR UPDATE`;
          const valid = await verifyPassword(password,found?.password_hash || dummyHash);
          if (!found || !valid) fail(401,'Неверная почта или пароль.');
          await tx`INSERT INTO money_sessions(token_hash,user_id,expires_at) VALUES(${tokenHash(token)},${found.id},now()+interval '30 days')`;
          return {id:found.id,name:found.name,email:found.email};
          });
        }
        if(path.endsWith('register')) await sql`INSERT INTO money_sessions(token_hash,user_id,expires_at) VALUES(${tokenHash(token)},${user.id},now()+interval '30 days')`;
        cookie(res,token); return send(res,200,{user});
      }
      const session = await current(req); if (!session) fail(401,'Войдите в аккаунт.');
      if (path==='/api/auth/me' && req.method==='GET') return send(res,200,{user:session.user});
      if (path==='/api/auth/password' && req.method==='POST') {
        const key='password:'+session.user.id;
        let entry=limits.get(key); if(!entry||entry.until<Date.now()){entry={count:0,until:Date.now()+900000};limits.set(key,entry);}
        if(++entry.count>10)fail(429,'Слишком много попыток. Повторите через 15 минут.');
        const input=await body(req);
        const {currentPassword,password}=checkPasswordChange(input);
        await sql.begin(async tx=>{
          const [user]=await tx`SELECT password_hash FROM money_users WHERE id=${session.user.id} FOR UPDATE`;
          const [active]=await tx`SELECT token_hash FROM money_sessions WHERE token_hash=${session.hash} AND expires_at>now()`;
          if(!active)fail(401,'Войдите в аккаунт.');
          if(!await verifyPassword(currentPassword,user.password_hash))fail(400,'Текущий пароль неверный.');
          const encoded=await hashPassword(password);
          await tx`UPDATE money_users SET password_hash=${encoded} WHERE id=${session.user.id}`;
          await tx`DELETE FROM money_sessions WHERE user_id=${session.user.id} AND token_hash<>${session.hash}`;
        });
        return send(res,200,{ok:true});
      }
      if (path==='/api/auth/logout' && req.method==='POST') { await sql`DELETE FROM money_sessions WHERE token_hash=${session.hash}`; cookie(res,'',0); return send(res,200,{ok:true}); }
      if (path==='/api/state' && req.method==='GET') {
        const [state] = await sql`SELECT revision,data FROM money_states WHERE user_id=${session.user.id}`;
        return send(res,200,state);
      }
      if (path==='/api/state' && req.method==='PUT') {
        const input=await body(req); if (!Number.isSafeInteger(input.revision)||input.revision<0) fail(400,'Некорректная версия.');
        let data; try{data=validateData(input.data);}catch{fail(400,'Данные не прошли проверку.');}
        const [saved] = await sql`UPDATE money_states SET data=${sql.json(data)}, revision=revision+1, updated_at=now() WHERE user_id=${session.user.id} AND revision=${input.revision} RETURNING revision`;
        if (!saved) fail(409,'На другом устройстве уже появились изменения. Скачайте свою копию и загрузите актуальные данные.');
        return send(res,200,saved);
      }
      fail(404,'Не найдено.');
    }
    if (!['GET','HEAD'].includes(req.method) || !assets.has(path)) fail(404,'Не найдено.');
    const filename = assets.get(path), content = await readFile(fileURLToPath(new URL('./dist/'+filename,import.meta.url)));
    res.writeHead(200,{'Content-Type':mime[filename.split('.').pop()]+'; charset=utf-8','Cache-Control':'no-cache'});
    res.end(req.method==='HEAD'?undefined:content);
  } catch(error) { send(res,error.status||500,{error:error.status?error.message:'Ошибка сервера. Повторите позже.'}); if(!error.status) console.error('Request failed:',error.code||error.name); }
});
server.requestTimeout=30000;
server.listen(Number(process.env.PORT||3000),'0.0.0.0');
process.on('SIGTERM',()=>server.close(()=>sql.end().then(()=>process.exit(0))));
