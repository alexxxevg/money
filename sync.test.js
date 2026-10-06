import test from 'node:test';
import assert from 'node:assert/strict';
import {AccountSync} from './dist/auth.js';
import {emptyData} from './dist/model.js';
test('offline edits persist; stale server revision blocks overwrite; reload recovers',async()=>{
 const storage=new Map();globalThis.localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)};
 globalThis.window={addEventListener(){},removeEventListener(){}};
 Object.defineProperty(globalThis,'navigator',{value:{onLine:true},configurable:true});
 let state={revision:0,data:emptyData()},writes=0;
 globalThis.fetch=async(path,opts)=>{if(opts.method==='PUT'){
   writes++;const input=JSON.parse(opts.body);if(input.revision!==state.revision)return {ok:false,status:409,json:async()=>({error:'conflict'})};
   state={data:input.data,revision:state.revision+1};return {ok:true,json:async()=>({revision:state.revision})};
 }return {ok:true,json:async()=>structuredClone(state)};};
 const client=new AccountSync({id:'one'},()=>{},()=>{},()=>{});await client.start();
 navigator.onLine=false;const edited=emptyData();edited.defaultAmount=55000;client.save(edited);
 assert.equal(JSON.parse(storage.get(client.key)).pending,true);assert.equal(writes,0);
 state.revision=1;navigator.onLine=true;await client.tick();assert.equal(client.blocked,true);assert.equal(state.data.defaultAmount,emptyData().defaultAmount);
 assert.throws(()=>client.save(edited));assert.equal(client.value.data.defaultAmount,55000);
 await client.loadServer();assert.equal(client.blocked,false);assert.equal(client.value.pending,false);
 client.stop();
 const second=new AccountSync({id:'two'},()=>{},()=>{},()=>{});assert.notEqual(second.key,client.key);
});
test('edits made while upload runs remain pending and upload at next revision',async()=>{
 const storage=new Map();globalThis.localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)};
 let resolveUpload, first=true, state={revision:0,data:emptyData()};
 globalThis.fetch=async(path,opts)=>{if(opts.method==='PUT'){
  const input=JSON.parse(opts.body);if(first){first=false;await new Promise(r=>resolveUpload=r);}
  assert.equal(input.revision,state.revision);state={revision:state.revision+1,data:input.data};return {ok:true,json:async()=>({revision:state.revision})};
 }return {ok:true,json:async()=>structuredClone(state)};};
 const client=new AccountSync({id:'three'},()=>{},()=>{},()=>{});await client.start();
 const a=emptyData();a.defaultAmount=40000;client.save(a);const b=emptyData();b.defaultAmount=60000;client.save(b);resolveUpload();
 for(let i=0;i<20&&client.value.pending;i++)await new Promise(r=>setImmediate(r));
 assert.equal(state.revision,2);assert.equal(state.data.defaultAmount,60000);assert.equal(client.value.pending,false);client.stop();
});
