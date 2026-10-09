import {installMoneyDisplay} from './money-display.js';
installMoneyDisplay();
import {api,loginScreen} from './auth.js';
const root=document.getElementById('app');
async function show(user){
 if(location.pathname.replace(/\/$/,'')==='/cashback'){const {startCashback}=await import('./cashback.js');await startCashback(root,user);return;}
 if(location.pathname.replace(/\/$/,'')==='/zkh'){const {startZkh}=await import('./zkh.js');await startZkh(root,user);return;}
 if(location.pathname.replace(/\/$/,'')==='/finance'){const {startFinance}=await import('./finance.js');await startFinance(root,user);return;}
 root.innerHTML=`<header class="topbar"><a class="brand" href="/" style="text-decoration:none;color:inherit">Баланс<em>.</em></a><button id="portal-passkeys">Вход по отпечатку</button><button id="portal-logout">Выйти</button></header><main class="portal portal-home"><h1>Мои финансы</h1><div class="portal-grid"><a href="/cashback"><h2>Кэшбэки</h2><p>Категории банков</p></a><a href="/sb"><h2>Сборы</h2><p>Коллеги и мероприятия</p></a><a href="/finance"><h2>Доход</h2><p>Доходы и продажи</p></a><a href="/zkh"><h2>ЖКХ</h2><p>Платежи и услуги</p></a></div></main>`;
 document.getElementById('portal-passkeys').onclick=async()=>{try{const {passkeySettings}=await import('./passkeys-client.js');await passkeySettings();}catch(e){alert(e.message);}};
 document.getElementById('portal-logout').onclick=async()=>{try{await api('/api/auth/logout',{method:'POST',body:'{}'});loginScreen(root,show);}catch{alert('Не удалось выйти. Повторите позже.');}};
}
if(location.pathname.replace(/\/$/,'')==='/sb')await import('./app.js');
else{root.innerHTML='<main class="auth-screen"><p role="status">Подключение к аккаунту…</p></main>';try{const {user}=await api('/api/auth/me');await show(user);}catch(e){loginScreen(root,show,e.status===401?'':'Нет связи с сервером.');}}
if('serviceWorker' in navigator&&isSecureContext)navigator.serviceWorker.register('/sw.js').catch(()=>{});
