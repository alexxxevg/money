import test from 'node:test';
import assert from 'node:assert/strict';
import {operationsBetween,eventGuards,applyOperations,statesEqual} from './dist/sync-operations.js';
import {demoData,emptyData,validateData,addPayment} from './dist/model.js';
import {AccountSync} from './dist/auth.js';
const patch=(base,local,remote)=>validateData(applyOperations(remote,operationsBetween(base,local),eventGuards(base,operationsBetween(base,local))));
const fixture=()=>{const d=demoData();const e=d.events[0];e.payments=[];e.outflows=[];e.closed=false;e.collectionClosed=false;return validateData(d);};
const add=(d,n)=>{const e=d.events[0],p=e.participants.find(p=>p.included);addPayment(e,p.personId,n,e.date);};
test('two devices add payments independently; retries and reordered JSON keys do not duplicate payments',()=>{
 const base=fixture(),a=structuredClone(base),b=structuredClone(base);add(a,10000);add(b,20000);
 const remote=patch(base,a,base),merged=patch(base,b,remote);assert.equal(merged.events[0].payments.length,2);assert.equal(merged.events[0].payments.reduce((n,p)=>n+p.amount,0),30000);
 assert.deepEqual(patch(base,b,merged),merged);
 const reorder=x=>Array.isArray(x)?x.map(reorder):x&&typeof x==='object'?Object.fromEntries(Object.entries(x).reverse().map(([k,v])=>[k,reorder(v)])):x;
 assert(statesEqual(merged,reorder(merged)));assert.deepEqual(patch(base,b,reorder(merged)),merged);
});
test('conflicting edits, deletion and closed collections block stale financial operations atomically',()=>{
 const base=fixture();add(base,10000);const a=structuredClone(base),b=structuredClone(base);a.events[0].payments[0].amount=12000;b.events[0].payments[0].note='other';const remote=patch(base,a,base);assert.throws(()=>patch(base,b,remote),e=>e.status===409);assert.equal(remote.events[0].payments[0].amount,12000);
 const deleted=structuredClone(base);deleted.events=[];assert.throws(()=>patch(base,b,deleted),e=>e.status===409);
 const closed=structuredClone(base);closed.events[0].collectionClosed=true;const newPayment=structuredClone(base);add(newPayment,3000);assert.throws(()=>patch(base,newPayment,closed),e=>e.status===409);
});
test('independent record edits combine; unsafe paths and absent parents are rejected',()=>{
 const base=fixture(),a=structuredClone(base),b=structuredClone(base);a.defaultAmount=40000;b.people[0].phone='555';assert.equal(patch(base,b,patch(base,a,base)).defaultAmount,40000);
 assert.throws(()=>applyOperations(base,[{path:['__proto__','polluted'],before:null,after:true}]));assert.equal({}.polluted,undefined);
});
function setup(initial=fixture()){
 const storage=new Map(),listeners=new Map();globalThis.localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)};
 globalThis.window={addEventListener:(k,f)=>listeners.set(k,f),removeEventListener:(k,f)=>{if(listeners.get(k)===f)listeners.delete(k);}};
 Object.defineProperty(globalThis,'navigator',{value:{onLine:true},configurable:true});
 let state={revision:0,data:initial},lose=false,reads=0;const receipts=new Set(),requests=[];
 globalThis.fetch=async(path,opts)=>{if(opts.method==='PUT'){const i=JSON.parse(opts.body);assert(Array.isArray(i.operations));assert(!i.data);assert.match(i.operationId,/^[0-9a-f-]{36}$/i);requests.push(i.operationId);try{if(!receipts.has(i.operationId)){state={revision:state.revision+1,data:patchFromRequest(i)};receipts.add(i.operationId);}}catch(e){return {ok:false,status:409,json:async()=>({error:e.message})};}if(lose){lose=false;throw Error('response lost');}}else reads++;return {ok:true,json:async()=>structuredClone(state)};};
 const patchFromRequest=i=>validateData(applyOperations(state.data,i.operations,i.guards));
 return {storage,listeners,requests,get state(){return state;},set state(s){state=s;},set lose(v){lose=v;},get reads(){return reads;}};
}
const settle=async c=>{for(let i=0;i<30&&(c.busy||c.value.pending&&!c.blocked);i++)await new Promise(r=>setImmediate(r));};
test('offline payment merges remote payment on reconnect, lost response retries once without duplication',async()=>{
 const env=setup(),c=new AccountSync({id:'a'},()=>{},()=>{},()=>{});try{await c.start();navigator.onLine=false;const local=structuredClone(c.value.data);add(local,10000);c.save(local);const remote=structuredClone(env.state.data);add(remote,20000);env.state={revision:1,data:remote};navigator.onLine=true;env.lose=true;await c.tick();assert(c.value.pending);await c.tick();await settle(c);assert(!c.blocked);assert(!c.value.pending);assert.equal(env.state.data.events[0].payments.length,2);assert.equal(c.value.data.events[0].payments.length,2);assert.equal(c.status,'Сохранено на сервере');}finally{c.stop();}
});
test('focus and pageshow fetch immediately, incoming updates preserve persisted base, listeners removed',async()=>{
 const env=setup(emptyData()),c=new AccountSync({id:'wake'},()=>{},()=>{},()=>{});try{await c.start();let reads=env.reads;env.state={revision:1,data:{...emptyData(),defaultAmount:50000}};env.listeners.get('focus')();await settle(c);assert(env.reads>reads);assert.equal(c.value.data.defaultAmount,50000);assert.equal(c.value.base.defaultAmount,50000);reads=env.reads;env.listeners.get('pageshow')();await settle(c);assert(env.reads>reads);}finally{c.stop();}assert(!env.listeners.has('focus'));assert(!env.listeners.has('pageshow'));
});
test('legacy pending cache without base is retained and blocked rather than guessed',async()=>{
 const env=setup(emptyData()),local={...emptyData(),defaultAmount:70000};env.storage.set('money-account-legacy',JSON.stringify({revision:0,data:local,pending:true}));env.state={revision:1,data:{...emptyData(),defaultAmount:50000}};const c=new AccountSync({id:'legacy'},()=>{},()=>{},()=>{});try{await c.start();assert(c.blocked);assert.equal(c.value.data.defaultAmount,70000);assert.equal(env.state.data.defaultAmount,50000);}finally{c.stop();}
});
test('save during a GET is uploaded immediately after that GET completes',async()=>{
 const env=setup(emptyData()),c=new AccountSync({id:'get-race'},()=>{},()=>{},()=>{});try{await c.start();const fetchOriginal=globalThis.fetch;let release;globalThis.fetch=async(p,o)=>{if(!o.method)await new Promise(r=>release=r);return fetchOriginal(p,o);};const read=c.tick();c.save({...emptyData(),defaultAmount:45000});release();await read;await settle(c);assert(!c.value.pending);assert.equal(env.state.data.defaultAmount,45000);}finally{c.stop();}
});

test('persisted request receipt prevents resurrection after lost response, remote cancellation and app restart',async()=>{
 const env=setup(),c=new AccountSync({id:'restart'},()=>{},()=>{},()=>{});let second;
 try{await c.start();navigator.onLine=false;const local=structuredClone(c.value.data);add(local,10000);c.save(local);navigator.onLine=true;env.lose=true;await c.tick();assert(c.value.pending);assert.equal(env.state.data.events[0].payments.length,1);const remote=structuredClone(env.state.data);remote.events[0].payments=[];env.state={revision:env.state.revision+1,data:remote};c.stop();second=new AccountSync({id:'restart'},()=>{},()=>{},()=>{});await second.start();await settle(second);assert(!second.value.pending);assert.equal(env.state.data.events[0].payments.length,0);assert.equal(second.value.data.events[0].payments.length,0);assert.equal(env.requests[0],env.requests[1]);}finally{c.stop();second?.stop();}
});
test('new edit after a lost response is sent separately, preserving the original request identity',async()=>{
 const env=setup(),c=new AccountSync({id:'retry-edit'},()=>{},()=>{},()=>{});
 try{await c.start();navigator.onLine=false;let local=structuredClone(c.value.data);add(local,10000);c.save(local);navigator.onLine=true;env.lose=true;await c.tick();navigator.onLine=false;local=structuredClone(c.value.data);add(local,20000);c.save(local);navigator.onLine=true;await c.tick();await settle(c);assert(!c.value.pending);assert.equal(env.state.data.events[0].payments.length,2);assert.equal(env.requests[0],env.requests[1]);assert.notEqual(env.requests[1],env.requests[2]);}finally{c.stop();}
});
