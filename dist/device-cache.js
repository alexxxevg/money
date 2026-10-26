// IndexedDB has room for full histories; localStorage's small quota is shared by all pages.
let database;
function open(){if(!database)database=new Promise((resolve,reject)=>{const request=indexedDB.open('vysota-device-cache',1);request.onupgradeneeded=()=>request.result.createObjectStore('sections');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});return database;}
export async function readDeviceCache(key){
 if(typeof indexedDB==='undefined')return JSON.parse(localStorage.getItem(key)||'null');
 const db=await open();return new Promise((resolve,reject)=>{const request=db.transaction('sections').objectStore('sections').get(key);request.onsuccess=()=>resolve(request.result||null);request.onerror=()=>reject(request.error);});
}
export async function writeDeviceCache(key,value,expected){
 if(typeof indexedDB==='undefined'){localStorage.setItem(key,JSON.stringify(value));return;}
 const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction('sections','readwrite'),store=tx.objectStore('sections'),read=store.get(key);let conflict;
 read.onsuccess=()=>{const old=read.result;if(old?.pending&&old.cacheToken!==expected){conflict=Object.assign(Error('В другой вкладке есть неотправленные изменения. Скачайте копию этой вкладки перед обновлением.'),{status:409});tx.abort();return;}store.put(structuredClone(value),key);};
 tx.oncomplete=()=>resolve();tx.onabort=tx.onerror=()=>reject(conflict||tx.error||Error('Не удалось сохранить копию на устройстве.'));});
}
