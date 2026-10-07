export function mergeFinanceImport(current,incoming){
 const next=structuredClone(incoming);
 for(const key of ['incomes','sales','cards','stock','accounts','mortgages','family','bonuses']){
  const old=current[key]||[],fresh=next[key]||[],ids=new Set(old.map(x=>x.id));
  next[key]=[...fresh.filter(x=>!ids.has(x.id)),...old.map(x=>{const base=fresh.find(y=>y.id===x.id);if(!base)return structuredClone(x);const result={...base,...structuredClone(x)};for(const field of ['payments','components'])if(base[field]&&x[field]){const existing=new Set(x[field].map(v=>v.id));result[field]=[...base[field].filter(v=>!existing.has(v.id)),...structuredClone(x[field])];}return result;})];
 }
 next.credit=current.credit??next.credit;next.reserved=current.reserved??next.reserved;
 return next;
}
