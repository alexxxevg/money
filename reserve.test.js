import test from 'node:test';
import assert from 'node:assert/strict';
import {reserveEstimate,applyReserve} from './dist/finance-reserve.js';
import {emptyFinance,validateFinance} from './finance-state.js';

test('reserve uses six completed months across years, paid dates, commissions and zero months',()=>{
 const zkh={objects:[{id:'home',name:'Home'},{id:'old',archived:true}],services:[{id:'u',objectId:'home'},{id:'s',objectId:'services'},{id:'a',objectId:'old'}],payments:[
  {serviceId:'u',month:'2025-07',date:'2025-08-10',amount:60000,commission:600},
  {serviceId:'s',month:'2025-09',amount:12000},
  {serviceId:'u',month:'2025-12',date:'2025-12-10',amount:99999,pending:true},
  {serviceId:'u',month:'2025-12',date:'2026-01-10',amount:99999},
  {serviceId:'u',month:'2025-10',date:'2025-10-10',amount:null},
  {serviceId:'a',month:'2025-10',amount:99999},
 ],taxes:[{month:'2025-10',date:'2025-11-10',amount:6000},{month:'2025-12',income:100000,amount:null}],propertyTaxes:[{date:'2025-12-10',amount:1200}],insurance:[{date:'2025-11-10',amount:99999}]};
 const result=reserveEstimate(zkh,'2026-01-15');
 assert.deepEqual(result.months.map(x=>x.month),['2025-07','2025-08','2025-09','2025-10','2025-11','2025-12']);
 assert.equal(result.months[0].total,0);assert.equal(result.months[1].utilities,60600);assert.equal(result.months[4].taxes,6000);
 assert.equal(result.total,79800);assert.equal(result.average,13300);assert.equal(result.unknownCount,1);assert.equal(result.undatedCount,1);
});

test('reserve keeps legacy total until configured; automatic history and manual override stay distinct',()=>{
 const finance={...emptyFinance(),reserved:2500000},zkh={objects:[],services:[],payments:[],taxes:[{date:'2026-09-10',amount:12609000}]};
 assert.equal(applyReserve(structuredClone(finance),zkh,'2026-10-15').reserved,2500000);
 finance.reservePlan={mortgage:500000,paymentsOverride:null};
 assert.equal(applyReserve(structuredClone(finance),zkh,'2026-10-15').reserved,2601500);
 assert.equal(applyReserve(structuredClone(finance),null,'2026-10-15').reserved,2500000);
 finance.reservePlan.paymentsOverride=2200000;
 assert.equal(applyReserve(structuredClone(finance),zkh,'2026-10-15').reserved,2700000);
 const clean=validateFinance({...finance,reserveEstimate:{average:-1}});assert.ok(!('reserveEstimate' in clean));
 for(const invalid of [{mortgage:-1,paymentsOverride:null},{mortgage:1,paymentsOverride:0.5},{mortgage:1}])assert.throws(()=>validateFinance({...finance,reservePlan:invalid}));
});
