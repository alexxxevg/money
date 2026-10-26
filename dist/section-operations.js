import {operationsBetween,applyOperations,statesEqual} from './sync-operations.js';
export function sectionOperations(section,base,next){
 let changes=operationsBetween(base,next);const seen=new Set(),out=[];
 if(section==='cashback'){
  changes=changes.flatMap(op=>op.path[0]==='months'&&op.path.length===2&&op.before===null&&op.after?Object.entries(op.after).map(([bank,rows])=>({path:[...op.path,bank],before:null,after:rows})):op);
  if(!statesEqual(base.banks.map(b=>b.id),next.banks.map(b=>b.id))){changes=changes.filter(op=>op.path[0]!=='banks');changes.push({path:['banks'],before:base.banks,after:next.banks});}
  changes=changes.map(op=>op.path.length===1&&['categories','favorites','lockedMonths'].includes(op.path[0])?{...op,setChanges:{add:op.after.filter(v=>!op.before.includes(v)),remove:op.before.filter(v=>!op.after.includes(v))}}:op);
 }
 for(const op of changes){
  const [list,record]=op.path;
  // Balances and their histories form one record. Never merge half of two edits.
  if(record?.id&&Array.isArray(base[list])&&Array.isArray(next[list])){
   const key=list+'|'+record.id;if(seen.has(key))continue;seen.add(key);
   out.push({path:[list,record],before:base[list].find(x=>x.id===record.id)??null,after:next[list].find(x=>x.id===record.id)??null});
  }else out.push(op);
 }
 return out;
}
export function applySectionOperations(section,current,operations){
 if(section==='zkh')for(const op of operations){
  const r=op.after;if(op.path[0]==='readings'&&op.before===null&&r&&current.readings.some(x=>x.id!==r.id&&x.meterId===r.meterId&&x.month===r.month))throw Object.assign(new Error('Показание этого счётчика за выбранный месяц уже внесено на другом устройстве. Сравните записи перед сохранением.'),{status:409});
 }
 if(section==='cashback'){
  const prepared=structuredClone(current);
  operations=operations.map(op=>{
   if(op.path[0]==='months'&&op.path.length===3&&op.before===null&&/^20\d\d-(0[1-9]|1[0-2])$/.test(op.path[1])&&!Object.hasOwn(prepared.months,op.path[1]))prepared.months[op.path[1]]={};
   if(op.setChanges){if(op.path.length!==1||!['categories','favorites','lockedMonths'].includes(op.path[0])||!Array.isArray(op.setChanges.add)||!Array.isArray(op.setChanges.remove))throw Error('Некорректное изменение справочника.');const before=prepared[op.path[0]]||[],after=[...new Set([...before.filter(v=>!op.setChanges.remove.includes(v)),...op.setChanges.add])];return {...op,before,after};}return op;
  });return applyOperations(prepared,operations);
 }
 return applyOperations(current,operations);
}
export function mergeSectionDraft(section,remote,base,draft){return statesEqual(base,draft)?remote:applySectionOperations(section,remote,sectionOperations(section,base,draft));}
