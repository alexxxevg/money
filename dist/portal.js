import {api,loginScreen} from './auth.js';
const root=document.getElementById('app');
async function show(user){
 if(location.pathname.replace(/\/$/,'')==='/cashback'){const {startCashback}=await import('./cashback.js');await startCashback(root,user);return;}
 if(location.pathname.replace(/\/$/,'')==='/zkh'){const {startZkh}=await import('./zkh.js');await startZkh(root,user);return;}
 if(location.pathname.replace(/\/$/,'')==='/finance'){const {startFinance}=await import('./finance.js');await startFinance(root,user);return;}
 root.innerHTML=`<header class="topbar"><a class="brand" href="/" style="text-decoration:none;color:inherit">Свои деньги<em>.</em></a><button id="portal-logout">Выйти</button></header><main class="portal"><p class="muted">Личный кабинет</p><h1>${location.pathname.startsWith('/zkh')?'ЖКХ':'Мои финансы'}</h1><p class="muted">${location.pathname.startsWith('/zkh')?'Раздел готовится. Здесь будет учёт коммунальных платежей.':'Выберите раздел'}</p><div class="portal-grid"><a href="/sb"><span>01</span><h2>Работа</h2><p>Сборы, коллеги, мероприятия и долги</p><b>Открыть →</b></a><a href="/finance"><span>02</span><h2>Доход</h2><p>Доходы, продажи, склад и счета</p><b>Открыть →</b></a><a href="/zkh"><span>03</span><h2>ЖКХ</h2><p>Коммунальные платежи и услуги</p><b>Открыть →</b></a><a href="/cashback"><span>04</span><h2>Кэшбэки</h2><p>Выбранные категории банков по месяцам</p><b>Открыть →</b></a></div></main>`;
 document.getElementById('portal-logout').onclick=async()=>{try{await api('/api/auth/logout',{method:'POST',body:'{}'});loginScreen(root,show);}catch{alert('Не удалось выйти. Повторите позже.');}};
}
if(location.pathname.replace(/\/$/,'')==='/sb')await import('./app.js');
else{root.innerHTML='<main class="auth-screen"><p role="status">Подключение к аккаунту…</p></main>';try{const {user}=await api('/api/auth/me');await show(user);}catch(e){loginScreen(root,show,e.status===401?'':'Нет связи с сервером.');}}
if('serviceWorker' in navigator&&isSecureContext)navigator.serviceWorker.register('/sw.js').catch(()=>{});
