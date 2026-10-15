export function reserveEstimate(zkh,asOf=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Novosibirsk',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())){
 const [year,month]=asOf.split('-').map(Number),months=[];
 for(let offset=6;offset>=1;offset--){const date=new Date(Date.UTC(year,month-1-offset,1));months.push({month:date.toISOString().slice(0,7),utilities:0,services:0,taxes:0,total:0});}
 const result={available:!!zkh,months,total:0,average:0,unknownCount:0,undatedCount:0,missingObjectMonths:[]};if(!zkh)return result;
 const periods=new Map(months.map(row=>[row.month,row])),objects=(zkh.objects||[]).filter(o=>!o.archived),ids=new Set(objects.map(o=>o.id)),services=new Map((zkh.services||[]).map(s=>[s.id,s])),seen=new Set();
 function add(payment,category,objectId){if(payment.pending||payment.date>asOf)return;const period=(payment.date||payment.month||'').slice(0,7),row=periods.get(period);if(!row)return;if(payment.amount===null||payment.amount===undefined){if(payment.date)result.unknownCount++;return;}if(!Number.isSafeInteger(payment.amount))return;const amount=payment.amount+(Number.isSafeInteger(payment.commission)?payment.commission:0);row[category]+=amount;row.total+=amount;if(amount&&!payment.date)result.undatedCount++;if(objectId&&amount)seen.add(objectId+'|'+period);}
 for(const payment of zkh.payments||[]){const service=services.get(payment.serviceId);if(!service)continue;if(service.objectId==='services')add(payment,'services');else if(ids.has(service.objectId))add(payment,'utilities',service.objectId);}
 for(const payment of [...zkh.taxes||[],...zkh.propertyTaxes||[]])add(payment,'taxes');
 for(const object of objects)for(const row of months)if(!seen.has(object.id+'|'+row.month))result.missingObjectMonths.push({month:row.month,object:object.name});
 result.total=months.reduce((sum,row)=>sum+row.total,0);result.average=Math.round(result.total/6);return result;
}

export function applyReserve(finance,zkh,asOf){
 const estimate=reserveEstimate(zkh,asOf);finance.reserveEstimate=estimate;
 if(finance.reservePlan&&(estimate.available||finance.reservePlan.paymentsOverride!==null))finance.reserved=finance.reservePlan.mortgage+(finance.reservePlan.paymentsOverride??estimate.average);
 return finance;
}
