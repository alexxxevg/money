import {api} from './auth.js';
const banks=['СБЕР','Т-БАНК','Альфа-Банк','OZON Банк','ГазпромБанк','ВТБ','Яндекс'];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function startCashback(root,user){
 const style=document.createElement('link');style.rel='stylesheet';style.href='/finance.css';document.head.append(style);
 const loaded=await api('/api/cashback');let data=loaded.data,revision=loaded.revision;
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Novosibirsk',year:'numeric',month:'2-digit'}).formatToParts(new Date());
 let period=parts.find(p=>p.type==='year').value+'-'+parts.find(p=>p.type==='month').value,timer,busy=false,pending=false,dirty=false,failed=false;
 const monthNames=Array.from({length:12},(_,i)=>new Date(2026,i,1).toLocaleDateString('ru-RU',{month:'long'}));
 function status(text){root.querySelector('#cashback-status').textContent=text;root.querySelector('#cashback-retry').hidden=!failed;}
 async function save(){clearTimeout(timer);if(busy){pending=true;return;}if(!dirty)return;busy=true;pending=false;failed=false;status('Сохранение…');const snapshot=structuredClone(data);
  try{const result=await api('/api/cashback',{method:'PUT',body:JSON.stringify({revision,data:snapshot})});revision=result.revision;dirty=JSON.stringify(data)!==JSON.stringify(snapshot);status(dirty?'Сохранение…':'Все изменения сохранены');}
  catch(e){failed=true;status(e.message+' Введённые данные остаются на экране.');}
  finally{busy=false;if(!failed&&(pending||dirty))save();}
 }
 function render(){const years=[...new Set([Number(period.slice(0,4)),Number(parts.find(p=>p.type==='year').value),...Object.keys(data.months).map(m=>Number(m.slice(0,4)))])].sort((a,b)=>b-a);
 root.innerHTML=`<header class="topbar"><a class="brand" href="/" style="text-decoration:none;color:inherit">Свои деньги<em>.</em></a><button id="cashback-logout">Выйти</button></header><main class="portal"><p class="muted">Выбранные категории банков</p><h1>Кэшбэки</h1><div class="row" style="gap:16px;flex-wrap:wrap"><label class="fin-filter">Год<select id="cashback-year">${years.map(y=>`<option ${y===Number(period.slice(0,4))?'selected':''}>${y}</option>`).join('')}</select></label><label class="fin-filter">Месяц<select id="cashback-month">${monthNames.map((m,i)=>`<option value="${String(i+1).padStart(2,'0')}" ${i+1===Number(period.slice(5))?'selected':''}>${m}</option>`).join('')}</select></label><button id="cashback-prev">← Предыдущий месяц</button><button id="cashback-next">Следующий месяц →</button></div><p id="cashback-status" role="status">${busy?'Сохранение…':dirty?'Есть несохранённые изменения':'Все изменения сохранены'}</p><button id="cashback-retry" hidden>Повторить сохранение</button><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:16px">${banks.map(bank=>`<section class="panel"><h2 style="font-size:18px">${bank}</h2><label class="field">Категории на ${esc(monthNames[Number(period.slice(5))-1])} ${period.slice(0,4)}<textarea data-bank="${bank}" rows="4" maxlength="2000" placeholder="Например: Кафе 5%, АЗС 3%, Ремонт" style="width:100%;box-sizing:border-box;resize:vertical;padding:12px;border:1px solid #dedede;border-radius:6px;font:inherit">${esc(data.months[period]?.[bank]||'')}</textarea></label></section>`).join('')}</div><p><button id="cashback-export">Скачать резервную копию</button></p></main>`;
 root.querySelectorAll('[data-bank]').forEach(e=>e.addEventListener('input',()=>{data.months[period]??={};data.months[period][e.dataset.bank]=e.value;dirty=true;failed=false;status('Сохранение…');clearTimeout(timer);timer=setTimeout(save,650);}));
 const change=next=>{if(failed){status('Сначала сохраните изменения или скачайте резервную копию.');return;}save();period=next;render();};
 root.querySelector('#cashback-year').onchange=e=>change(e.target.value+period.slice(4));root.querySelector('#cashback-month').onchange=e=>change(period.slice(0,5)+e.target.value);
 for(const [id,delta] of [['prev',-1],['next',1]])root.querySelector('#cashback-'+id).onclick=()=>{const d=new Date(Number(period.slice(0,4)),Number(period.slice(5))-1+delta,1);if(d.getFullYear()<2000||d.getFullYear()>2099)return;change(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'));};
 root.querySelector('#cashback-retry').onclick=save;
 root.querySelector('#cashback-export').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify({format:'money-cashback-backup-v1',data},null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='cashback-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 root.querySelector('#cashback-logout').onclick=async()=>{if(dirty||busy){status('Дождитесь сохранения данных перед выходом.');return;}await api('/api/auth/logout',{method:'POST',body:'{}'});location.href='/';};
 }
 window.addEventListener('beforeunload',e=>{if(dirty||busy){e.preventDefault();e.returnValue='';}});render();
}

