import {readDeviceCache,writeDeviceCache} from './device-cache.js';
import {api} from './auth.js';
import {statesEqual} from './sync-operations.js';
import {sectionOperations,mergeSectionDraft} from './section-operations.js';
const cacheKey=(user,section)=>`money-section-sync-v1-${user}-${section}`;
export async function loadSection(user,section){
 let cached;try{cached=await readDeviceCache(cacheKey(user,section));}catch{}
 try{const state=await api('/api/'+section);return {...state,cacheToken:cached?.cacheToken,...(cached?.pending&&cached.base?{pendingState:cached}:{})};}catch(error){if(!cached?.data||!Number.isSafeInteger(cached.revision))throw error;return {data:cached.data,revision:cached.revision,cacheToken:cached.cacheToken,...(cached.pending?{pendingState:cached}:{})};}
}

export class SectionSync{
 constructor({user,section,root,initial,getData,onData,canApply=()=>true,onRefresh=async()=>{}}){
  Object.assign(this,{section,root,getData,onData,canApply,onRefresh});this.key=cacheKey(user,section);this.value={...initial,data:structuredClone(initial.data),base:structuredClone(initial.data),pending:false};
  if(initial.pendingState?.pending)this.value=initial.pendingState;else if(typeof indexedDB==='undefined')try{const old=JSON.parse(localStorage.getItem(this.key)||'null');if(old?.pending&&old.base)this.value=old;}catch{}
  this.cacheToken=initial.cacheToken||this.value.cacheToken;this.message=this.value.pending?'Сохранено на устройстве · ожидает отправки':'Сохранено на сервере';this.blocked=false;
 }
 async persist(){const snapshot=structuredClone(this.value);const task=(this.persistChain||Promise.resolve()).catch(()=>{}).then(async()=>{const cacheToken=crypto.randomUUID();await writeDeviceCache(this.key,{...snapshot,cacheToken},this.cacheToken);this.cacheToken=cacheToken;});this.persistChain=task;await task;}
 setStatus(message){this.message=message;this.paint();}
 async stage(data){this.value={...this.value,data:structuredClone(data),pending:true};this.setStatus('Сохраняется на устройстве…');try{await this.persist();}catch(error){this.blocked=true;this.setStatus(error.message||'Не удалось сохранить копию на устройстве. Не закрывайте страницу; скачайте копию.');throw Error(this.message);}this.setStatus('Сохранено на устройстве · ожидает отправки');}
 async save(data){if(this.blocked)throw Error(this.message);if(!this.value.pending&&statesEqual(data,this.value.data))return {revision:this.value.revision,data:structuredClone(this.value.data),queued:false};await this.stage(data);await this.flush();if(this.blocked)throw Error(this.message);return {revision:this.value.revision,data:structuredClone(this.value.data),queued:this.value.pending};}
 async flush(){
  if(this.inFlight)return this.inFlight;
  if(this.blocked)return;
  this.inFlight=this.run();try{await this.inFlight;}finally{this.inFlight=null;}
 }
 async run(){
  if(!this.value.pending)return;
  if(!navigator.onLine){this.setStatus('Без интернета · изменения сохранены на устройстве');return;}
  try{
   if(!this.value.request){this.value.request={id:crypto.randomUUID(),data:structuredClone(this.value.data),operations:sectionOperations(this.section,this.value.base,this.value.data)};await this.persist();}
   const request=structuredClone(this.value.request);this.setStatus('Отправляется на сервер…');
   const result=await api('/api/'+this.section,{method:'PUT',body:JSON.stringify({revision:this.value.revision,operationId:request.id,operations:request.operations})});
   const extra=!statesEqual(request.data,this.value.data),data=mergeSectionDraft(this.section,result.data,request.data,this.value.data);
   this.value={...result,data,base:structuredClone(result.data),pending:extra};await this.persist();this.setStatus(this.value.pending?'Сохранено на устройстве · ожидает отправки':'Сохранено на сервере');
   if(this.value.pending)await this.run();else if(this.canApply()&&statesEqual(this.getData(),request.data))this.onData(structuredClone(data),result.revision);
  }catch(error){
   if(error.status===409&&!this.value.pending){this.setStatus('Сохранено на сервере · в другой вкладке ожидаются изменения');}
   else if([400,401,409].includes(error.status)){this.blocked=true;this.setStatus(error.status===401?'Сессия завершилась. Войдите снова. Локальная копия сохранена.':error.message+' Локальная копия сохранена на устройстве.');}
   else this.setStatus('Нет связи с сервером · изменения сохранены на устройстве');
  }
 }
 async refresh(){
  if(this.refreshing||this.inFlight)return;
  this.refreshing=true;
  try{
   if(this.value.pending){await this.flush();return;}
   if(this.blocked)return;if(!navigator.onLine){this.setStatus('Без интернета · показана последняя загруженная копия');return;}
   const expected=this.value.revision,result=await api('/api/'+this.section);
   if(this.value.revision===expected&&!this.value.pending&&!this.inFlight&&this.canApply()&&statesEqual(this.getData(),this.value.data)){
    const changed=result.revision!==this.value.revision||!statesEqual(result.data,this.value.data);
    const fresh={...result,data:structuredClone(result.data),base:structuredClone(result.data),pending:false};this.value=fresh;await this.persist();if(this.value===fresh){if(changed&&this.canApply())this.onData(structuredClone(result.data),result.revision);this.setStatus('Сохранено на сервере');}
   }
   await this.onRefresh();
  }catch(error){if(error.status===409){if(this.value.pending)this.blocked=true;this.setStatus(error.message);}else if(!this.value.pending)this.setStatus('Нет связи с сервером · показана последняя загруженная копия');}finally{this.refreshing=false;}
 }
 async accept(result){const previous=this.value;this.value={...result,data:structuredClone(result.data),base:structuredClone(result.data),pending:false};try{await this.persist();this.blocked=false;this.setStatus('Сохранено на сервере');}catch(error){this.value=previous;this.blocked=true;throw error;}}
 exportCopy(){const format={finance:'money-finance-backup-v1',zkh:'money-zkh-backup-v1',cashback:'money-cashback-backup-v2'}[this.section];const url=URL.createObjectURL(new Blob([JSON.stringify({format,data:this.value.pending?this.value.data:this.getData(),pending:this.value},null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=this.section+'-device-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 paint(){
  const main=this.root.querySelector('main');if(!main)return;let bar=main.querySelector('[data-section-sync]');
  if(!bar){bar=document.createElement('div');bar.dataset.sectionSync='';bar.className='section-sync';bar.setAttribute('role','status');bar.innerHTML='<span></span><button type="button" data-sync-retry>Повторить отправку</button><button type="button" data-sync-recover>Скачать копию и загрузить с сервера</button>';const heading=main.querySelector('.heading');if(heading)heading.after(bar);else main.prepend(bar);bar.querySelector('[data-sync-retry]').onclick=()=>this.flush();bar.querySelector('[data-sync-recover]').onclick=async()=>{this.exportCopy();try{const result=await api('/api/'+this.section);await this.accept(result);this.onData(result.data,result.revision);}catch{this.setStatus('Не удалось загрузить данные. Копия на устройстве сохранена.');}};}
  if(bar.firstElementChild.textContent!==this.message)bar.firstElementChild.textContent=this.message;
  bar.querySelector('[data-sync-retry]').hidden=!this.value.pending||this.blocked;bar.querySelector('[data-sync-recover]').hidden=!this.blocked;
 }
 async start(){
  try{await this.persist();}catch(error){this.blocked=error.status!==409||this.value.pending;this.setStatus(error.message||'Не удалось сохранить копию на устройстве. Скачайте копию перед закрытием страницы.');}this.paint();this.wake=()=>{if(document.visibilityState!=='hidden')this.refresh();};
  for(const event of ['online','focus','pageshow'])window.addEventListener(event,this.wake);document.addEventListener('visibilitychange',this.wake);
  this.observer=new MutationObserver(()=>this.paint());this.observer.observe(this.root,{childList:true,subtree:true});
  window.addEventListener('beforeunload',e=>{if(this.blocked&&this.value.pending){e.preventDefault();e.returnValue='';}});this.timer=setInterval(this.wake,5000);this.refresh();
 }
}
