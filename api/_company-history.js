const HISTORY_KEY='btc_spot_monitor_company_history_v1';
const MAX_HISTORY_DAYS=90;

function todayIso(){ return new Date().toISOString().slice(0,10); }
function num(v){ const n=Number(v); return Number.isFinite(n)?n:null; }
function sameValue(a,b){ const na=num(a), nb=num(b); return na!==null && nb!==null && Math.abs(na-nb)<1e-9; }
function cleanRows(rows=[], date=todayIso()){
  return (rows||[])
    .filter(r=>r && r.ticker && num(r.btcHeld)!==null)
    .map(r=>({
      ticker:String(r.ticker).toUpperCase(),
      company:r.company||String(r.ticker).toUpperCase(),
      btcHeld:num(r.btcHeld),
      valueUsd:num(r.valueUsd),
      lastDisclosureDate:r.lastDisclosureDate||r.date||date
    }));
}
function normaliseHistory(raw){
  if(!Array.isArray(raw)) return [];
  return raw
    .filter(x=>x && x.date && Array.isArray(x.rows))
    .map(x=>({date:String(x.date),rows:cleanRows(x.rows,String(x.date))}))
    .filter(x=>x.rows.length)
    .sort((a,b)=>String(a.date).localeCompare(String(b.date)))
    .slice(-MAX_HISTORY_DAYS);
}
async function kvRequest(command){
  const url=process.env.KV_REST_API_URL;
  const token=process.env.KV_REST_API_TOKEN;
  if(!url || !token) return null;
  const r=await fetch(url.replace(/\/$/,'') ,{
    method:'POST',
    headers:{'Authorization':`Bearer ${token}`,'Content-Type':'application/json'},
    body:JSON.stringify(command)
  });
  if(!r.ok) throw new Error(`KV HTTP ${r.status}`);
  const j=await r.json().catch(()=>null);
  return j?.result ?? null;
}
export async function loadCompanyHistory(){
  try{
    const raw=await kvRequest(['GET',HISTORY_KEY]);
    if(raw){
      const parsed=typeof raw==='string'?JSON.parse(raw):raw;
      return normaliseHistory(parsed);
    }
  }catch(e){ console.warn('Company history KV load fallback:', e.message); }
  return [];
}
export async function saveCompanyHistory(history){
  const clean=normaliseHistory(history);
  try{
    const result=await kvRequest(['SET',HISTORY_KEY,JSON.stringify(clean)]);
    return {persisted:!!result,provider:'Vercel KV / Upstash Redis'};
  }catch(e){
    console.warn('Company history KV save skipped:', e.message);
    return {persisted:false,provider:'memory-only',warning:e.message};
  }
}
export function addCurrentToHistory(history, rows, date=todayIso()){
  const cleanCurrent=cleanRows(rows,date);
  if(!cleanCurrent.length) return normaliseHistory(history);
  const filtered=normaliseHistory(history).filter(x=>String(x.date)!==String(date));
  filtered.push({date,rows:cleanCurrent});
  return normaliseHistory(filtered);
}
export function findPreviousDifferent(history, ticker, currentValue, currentDate){
  const t=String(ticker||'').toUpperCase();
  const cur=num(currentValue);
  if(!t || cur===null) return null;
  const hist=normaliseHistory(history);
  for(let i=hist.length-1;i>=0;i--){
    const snap=hist[i];
    const row=(snap.rows||[]).find(r=>String(r.ticker||'').toUpperCase()===t);
    if(!row) continue;
    const rowDate=row.lastDisclosureDate||snap.date;
    if(String(rowDate)===String(currentDate)) continue;
    if(sameValue(row.btcHeld,cur)) continue;
    return {date:rowDate,value:row.btcHeld};
  }
  return null;
}
export async function applyCompanyHistory(rows, date=todayIso()){
  const before=await loadCompanyHistory();
  const updated=addCurrentToHistory(before, rows, date);
  const persist=await saveCompanyHistory(updated);
  const enriched=(rows||[]).map(r=>{
    const currentDate=r.lastDisclosureDate||r.date||date;
    const prev=findPreviousDifferent(updated,r.ticker,r.btcHeld,currentDate);
    return {
      ...r,
      lastDisclosureDate:currentDate,
      previousDisclosureDate:prev?.date||null,
      previousBtcHeld:prev?.value??null
    };
  });
  return {rows:enriched,history:updated,historyMeta:{...persist,entries:updated.length,key:HISTORY_KEY}};
}
