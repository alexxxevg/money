export const VERSION = 1;
export const uid = () => globalThis.crypto.randomUUID();
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};
export const currentYear = () => Number(today().slice(0,4));
export function amount(value) {
  const s = String(value).trim().replace(',','.');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) throw new Error('Введите сумму в рублях, не более двух знаков после запятой.');
  const cents = Math.round(Number(s)*100);
  if (!Number.isSafeInteger(cents) || cents <= 0 || cents > 100000000000) throw new Error('Сумма должна быть больше нуля и не превышать 1 млрд ₽.');
  return cents;
}
export function validDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T12:00:00Z`);
  return Number(s.slice(0,4)) >= 1900 && Number(s.slice(0,4)) <= 2200 && !Number.isNaN(d.getTime()) && d.toISOString().slice(0,10) === s;
}
export function yearDate(date, year) {
  let value = `${year}${date.slice(4)}`;
  if (value.endsWith('-02-29') && !validDate(value)) value = `${year}-02-28`;
  if (!validDate(value)) throw new Error('Проверьте дату и год.');
  return value;
}
export function emptyData() { return {version:VERSION,people:[],events:[],debts:[],defaultAmount:30000}; }
export function eventTotals(event) {
  const collected = event.payments.reduce((a,p)=>a+p.amount,0);
  const own = (event.ownContributions||[]).reduce((a,p)=>a+p.amount,0);
  const transferred = event.outflows.reduce((a,p)=>a+p.amount,0);
  const expected = event.participants.filter(p=>p.included).reduce((a,p)=>a+p.expected,0);
  const received = personId => event.payments.filter(p=>p.personId===personId).reduce((a,p)=>a+p.amount,0);
  const complete = event.participants.filter(p=>p.included).every(p=>received(p.personId)>=p.expected);
  return {collected,own,transferred,expected,remaining:collected+own-transferred,received,complete};
}
export const employmentStatus = person => person.status || (person.active?'working':'inactive');
export const canCollect = person => !!person && employmentStatus(person)==='working';
export function preserveLegacyFields(value, previous) {
  const data=structuredClone(value);
  for(const p of Array.isArray(data?.people)?data.people:[]){
    const old=previous.people.find(x=>x.id===p?.id);
    if(p&&p.status===undefined&&old?.status&&p.active===old.active)p.status=old.status;
  }
  for(const e of Array.isArray(data?.events)?data.events:[]){
    const old=previous.events.find(x=>x.id===e?.id);if(!e||!old)continue;
    if(e.ownContributions===undefined)e.ownContributions=structuredClone(old.ownContributions||[]);
    for(const p of Array.isArray(e.payments)?e.payments:[]){
      const prior=old.payments.find(x=>x.id===p?.id);
      if(p&&p.month===undefined&&prior?.month&&e.monthly&&prior.personId===p.personId&&prior.amount===p.amount&&prior.date===p.date)p.month=prior.month;
    }
  }
  return data;
}
export function sortedParticipants(participants,event) {
  const received=new Map();
  for(const payment of event?.payments||[])received.set(payment.personId,(received.get(payment.personId)||0)+payment.amount);
  return [...participants].sort((a,b)=>(received.get(a.personId)||0)-(received.get(b.personId)||0)||a.name.localeCompare(b.name,'ru'));
}
export const visibleParticipants = (event,people) => sortedParticipants(event.participants.filter(p=>canCollect(people.find(x=>x.id===p.personId))),event);
export function addOwnContribution(event,sum,date,note='') {
  if(event.closed)throw new Error('Сначала возобновите расчёты.');
  if(!Number.isSafeInteger(sum)||sum<=0||sum>100000000000||!validDate(date))throw new Error('Проверьте сумму и дату.');
  (event.ownContributions||=[]).push({id:uid(),amount:sum,date,note});
}
export const debtRemaining = debt => debt.amount-debt.repayments.reduce((a,p)=>a+p.amount,0);
export function currentCollectionVisible(event, people) {
  return !event.closed && !(event.kind==='birthday' && people.some(p=>p.id===event.recipientId&&!canCollect(p)));
}
export const paymentMonth = payment => payment.month || payment.date.slice(0,7);
export const validMonth = month => typeof month==='string'&&/^\d{4}-\d{2}$/.test(month)&&validDate(month+'-01');
export function collectionMonths(event) {
  const year=event.date.slice(0,4);
  return [...new Set([...Array.from({length:12},(_,i)=>`${year}-${String(i+1).padStart(2,'0')}`),...event.payments.map(paymentMonth)])].sort();
}
export function sortedPeople(people) {
  return [...people].sort((a,b)=>a.name.localeCompare(b.name,'ru'));
}
export function cancelPayment(event, paymentId) {
  const index=event.payments.findIndex(p=>p.id===paymentId);
  if(index<0)throw new Error('Взнос уже отменён или изменён.');
  event.payments.splice(index,1);
  event.collectionClosed=false;event.closed=false;
}
export function settledHistoryCandidates(data, cutoff=today()) {
  return data.events.filter(e=>!e.closed&&!e.monthly&&e.date<cutoff&&e.payments.length&&e.payments.every(p=>p.note.startsWith('Excel '))&&eventTotals(e).collected>0&&eventTotals(e).remaining===0);
}
export function finishSettledHistory(event) {
  const totals=eventTotals(event);
  if(event.monthly||!event.payments.length||totals.collected<=0||totals.remaining!==0)throw new Error('Этот сбор нельзя завершить как исторический.');
  for(const p of event.participants){
    const received=totals.received(p.personId);
    if(received>0){p.included=true;p.expected=received;}
    else if(p.included){p.included=false;p.reason='Исторический сбор завершён · взнос не требуется';}
  }
  closeCollection(event);closeEvent(event);
}
export function newEvent(data, {title,date,kind='birthday',recipientId='',recurring=true,monthly=false,participants}) {
  if (!title.trim()) throw new Error('Введите название.');
  if (!validDate(date)) throw new Error('Укажите корректную дату мероприятия.');
  return {id:uid(),seriesId:uid(),title:title.trim(),date,kind,recipientId,recurring,monthly,collectionClosed:false,closed:false,participants:participants || data.people.filter(canCollect).map(p=>({personId:p.id,name:p.name,included:p.id!==recipientId,expected:data.defaultAmount,reason:p.id===recipientId?'Именинник':''})),payments:[],outflows:[],ownContributions:[],createdAt:new Date().toISOString()};
}
export function addPayment(event, personId, sum, date, note='', month='') {
  if(event.closed || event.collectionClosed) throw new Error('Сначала возобновите сбор.');
  const person = event.participants.find(p=>p.personId===personId);
  if(!person?.included) throw new Error('Этот человек не участвует в сборе.');
  if(!Number.isSafeInteger(sum)||sum<=0||!validDate(date)) throw new Error('Проверьте сумму и дату.');
  if(month&&(!event.monthly||!validMonth(month)))throw new Error('Проверьте месяц взноса.');
  event.payments.push({id:uid(),personId,amount:sum,date,note,...(event.monthly?{month:month||date.slice(0,7)}:{})});
}
export function addOutflow(event, sum, date, kind='transfer', note='') {
  if(event.closed) throw new Error('Сначала возобновите расчёты.');
  if(!Number.isSafeInteger(sum)||sum<=0||!validDate(date)) throw new Error('Проверьте сумму и дату.');
  // Advance payments are allowed, but must be reconciled before closing.
  event.outflows.push({id:uid(),amount:sum,date,kind,note});
}
export function closeCollection(event) {
  if (!eventTotals(event).complete) throw new Error('Не все участники сдали полную сумму. Проверьте взносы и состав участников.');
  event.collectionClosed = true;
}
export function closeEvent(event) {
  if (!event.collectionClosed) throw new Error('Сначала завершите сбор.');
  if (eventTotals(event).remaining !== 0) throw new Error('Для завершения расчётов остаток должен быть 0 ₽. Отметьте передачи, расходы или возвраты.');
  event.closed = true;
}
export function addRepayment(debt,sum,date,note='') {
  if (!Number.isSafeInteger(sum)||sum<=0||!validDate(date)) throw new Error('Проверьте сумму и дату.');
  if(date<debt.date) throw new Error('Возврат не может быть раньше выдачи долга.');
  if(sum>debtRemaining(debt)) throw new Error('Возврат превышает остаток долга.');
  debt.repayments.push({id:uid(),amount:sum,date,note});
}
export function annualCandidates(data,sourceYear,targetYear) {
  if (!Number.isInteger(targetYear)||targetYear<1900||targetYear>2200||targetYear<=sourceYear) throw new Error('Выберите следующий год или более поздний.');
  const existing = new Set(data.events.filter(e=>Number(e.date.slice(0,4))===targetYear).map(e=>e.seriesId));
  return data.events.filter(e=>Number(e.date.slice(0,4))===sourceYear&&e.recurring&&!existing.has(e.seriesId)&&(e.kind!=='birthday'||!e.recipientId||canCollect(data.people.find(p=>p.id===e.recipientId)))&&!(e.kind==='birthday'&&e.recipientId&&data.events.some(x=>x.kind==='birthday'&&x.recipientId===e.recipientId&&Number(x.date.slice(0,4))===targetYear))).map(e=>({...e,id:uid(),date:yearDate(e.date,targetYear),title:e.kind==='newyear'?e.title.replace(/20\d{2}/g,String(targetYear+1)):e.title,collectionClosed:false,closed:false,payments:[],outflows:[],ownContributions:[],createdAt:new Date().toISOString(),participants:e.participants.filter(p=>canCollect(data.people.find(x=>x.id===p.personId))).map(p=>({...p,name:data.people.find(x=>x.id===p.personId).name})).concat(data.people.filter(p=>canCollect(p)&&!e.participants.some(x=>x.personId===p.id)).map(p=>({personId:p.id,name:p.name,included:p.id!==e.recipientId,expected:data.defaultAmount,reason:p.id===e.recipientId?'Именинник':''})))})).filter(e=>e.participants.some(p=>p.included));
}
export function birthdayCandidates(data,year) {
  if(!Number.isInteger(year)||year<1900||year>2200) throw new Error('Проверьте год.');
  return data.people.filter(p=>canCollect(p)&&p.birthday&&!data.events.some(e=>e.kind==='birthday'&&e.recipientId===p.id&&Number(e.date.slice(0,4))===year)).map(p=>newEvent(data,{title:`День рождения · ${p.name.split(' ').slice(0,2).join(' ')}`,date:yearDate(`2000-${p.birthday}`,year),recipientId:p.id}));
}
export function demoData() {
  const data=emptyData(),year=currentYear();
  data.people=[['Мария Иванова','02-02'],['Иван Петров','02-20'],['Ольга Соколова','08-28'],['Елена Орлова','09-19'],['Александр Волков','10-18'],['Артём Смирнов','11-11']].map(([name,birthday])=>({id:uid(),name,birthday,active:true,phone:''}));
  const event=newEvent(data,{title:'День рождения Александра',date:`${year}-10-18`,recipientId:data.people[4].id});
  [0,1,3].forEach(i=>addPayment(event,data.people[i].id,30000,`${year}-10-01`));
  addOutflow(event,60000,`${year}-10-02`,'transfer','Первая часть подарка');
  data.events.push(event,newEvent(data,{title:`Новый год ${year+1}`,date:`${year}-12-31`,kind:'newyear',monthly:true,participants:data.people.map(p=>({personId:p.id,name:p.name,included:true,expected:360000,reason:''}))}));
  data.debts.push({id:uid(),name:'Артём Смирнов',amount:500000,date:`${year}-09-01`,due:`${year}-11-01`,note:'Пример личного долга',repayments:[{id:uid(),amount:200000,date:`${year}-09-15`,note:''}]});
  return data;
}
export function validateData(value) {
  const fail=()=>{throw new Error('Файл не является корректной резервной копией «Высота».');};
  const text=(s,max=500)=>typeof s==='string'&&s.length<=max;
  const positive=n=>Number.isSafeInteger(n)&&n>0&&n<=100000000000;
  const unique=items=>{if(!Array.isArray(items)||items.length>20000)fail();const ids=new Set();for(const x of items){if(!x||!text(x.id,100)||!x.id||ids.has(x.id))fail();ids.add(x.id);}return ids;};
  if(!value||value.version!==VERSION||!positive(value.defaultAmount))fail();
  const ids=unique(value.people);unique(value.events);unique(value.debts);
  for(const p of value.people)if(!text(p.name,200)||!p.name.trim()||typeof p.active!=='boolean'||(p.status!==undefined&&!['working','maternity','inactive'].includes(p.status))||!text(p.phone||'',100)||!text(p.birthday||'',5)||(p.birthday&&!validDate(`2000-${p.birthday}`)))fail();
  for(const e of value.events){
    if(!text(e.title,200)||!e.title.trim()||!text(e.seriesId,100)||!e.seriesId||!validDate(e.date)||!['birthday','gift','party','newyear','other'].includes(e.kind)||typeof e.recurring!=='boolean'||typeof e.monthly!=='boolean'||typeof e.closed!=='boolean'||typeof e.collectionClosed!=='boolean'||!text(e.recipientId,100)||!Array.isArray(e.participants)||e.participants.length>20000)fail();
    const ps=new Set();for(const p of e.participants){if(!ids.has(p.personId)||ps.has(p.personId)||!text(p.name,200)||typeof p.included!=='boolean'||!positive(p.expected)||!text(p.reason||'',200))fail();ps.add(p.personId);}
    unique(e.payments);unique(e.outflows);unique(e.ownContributions||[]);
    for(const p of e.ownContributions||[])if(!positive(p.amount)||!validDate(p.date)||!text(p.note||''))fail();
    for(const p of e.payments)if(!ps.has(p.personId)||!positive(p.amount)||!validDate(p.date)||!text(p.note||'')||(p.month!==undefined&&(!e.monthly||!validMonth(p.month))))fail();
    for(const p of e.outflows)if(!positive(p.amount)||!validDate(p.date)||!['transfer','expense','return'].includes(p.kind)||!text(p.note||''))fail();
    const totals=eventTotals(e);
    if(e.collectionClosed&&!totals.complete||e.closed&&(!e.collectionClosed||totals.remaining!==0))fail();
  }
  for(const d of value.debts){if(!text(d.name,200)||!d.name.trim()||!positive(d.amount)||!validDate(d.date)||!text(d.due,10)||(d.due&&(!validDate(d.due)||d.due<d.date))||!text(d.note||''))fail();unique(d.repayments);for(const p of d.repayments)if(!positive(p.amount)||!validDate(p.date)||p.date<d.date||!text(p.note||''))fail();if(debtRemaining(d)<0)fail();}
  // Whitelist imported fields rather than allowing extra data to be persisted.
  return {version:VERSION,defaultAmount:value.defaultAmount,people:value.people.map(p=>({id:p.id,name:p.name,status:employmentStatus(p),active:canCollect(p),birthday:p.birthday||'',phone:p.phone||''})),events:value.events.map(e=>({id:e.id,seriesId:e.seriesId,title:e.title,date:e.date,kind:e.kind,recipientId:e.recipientId,recurring:e.recurring,monthly:e.monthly,closed:e.closed,collectionClosed:e.collectionClosed,createdAt:text(e.createdAt,100)?e.createdAt:'',ownContributions:(e.ownContributions||[]).map(p=>({id:p.id,amount:p.amount,date:p.date,note:p.note||''})),participants:e.participants.map(p=>({personId:p.personId,name:p.name,included:e.closed?p.included:(p.included&&canCollect(value.people.find(x=>x.id===p.personId))),expected:p.expected,reason:!e.closed&&!canCollect(value.people.find(x=>x.id===p.personId))?({maternity:'В декрете',inactive:'Больше не работает'})[employmentStatus(value.people.find(x=>x.id===p.personId))]:p.reason||''})),payments:e.payments.map(p=>({id:p.id,personId:p.personId,amount:p.amount,date:p.date,note:p.note||'',...(e.monthly?{month:paymentMonth(p)}:{})})),outflows:e.outflows.map(p=>({id:p.id,amount:p.amount,date:p.date,kind:p.kind,note:p.note||''}))})),debts:value.debts.map(d=>({id:d.id,name:d.name,amount:d.amount,date:d.date,due:d.due,note:d.note||'',repayments:d.repayments.map(p=>({id:p.id,amount:p.amount,date:p.date,note:p.note||''}))}))};
}

export function formatDate(value){const s=String(value||'');const m=s.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[ T])/);return m?`${m[3]}.${m[2]}.${m[1]}`:s;}
