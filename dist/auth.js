import {validateData} from './model.js';
export async function api(path, options={}) {
  const response=await fetch(path,{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(12000),...options,headers:{'Content-Type':'application/json',...options.headers}});
  const value=await response.json();
  if(!response.ok)throw Object.assign(new Error(value.error||'Ошибка сервера'),{status:response.status});
  return value;
}
export class AccountSync {
  constructor(user, onChange, onStatus, onExpired){this.user=user;this.key='money-account-'+user.id;this.onChange=onChange;this.onStatus=onStatus;this.onExpired=onExpired;this.status='Подключение…';this.busy=false;this.blocked=false;}
  async start(){
    const state=await api('/api/state');
    const cached=localStorage.getItem(this.key);
    if(cached){try{const value=JSON.parse(cached);validateData(value.data);if(value.pending){this.value=value;if(value.revision!==state.revision)this.conflict();}}catch{throw new Error('Копия устройства повреждена. Данные сохранены для восстановления.');}}
    if(!this.value)this.value={...state,pending:false};
    this.persist();this.onChange(this.value.data);await this.tick();
    this.timer=setInterval(()=>this.tick(),15000);
    this.online=()=>this.tick();window.addEventListener('online',this.online);
    this.storage=ev=>{if(ev.key===this.key){if(!ev.newValue){this.onExpired();return;}try{this.value=JSON.parse(ev.newValue);validateData(this.value.data);this.onChange(this.value.data);this.tick();}catch{this.conflict();}}};window.addEventListener('storage',this.storage);
  }
  persist(){const raw=JSON.stringify(this.value);localStorage.setItem(this.key,raw);this.raw=raw;}
  setStatus(text){this.status=text;this.onStatus();}
  conflict(){this.blocked=true;this.setStatus('Изменения на другом устройстве');}
  save(data){
    if(this.blocked)throw new Error('Сначала сохраните копию и загрузите изменения с сервера в настройках.');
    if(localStorage.getItem(this.key)!==this.raw)throw new Error('Данные изменились в другой вкладке. Повторите действие.');
    const previous=this.value;this.value={...this.value,data:structuredClone(data),pending:true};
    try{this.persist();}catch(error){this.value=previous;throw error;}
    this.setStatus('Сохранено на устройстве · ожидает синхронизации');this.tick();
  }
  async tick(){
    if(this.busy||this.blocked||this.stopped)return;
    if(!navigator.onLine){this.setStatus(this.value.pending?'Без интернета · изменения сохранены':'Без интернета');return;}
    this.busy=true;
    try{
      if(this.value.pending){
        const snapshot=structuredClone(this.value), raw=this.raw;
        const saved=await api('/api/state',{method:'PUT',body:JSON.stringify({revision:snapshot.revision,data:snapshot.data})});
        // Another tab may have changed the same local cache during this request.
        if(localStorage.getItem(this.key)!==this.raw){this.conflict();return;}
        this.value.revision=saved.revision;
        if(this.raw===raw)this.value.pending=false;
        this.persist();
      }else{
        const expected=this.raw, state=await api('/api/state');
        if(this.raw!==expected||this.value.pending)return;
        if(state.revision!==this.value.revision){this.value={...state,pending:false};this.persist();this.onChange(validateData(state.data));}
      }
      this.setStatus(this.value.pending?'Ожидает синхронизации':'Синхронизировано');
    }catch(error){if(error.status===409)this.conflict();else if(error.status===401){this.blocked=true;this.onExpired();}else this.setStatus('Нет связи с сервером · данные на устройстве');}
    finally{this.busy=false;if(this.value?.pending&&!this.blocked&&navigator.onLine&&this.status==='Ожидает синхронизации')queueMicrotask(()=>this.tick());}
  }
  async loadServer(){if(this.busy)throw new Error('Дождитесь окончания синхронизации.');const state=await api('/api/state');this.value={...state,pending:false};this.persist();this.blocked=false;this.onChange(validateData(state.data));this.setStatus('Синхронизировано');}
  stop(){this.stopped=true;clearInterval(this.timer);window.removeEventListener('online',this.online);window.removeEventListener('storage',this.storage);}
}
export function loginScreen(root,onLogin,message=''){
  let register=false;
  const draw=()=>{
    root.innerHTML=`<main class="auth-screen"><section class="auth-card"><div class="brand">Баланс<em>.</em></div><p class="muted">Мероприятия · долги · личные финансы</p><div class="auth-eyebrow">ЛИЧНЫЙ КАБИНЕТ</div><h1>${register?'Создать аккаунт':'Вход'}</h1><p class="muted">Ваши сборы и история на телефоне и планшете.</p><form id="auth-form">${register?'<label class="field">Имя<input name="name" autocomplete="name" required maxlength="100"></label>':''}<label class="field">Электронная почта<input type="email" name="email" autocomplete="username" required maxlength="254"></label><div class="field"><label for="auth-password">Пароль</label><div class="password-field"><input id="auth-password" type="password" name="password" autocomplete="${register?'new-password':'current-password'}" required minlength="10" maxlength="128"><button class="password-toggle" type="button" aria-label="Показать пароль" aria-controls="auth-password" aria-pressed="false"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/><path class="eye-slash" d="m3 3 18 18" hidden/></svg></button></div></div>${register?'<p class="footnote">Минимум 10 символов. Аккаунт «Баланс» создаётся отдельно от QR-приложения.</p>':''}<p class="error" role="alert"></p><button class="primary full" type="submit">${register?'Создать аккаунт':'Войти'}</button></form><button class="textlink full" id="auth-switch">${register?'Уже есть аккаунт — войти':'Зарегистрироваться'}</button><p class="footnote auth-note">Данные хранятся на вашем сервере и доступны после входа.</p></section></main>`;
    root.querySelector('.password-toggle').onclick=()=>{const input=root.querySelector('#auth-password'),toggle=root.querySelector('.password-toggle'),visible=input.type==='password';input.type=visible?'text':'password';toggle.setAttribute('aria-pressed',String(visible));toggle.setAttribute('aria-label',visible?'Скрыть пароль':'Показать пароль');toggle.querySelector('.eye-slash').toggleAttribute('hidden',!visible);};
    root.querySelector('.error').textContent=message;
    root.querySelector('#auth-switch').onclick=()=>{register=!register;message='';draw();};
    root.querySelector('form').onsubmit=async ev=>{ev.preventDefault();const form=ev.target,button=form.querySelector('button[type=submit]');button.disabled=true;try{const input=Object.fromEntries(new FormData(form));const {user}=await api('/api/auth/'+(register?'register':'login'),{method:'POST',body:JSON.stringify(input)});form.reset();await onLogin(user);}catch(error){root.querySelector('.error').textContent=error.status?error.message:'Не удалось подключиться к серверу. Проверьте интернет.';}finally{button.disabled=false;}};
  };draw();
}
