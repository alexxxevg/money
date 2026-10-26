// Changes carry stable record IDs and their previous values, never an overwrite of stale state.
export const statesEqual=(a,b)=>{
 if(a===b)return true;
 if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
 const ak=Object.keys(a),bk=Object.keys(b);return ak.length===bk.length&&ak.every(k=>Object.hasOwn(b,k)&&statesEqual(a[k],b[k]));
};
const same=statesEqual;
const keyed=a=>Array.isArray(a)&&a.every(x=>x&&typeof x.id==='string');
const denied=new Set(['__proto__','prototype','constructor']);
export function operationsBetween(before,after,path=[]){
 if(same(before,after))return [];
 if(path.length===4&&['payments','outflows','ownContributions','repayments'].includes(path[2]))return [{path,before:before??null,after:after??null}];
 if(keyed(before)&&keyed(after)){
  const ids=new Set([...before,...after].map(x=>x.id));
  return [...ids].flatMap(id=>operationsBetween(before.find(x=>x.id===id),after.find(x=>x.id===id),[...path,{id}]));
 }
 if(before&&after&&!Array.isArray(before)&&!Array.isArray(after)&&typeof before==='object'&&typeof after==='object')return [...new Set([...Object.keys(before),...Object.keys(after)])].flatMap(k=>operationsBetween(before[k],after[k],[...path,k]));
 return [{path,before:before??null,after:after??null}];
}
export function eventGuards(base,operations){
 const ids=new Set(operations.filter(o=>o.path[0]==='events').map(o=>o.path[1]?.id));
 return base.events.filter(e=>ids.has(e.id)).map(e=>({id:e.id,closed:e.closed,collectionClosed:e.collectionClosed,participants:e.participants,recipientId:e.recipientId,monthly:e.monthly}));
}
export function applyOperations(current,operations,guards=[]){
 if(!Array.isArray(operations)||operations.length>100000||!Array.isArray(guards))throw Error('Некорректные изменения.');
 const next=structuredClone(current),conflict=()=>{throw Object.assign(new Error('Одна и та же запись изменена на двух устройствах. Локальные изменения сохранены. Скачайте копию в настройках и загрузите данные с сервера.'),{status:409});};
 const locate=op=>{
  if(!Array.isArray(op.path)||!op.path.length||op.path.length>12)throw Error('Некорректный путь изменения.');
  let owner=next;
  for(let i=0;i<op.path.length;i++){
   const part=op.path[i],array=typeof part==='object'&&part!==null;
   if(array&&(!Array.isArray(owner)||typeof part.id!=='string')||!array&&(typeof part!=='string'||denied.has(part)||!owner||Array.isArray(owner)||typeof owner!=='object'))throw Error('Некорректный путь изменения.');
   const key=array?owner.findIndex(x=>x.id===part.id):part;
   if(i===op.path.length-1)return {owner,key,array,value:array&&key<0?undefined:owner[key]};
   if(key===-1||owner[key]===undefined)conflict();owner=owner[key];
  }
 };
 // A retry after a lost response is acknowledged without creating another payment.
 if(operations.every(op=>same(locate(op).value??null,op.after)))return next;
 for(const g of guards){const e=next.events.find(e=>e.id===g.id);if(!e)conflict();for(const k of ['closed','collectionClosed','participants','recipientId','monthly'])if(!same(e[k],g[k]))conflict();}
 for(const op of operations){const {owner,key,array,value}=locate(op);if(same(value??null,op.after))continue;if(!same(value??null,op.before))conflict();if(op.after===null){if(array){if(key>=0)owner.splice(key,1);}else delete owner[key];}else if(array&&key<0)owner.push(structuredClone(op.after));else owner[key]=structuredClone(op.after);}
 return next;
}
