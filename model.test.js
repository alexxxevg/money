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

test('historical closure preserves ledger, reconciles plan; candidates exclude future, monthly and unbalanced',async()=>{
 const {settledHistoryCandidates,finishSettledHistory}=await import('./dist/model.js');
 const data=demoData(),event=data.events[0];event.date='2023-01-01';event.payments.forEach(p=>p.note='Excel 2023');event.outflows[0].amount=eventTotals(event).collected;
 const ledger=JSON.stringify([event.payments,event.outflows]);
 assert.equal(settledHistoryCandidates(data,'2026-10-06').length,1);
 event.monthly=true;assert.equal(settledHistoryCandidates(data,'2026-10-06').length,0);event.monthly=false;
 event.date='2027-01-01';assert.equal(settledHistoryCandidates(data,'2026-10-06').length,0);event.date='2023-01-01';
 event.outflows[0].amount--;assert.equal(settledHistoryCandidates(data,'2026-10-06').length,0);assert.throws(()=>finishSettledHistory(event));event.outflows[0].amount++;
 finishSettledHistory(event);assert.equal(event.closed,true);assert.equal(eventTotals(event).complete,true);
 assert.equal(JSON.stringify([event.payments,event.outflows]),ledger);validateData(data);
});

test('inactive birthdays hidden from current list without changing historical records',async()=>{
 const {currentCollectionVisible}=await import('./dist/model.js');const e={closed:false,kind:'birthday',recipientId:'former'};
 assert.equal(currentCollectionVisible(e,[{id:'former',active:false}]),false);assert.equal(currentCollectionVisible(e,[{id:'former',active:true}]),true);
 assert.equal(currentCollectionVisible({...e,kind:'gift'},[{id:'former',active:false}]),true);assert.equal(e.closed,false);
});
test('people sorted by employment then calendar birthday, unknown last; source untouched',async()=>{
 const {sortedPeople}=await import('./dist/model.js');const people=[{name:'Б',birthday:'01-01',active:false},{name:'А',birthday:'12-01',active:true},{name:'В',birthday:'02-01',active:true},{name:'Г',birthday:'',active:true}];
 assert.deepEqual(sortedPeople(people).map(p=>p.name),['В','А','Г','Б']);assert.equal(people[0].name,'Б');
});
test('cancel selected partial payment reopens closed collection and preserves other operations',async()=>{
 const {cancelPayment}=await import('./dist/model.js');const d=demoData(),e=d.events[0],id=e.payments[0].personId;
 addPayment(e,id,10000,e.date);const selected=e.payments.at(-1).id,original=e.payments[0].id,transfers=JSON.stringify(e.outflows),sum=eventTotals(e).collected;e.closed=true;e.collectionClosed=true;
 cancelPayment(e,selected);assert.equal(eventTotals(e).collected,sum-10000);assert.equal(e.payments[0].id,original);assert.equal(JSON.stringify(e.outflows),transfers);assert.equal(e.closed,false);assert.equal(e.collectionClosed,false);assert.throws(()=>cancelPayment(e,selected));validateData(d);
});

test('monthly contribution period independent of receipt date; backup preserves it and normalizes legacy',async()=>{
 const {paymentMonth,collectionMonths}=await import('./dist/model.js');const d=demoData(),e=d.events[1],id=e.participants[0].personId;
 addPayment(e,id,30000,'2026-10-06','September paid late','2026-09');addPayment(e,id,20000,'2026-10-07','September remainder','2026-09');
 assert.equal(e.payments[0].date,'2026-10-06');assert.equal(paymentMonth(e.payments[0]),'2026-09');assert.equal(e.payments.filter(p=>paymentMonth(p)==='2026-09').reduce((s,p)=>s+p.amount,0),50000);
 const imported=validateData(JSON.parse(JSON.stringify(d)));assert.equal(imported.events[1].payments[0].month,'2026-09');
 delete e.payments[0].month;assert.equal(validateData(d).events[1].payments[0].month,'2026-10');assert.equal(collectionMonths({...e,date:'2026-12-31',payments:[]}).length,12);
 assert.throws(()=>addPayment(e,id,30000,'2026-10-06','','2026-13'));assert.throws(()=>addPayment(d.events[0],d.events[0].participants[0].personId,30000,'2026-10-06','','2026-09'));
 e.payments[0].month='2026-00';assert.throws(()=>validateData(d));
});

test('own money reconciles deficit separately from colleague payments and permits closure',async()=>{
 const {addOwnContribution}=await import('./dist/model.js');const d=demoData(),e=d.events[0];
 for(const p of e.participants.filter(p=>p.included)){const left=p.expected-eventTotals(e).received(p.personId);if(left>0)addPayment(e,p.personId,left,e.date);}
 closeCollection(e);e.outflows[0].amount=eventTotals(e).collected+10000;const ledger=JSON.stringify(e.payments);assert.throws(()=>closeEvent(e));
 addOwnContribution(e,10000,e.date,'Added personally');assert.equal(eventTotals(e).remaining,0);assert.equal(eventTotals(e).own,10000);assert.equal(JSON.stringify(e.payments),ledger);closeEvent(e);
 const saved=validateData(d);assert.equal(saved.events[0].ownContributions[0].amount,10000);assert.throws(()=>addOwnContribution(e,1,e.date));
 const copied=annualCandidates(saved,Number(e.date.slice(0,4)),Number(e.date.slice(0,4))+1);assert.equal(copied[0].ownContributions.length,0);
});
test('maternity status excludes new participants; hides rows but preserves historical payments',async()=>{
 const {canCollect,visibleParticipants}=await import('./dist/model.js');const d=demoData(),person=d.people[0],e=d.events[0];person.status='maternity';person.active=false;
 const before=JSON.stringify(e.payments);assert.equal(canCollect(person),false);assert.equal(visibleParticipants(e,d.people).some(p=>p.personId===person.id),false);
 const validated=validateData(d);assert.equal(validated.people[0].status,'maternity');assert.equal(JSON.stringify(validated.events[0].payments),before);assert.equal(validated.events[0].participants[0].included,false);
 const next=newEvent(validated,{title:'New collection',date:e.date});assert.equal(next.participants.some(p=>p.personId===person.id),false);
});
test('legacy clients preserve new fields while explicit changes remain possible',async()=>{
 const {preserveLegacyFields,addOwnContribution}=await import('./dist/model.js');const prior=validateData(demoData());prior.people[0].status='maternity';prior.people[0].active=false;addOwnContribution(prior.events[0],10000,prior.events[0].date);
 const legacy=structuredClone(prior);delete legacy.people[0].status;delete legacy.events[0].ownContributions;const result=preserveLegacyFields(legacy,prior);assert.equal(result.people[0].status,'maternity');assert.equal(result.events[0].ownContributions[0].amount,10000);
 legacy.events[0].ownContributions=[];assert.equal(preserveLegacyFields(legacy,prior).events[0].ownContributions.length,0);assert.equal(legacy.people[0].status,undefined);
});
