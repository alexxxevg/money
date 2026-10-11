export function installWorkspaceNavigation(){
 installEditButtons();
 const paths=[['/cashback','Кэшбэки','<rect x="4" y="6" width="16" height="12" rx="2"/><path d="M4 10h16m-11 4h4"/>'],['/sb','Сборы','<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v12c0 4 14 4 14 0V6M5 12c0 4 14 4 14 0"/>'],['/finance','Доход','<path d="M5 20v-6h3v6m3 0V9h3v11m3 0V4h3v16"/>'],['/zkh','Платежи','<path d="m3 11 9-8 9 8M6 9v12h12V9M10 21v-7h4v7"/>']];
 const sidebar=document.createElement('aside');sidebar.className='workspace-sidebar';sidebar.innerHTML=`<a class="workspace-logo" href="/"><img src="/icon-192.png" width="44" height="44" alt=""><span>Высота</span></a><nav aria-label="Разделы приложения">${paths.map(([url,label,icon])=>`<a href="${url}" ${location.pathname.replace(/\/$/,'')===url?'aria-current="page"':''}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">${icon}</svg><span>${label}</span></a>`).join('')}</nav><a class="workspace-home" href="/">Все разделы ↗</a>`;document.body.append(sidebar);
 const root=document.getElementById('app');const refresh=()=>document.body.classList.toggle('workspace-active',!!root.querySelector('.topbar'));new MutationObserver(refresh).observe(root,{childList:true});refresh();
}

function installEditButtons(){
 const pencil='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15Z"/></svg>';
 const refresh=()=>{
  for(const button of document.querySelectorAll('button:not([data-pencil-ready])')){
   const text=button.textContent.trim(),label=button.getAttribute('aria-label')||text;
   if(!/^Изменить(?:\s|$)/.test(text)&&!/^Изменить(?:\s|$)/.test(label))continue;
   button.dataset.pencilReady='true';button.setAttribute('aria-label',label);button.title=label;
   button.classList.remove('primary','secondary','full','textlink');button.classList.add('edit-pencil');button.innerHTML=pencil;
  }
 };
 new MutationObserver(refresh).observe(document.body,{childList:true,subtree:true});refresh();
}

export function pagePreferences(user,section){
 const key='vysota-page-v1-'+user+'-'+section;
 return {read(defaults){try{const saved=JSON.parse(localStorage.getItem(key)||'{}'),result={...defaults};for(const k of Object.keys(defaults))if(typeof saved[k]===typeof defaults[k]&&(typeof saved[k]!=='number'||Number.isFinite(saved[k]))&&String(saved[k]).length<500)result[k]=saved[k];return result;}catch{return defaults;}},write(value){try{localStorage.setItem(key,JSON.stringify(value));}catch{}}};
}
