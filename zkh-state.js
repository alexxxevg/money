export const emptyZkh=()=>({objects:[],services:[],meters:[],payments:[],readings:[],taxes:[],propertyTaxes:[],insurance:[],warnings:[]});
export function validateZkh(input){
 const fail=m=>{throw Object.assign(new Error(m),{status:400});};
 if(!input||typeof input!=='object'||Array.isArray(input))fail('Некорректные данные ЖКХ.');
 const data=JSON.parse(JSON.stringify(input));data.propertyTaxes??=[];data.insurance??=[];
 const ids={};for(const key of ['objects','services','meters','payments','readings','taxes','propertyTaxes','insurance','warnings']){
  if(!Array.isArray(data[key])||data[key].length>20000)fail('Проверьте раздел '+key);ids[key]=new Set();
  for(const x of data[key]){if(!x||typeof x!=='object')fail('Некорректная запись.');if(key==='warnings')continue;
   if(typeof x.id!=='string'||x.id.length>100||ids[key].has(x.id))fail('Повторная или некорректная запись.');ids[key].add(x.id);
   if(['objects','services','meters'].includes(key)&&(typeof x.name!=='string'||!x.name.trim()||x.name.length>200))fail('Проверьте название.');
   if(['payments','readings','taxes'].includes(key)&&!/^20\d\d-(0[1-9]|1[0-2])$/.test(x.month))fail('Проверьте месяц.');
   if(key==='services'){for(const f of ['activeFrom','activeUntil'])if(x[f]&&!/^20\d\d-(0[1-9]|1[0-2])$/.test(x[f]))fail('Проверьте период участия услуги.');if(x.activeFrom&&x.activeUntil&&x.activeUntil<x.activeFrom)fail('Проверьте период участия услуги.');}
   if(key==='insurance'){if(!['osago','kasko'].includes(x.kind)||typeof x.car!=='string'||!x.car.trim()||x.car.length>200||typeof x.company!=='string'||x.company.length>200||typeof x.policyNumber!=='string'||x.policyNumber.length>100||!x.date||!Number.isSafeInteger(x.amount)||x.amount<0||!Array.isArray(x.files)||x.files.length>10||x.files.some(f=>!f||typeof f.id!=='string'||!/^[-a-f0-9]{36}$/i.test(f.id)||typeof f.name!=='string'||f.name.length>200))fail('Проверьте страховку и полисы.');for(const field of ['start','end'])if(x[field]){const d=new Date(x[field]+'T12:00:00Z');if(Number.isNaN(+d)||d.toISOString().slice(0,10)!==x[field])fail('Проверьте срок полиса.');}if(x.start&&x.end&&x.end<x.start)fail('Окончание полиса раньше начала.');}
   if(key==='propertyTaxes'&&(!['self','mom'].includes(x.payer)||!Number.isInteger(x.taxYear)||x.taxYear<2000||x.taxYear>2099||!['property','land','transport','combined'].includes(x.kind)||typeof x.object!=='string'||x.object.length>200||!x.date||!Number.isSafeInteger(x.amount)||x.amount<0))fail('Проверьте имущественный налог.');
   if(x.taxIncomeMonth!==undefined&&!/^20\d\d-(0[1-9]|1[0-2])$/.test(x.taxIncomeMonth))fail('Проверьте месяц налога.');
   if(x.date){if(!/^20\d\d-\d\d-\d\d$/.test(x.date))fail('Проверьте дату.');const d=new Date(x.date+'T12:00:00Z');if(Number.isNaN(+d)||d.toISOString().slice(0,10)!==x.date)fail('Проверьте дату.');}
   for(const field of ['amount','commission','income'])if(field in x&&x[field]!==null&&(!Number.isSafeInteger(x[field])||Math.abs(x[field])>1e14))fail('Проверьте денежную сумму.');
   if(key==='readings'&&(!Number.isFinite(x.value)||x.value<0||x.value>1e12))fail('Проверьте показание счётчика.');
   if(x.note!==undefined&&(typeof x.note!=='string'||x.note.length>1000))fail('Слишком длинный комментарий.');
  }
 }
 for(const x of [...data.services,...data.meters])if(x.objectId!=='services'&&!ids.objects.has(x.objectId))fail('Объект не найден.');
 for(const x of data.payments)if(!ids.services.has(x.serviceId))fail('Услуга не найдена.');
 for(const x of data.readings)if(!ids.meters.has(x.meterId))fail('Счётчик не найден.');
 if(JSON.stringify(data).length>8000000)fail('Слишком много данных.');return data;
}
