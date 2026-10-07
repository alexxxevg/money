export function validateFinance(input){
 const fail=message=>{throw Object.assign(new Error(message),{status:400})};
 if(!input||typeof input!=='object'||Array.isArray(input))fail('Некорректные финансовые данные.');
 const copy=JSON.parse(JSON.stringify(input));
 for(const key of ['incomes','sales','cards','stock','accounts','mortgages','family']){
  if(!Array.isArray(copy[key])||copy[key].length>20000)fail('Проверьте раздел '+key);
  const ids=new Set();for(const row of copy[key]){if(!row||typeof row!=='object'||typeof row.id!=='string'||row.id.length>100||ids.has(row.id))fail('Некорректная или повторная запись.');ids.add(row.id);
   for(const [field,value]of Object.entries(row))if(['amount','balance','initial','received','revenue','costOverride','revenueOverride','interest','openingBalance2025'].includes(field)&&(!Number.isSafeInteger(value)||Math.abs(value)>1e14))fail('Некорректная денежная сумма.');
   for(const field of ['cost','price','unitCost','unitPrice','quantity','actualQuantity'])if(row[field]!==undefined&&(!Number.isFinite(row[field])||Math.abs(row[field])>1e14))fail('Некорректное количество или цена.');
   if(key==='incomes'&&!/^20\d\d-(0[1-9]|1[0-2])$/.test(row.month))fail('Некорректный месяц дохода.');
   if(row.date&&!/^20\d\d-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(row.date))fail('Некорректная дата.');
  }
 }
 for(const k of ['credit','reserved'])if(!Number.isSafeInteger(copy[k])||copy[k]<0)fail('Некорректное обязательство.');
 if(JSON.stringify(copy).length>8000000)fail('Слишком много данных.');return copy;
}
export const emptyFinance=()=>({incomes:[],sales:[],cards:[],stock:[],accounts:[],mortgages:[],family:[],credit:0,reserved:0,bonuses:[]});
