import {test} from 'node:test';
import assert from 'node:assert/strict';
import {amount,validDate,yearDate,demoData,eventTotals,addPayment,addOutflow,closeCollection,closeEvent,debtRemaining,addRepayment,annualCandidates,birthdayCandidates,validateData,newEvent,uid} from './dist/model.js';
test('Money uses cents and rejects missing, negative, infinite and sub-cent values',()=>{
 assert.equal(amount('300,25'),30025);assert.equal(amount('0.01'),1);
 for(const n of ['','-10','0','1.001','Infinity','1e9','1000000001'])assert.throws(()=>amount(n));
});
test('Calendar handles valid dates and leap-day recurrence',()=>{
 assert.equal(validDate('2026-02-29'),false);assert.equal(validDate('2024-02-29'),true);
 assert.equal(yearDate('2024-02-29',2027),'2027-02-28');assert.equal(yearDate('2024-02-29',2028),'2028-02-29');
});
test('Partial contributions, full collection, payout and closure reconcile exactly',()=>{
 const d=demoData(),e=d.events[0],p=e.participants.filter(p=>p.included&&eventTotals(e).received(p.personId)===0);
 assert.equal(eventTotals(e).remaining,30000);assert.throws(()=>closeCollection(e));
 addPayment(e,p[0].personId,10000,e.date);assert.equal(eventTotals(e).complete,false);
 addPayment(e,p[0].personId,20000,e.date);addPayment(e,p[1].personId,30000,e.date);
 closeCollection(e);assert.throws(()=>addPayment(e,p[0].personId,100,e.date));assert.throws(()=>closeEvent(e));
 addOutflow(e,eventTotals(e).remaining,e.date);closeEvent(e);assert.equal(e.closed,true);assert.equal(eventTotals(e).remaining,0);
 assert.throws(()=>addOutflow(e,100,e.date));assert.doesNotThrow(()=>validateData(d));
});
test('Recipient cannot pay; advance expenditure stays distinct from debt',()=>{
 const d=demoData(),e=d.events[0];assert.throws(()=>addPayment(e,e.recipientId,30000,e.date));
 addOutflow(e,100000,e.date);assert.equal(eventTotals(e).remaining,-70000);assert.equal(debtRemaining(d.debts[0]),300000);
});
test('Partial debt repayments reject excess and dates before issue',()=>{
 const d=demoData().debts[0];addRepayment(d,10000,d.date);assert.equal(debtRemaining(d),290000);
 assert.throws(()=>addRepayment(d,290001,d.date));assert.throws(()=>addRepayment(d,100,'2000-01-01'));
 addRepayment(d,290000,d.date);assert.equal(debtRemaining(d),0);
});
test('Next-year copy clears money and statuses, removes inactive colleagues, adds new people, deduplicates',()=>{
 const d=demoData(),source=Number(d.events[0].date.slice(0,4));d.people[0].active=false;d.people.push({id:uid(),name:'Новый коллега',active:true,birthday:'02-29',phone:''});
 const next=annualCandidates(d,source,source+1);assert.equal(next.length,2);
 for(const e of next){assert.equal(e.payments.length,0);assert.equal(e.outflows.length,0);assert.equal(e.closed,false);assert.equal(e.collectionClosed,false);assert.ok(!e.participants.some(p=>p.personId===d.people[0].id));assert.ok(e.participants.some(p=>p.personId===d.people.at(-1).id));}
 d.events.push(...next);assert.equal(annualCandidates(d,source,source+1).length,0);assert.doesNotThrow(()=>validateData(d));
});
test('Birthday generation excludes recipient and avoids overlap with copying',()=>{
 const d=demoData(),source=Number(d.events[0].date.slice(0,4));const next=birthdayCandidates(d,source+1);
 assert.equal(next.length,6);for(const e of next)assert.equal(e.participants.find(p=>p.personId===e.recipientId).included,false);
 d.events.push(...next);assert.equal(annualCandidates(d,source,source+1).length,1);assert.equal(birthdayCandidates(d,source+1).length,0);
});
test('Monthly records aggregate independently and returns reduce held balance',()=>{
 const d=demoData(),e=d.events[1],p=e.participants[0];
 addPayment(e,p.personId,30000,e.date.slice(0,4)+'-01-15');addPayment(e,p.personId,30000,e.date.slice(0,4)+'-02-15');
 assert.equal(eventTotals(e).received(p.personId),60000);assert.equal(eventTotals(e).complete,false);
 addOutflow(e,30000,e.date,'return');assert.equal(eventTotals(e).remaining,30000);
});
test('Backup validation rejects tampering and preserves a valid roundtrip',()=>{
 const d=demoData(),round=validateData(JSON.parse(JSON.stringify(d)));assert.equal(eventTotals(round.events[0]).collected,90000);
 const invalid=structuredClone(d);invalid.events[0].closed=true;assert.throws(()=>validateData(invalid));
 const money=structuredClone(d);money.events[0].payments[0].amount=-1;assert.throws(()=>validateData(money));
 const duplicate=structuredClone(d);duplicate.people.push(duplicate.people[0]);assert.throws(()=>validateData(duplicate));
 const unknown=structuredClone(d);unknown.events[0].payments[0].personId='unknown';assert.throws(()=>validateData(unknown));
 const script=structuredClone(d);script.people[0].name='<img onerror=alert(1)>';assert.equal(validateData(script).people[0].name,'<img onerror=alert(1)>');
});
