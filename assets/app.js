const DEFAULT_TZ = 'America/Campo_Grande';
let DAILY_SNAPSHOT_CACHE = null;

async function loadJson(path){
  const r = await fetch(path, { cache: 'no-store' });
  if(!r.ok) throw new Error(`Falha ao carregar ${path} (${r.status})`);
  return r.json();
}
function esc(v){
  return String(v ?? 'N/D').replace(/[&<>"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
}
function fmtNumber(v,d=0){
  if(v===null||v===undefined||v==='') return 'N/D';
  const n=Number(v);
  if(Number.isNaN(n)) return String(v);
  return n.toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d});
}
function fmtMoney(v,c='USD',d=0){
  if(v===null||v===undefined||v==='') return 'N/D';
  const n=Number(v);
  if(Number.isNaN(n)) return String(v);
  return new Intl.NumberFormat('pt-BR',{style:'currency',currency:c,minimumFractionDigits:d,maximumFractionDigits:d}).format(n);
}
function fmtBtc(v,d=0){
  if(v===null||v===undefined||v==='') return 'N/D';
  const n=Number(v);
  if(Number.isNaN(n)) return String(v);
  return `${n.toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d})} BTC`;
}
function fmtPercent(v,d=2){
  if(v===null||v===undefined||v==='') return 'N/D';
  const n=Number(v);
  if(Number.isNaN(n)) return String(v);
  return `${n.toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d})}%`;
}
function fmtDateTime(v,tz=DEFAULT_TZ){
  if(!v) return 'N/D';
  const d=new Date(v);
  if(Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString('pt-BR',{timeZone:tz});
}
function numOrNull(v){
  if(v===null||v===undefined||v==='') return null;
  const n=Number(v);
  return Number.isFinite(n)?n:null;
}
function btcChangeHtml(current, previous){
  const c=numOrNull(current), pr=numOrNull(previous);
  if(c===null || pr===null) return '<span class="btc-change neu">N/D</span>';
  const d=c-pr;
  const cls=d>0?'pos':d<0?'neg':'neu';
  const prefix=d>0?'+':'';
  return '<span class="btc-change '+cls+'">'+prefix+fmtBtc(d,0)+'</span>';
}
function positionCell(value,date){
  return `<div class="position"><strong>${fmtBtc(value,0)}</strong><span>${esc(date || 'N/D')}</span></div>`;
}
function sourceCell(url,label='Fonte'){
  if(!url || url==='#') return '<span class="small">N/D</span>';
  return `<a class="source-pill" href="${esc(url)}" target="_blank" rel="noreferrer">${esc(label)}</a>`;
}
function sortByCurrentBtcDesc(rows, field='btcSpotLast'){
  return [...(rows||[])].sort((a,b)=>(numOrNull(b?.[field])??-Infinity)-(numOrNull(a?.[field])??-Infinity));
}
function sameValue(a,b){
  const na=numOrNull(a), nb=numOrNull(b);
  if(na===null || nb===null) return false;
  return Math.abs(na-nb)<1e-9;
}
function sameDateLabel(a,b){
  if(!a || !b) return false;
  return String(a).trim()===String(b).trim();
}
function readHistory(key){
  const snap=readSnapshot(key);
  if(!snap?.payload) return [];
  if(Array.isArray(snap.payload.history)) return snap.payload.history;
  if(Array.isArray(snap.payload.rows)) return [{date:snap.payload.date||null,rows:snap.payload.rows}];
  return [];
}
function saveHistory(key,entry,max=45){
  const history=readHistory(key);
  const filtered=history.filter(h=>String(h?.date||'')!==String(entry?.date||''));
  filtered.push(entry);
  filtered.sort((a,b)=>String(a.date||'').localeCompare(String(b.date||'')));
  saveSnapshot(key,{history:filtered.slice(-max)});
}
function setText(id,v){const e=document.getElementById(id);if(e)e.textContent=v;}
function setHtml(id,v){const e=document.getElementById(id);if(e)e.innerHTML=v;}
function saveSnapshot(key,payload){try{localStorage.setItem(key,JSON.stringify({ts:Date.now(),payload}));}catch(e){console.warn('snapshot',e);}}
function readSnapshot(key){try{return JSON.parse(localStorage.getItem(key)||'null');}catch{return null;}}
function deltaLabel(current,previous,d=0){
  if(current==null||previous==null) return '<span class="delta neu">Sem base comparativa local</span>';
  const delta=Number(current)-Number(previous);
  if(Number.isNaN(delta)) return '<span class="delta neu">Sem base comparativa local</span>';
  const cls=delta>0?'pos':delta<0?'neg':'neu';
  const prefix=delta>0?'+':'';
  return `<span class="delta ${cls}">${prefix}${fmtNumber(delta,d)} vs. ultimo snapshot local</span>`;
}
function normalizeApiBase(config){
  let base = String(config.apiBaseUrl || '').trim().replace(/\/$/, '');
  if(base.endsWith('/api')) base = base.slice(0,-4);
  return base;
}
function apiUrl(config,endpoint){
  const base = normalizeApiBase(config);
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${base}${path}`;
}
async function fetchProvider(config,endpoint){
  const url = apiUrl(config,endpoint);
  const res = await fetch(url, { cache: 'no-store' });
  let data = null;
  try{ data = await res.json(); }catch{ data = null; }
  if(!res.ok) throw new Error(`${endpoint}: HTTP ${res.status}${data?.error ? ' - '+data.error : ''}`);
  if(data && data.ok === false) console.warn(`${endpoint}:`, data.warning || data.error || 'provider retornou ok=false');
  return data;
}
async function getDailySnapshot(config){
  if(DAILY_SNAPSHOT_CACHE) return DAILY_SNAPSHOT_CACHE;
  try{
    DAILY_SNAPSHOT_CACHE = await fetchProvider(config,'/api/snapshot');
    renderSnapshotStatus(DAILY_SNAPSHOT_CACHE, config);
    return DAILY_SNAPSHOT_CACHE;
  }catch(err){
    addRuntimeWarning(`Snapshot diario indisponivel: ${err.message}. Usando APIs individuais como fallback.`);
    DAILY_SNAPSHOT_CACHE = null;
    return null;
  }
}
function renderSnapshotStatus(snap, config){
  const status=snap?.status?.label || 'N/D';
  const generated=fmtDateTime(snap?.generatedAt, config.timezone || DEFAULT_TZ);
  const failed=(snap?.status?.failed||[]).length ? ` | Falhas: ${(snap.status.failed||[]).join(', ')}` : '';
  setText('snapshot-status',`${status} | ${generated}${failed}`);
}
async function safeProvider(config, endpoint, fallback){
  try { return await fetchProvider(config, endpoint); }
  catch(err){ console.warn(err); addRuntimeWarning(err.message); return fallback; }
}
function addRuntimeWarning(message){
  const box = document.getElementById('page-error');
  if(!box) return;
  const item = document.createElement('div');
  item.className = 'notice warn-note';
  item.textContent = `Aviso: ${message}`;
  box.appendChild(item);
}
function buildNav(active){
  document.querySelectorAll('[data-nav]').forEach(link=>{
    if(link.getAttribute('data-nav')===active) link.classList.add('active');
  });
}
function showFatal(err){
  console.error(err);
  setHtml('page-error',`<div class="notice bad-note"><strong>Erro ao inicializar:</strong> ${esc(err.message)}</div>`);
}
function unavailableRows(){
  const rows = [
    ['Fundos','Aguardando fonte declarada'],
    ['Baleias','Aguardando fonte on-chain nomeada'],
    ['Corretoras','Aguardando prova de reserva / wallet tag confiavel'],
    ['Tesourarias BTC','Coberta parcialmente em Companhias e On-chain']
  ];
  return rows.map(r=>`<tr><td>${r[0]}</td><td><span class="operator">${r[1]}</span></td><td class="num"><span class="btc-change neu">N/D</span></td><td class="num">${positionCell(null,null)}</td><td class="num">${positionCell(null,null)}</td><td class="num">${positionCell(null,null)}</td><td><span class="small">Fonte pendente</span></td></tr>`).join('');
}
function etfPositionRow(item, flow){
  const current = flow?.btcSpotLast ?? null;
  const previous = flow?.btcSpotPrevious ?? null;
  const third = flow?.btcSpotThird ?? flow?.btcSpotBeforePrevious ?? null;
  const currentDate = flow?.date || flow?.lastDate || null;
  const previousDate = flow?.previousDate || null;
  const thirdDate = flow?.thirdDate || flow?.beforePreviousDate || null;
  return `<tr><td><span class="operator">${esc(item.ticker || flow?.ticker)}</span></td><td>${esc(item.issuer || flow?.issuer)}</td><td>${esc(item.label || 'ETF spot')}</td><td class="num">${btcChangeHtml(current,previous)}</td><td class="num">${positionCell(current,currentDate)}</td><td class="num">${positionCell(previous,previousDate)}</td><td class="num">${positionCell(third,thirdDate)}</td><td>${sourceCell('https://farside.co.uk/btc/','Farside')}</td></tr>`;
}
function companyPositionRow(r, sourceUrl, includeValue=false){
  const third = r.thirdBtcHeld ?? r.beforePreviousBtcHeld ?? null;
  const thirdDate = r.thirdDisclosureDate ?? r.beforePreviousDisclosureDate ?? null;
  const cells = [`<tr><td><span class="operator">${esc(r.ticker || 'N/D')}</span></td><td>${esc(r.company || 'N/D')}</td><td class="num">${btcChangeHtml(r.btcHeld,r.previousBtcHeld)}</td><td class="num">${positionCell(r.btcHeld,r.lastDisclosureDate)}</td><td class="num">${positionCell(r.previousBtcHeld,r.previousDisclosureDate)}</td><td class="num">${positionCell(third,thirdDate)}</td>`];
  if(includeValue) cells.push(`<td class="num">${fmtMoney(r.valueUsd||null,'USD',0)}</td>`);
  cells.push(`<td>${sourceCell(r.officialSource || sourceUrl || '#')}</td></tr>`);
  return cells.join('');
}

async function init(){
  let config;
  try{ config = await loadJson('./data/app-config.json'); }
  catch(err){ showFatal(err); return; }
  const tz = config.timezone || DEFAULT_TZ;
  setText('generated-time',new Date().toLocaleString('pt-BR',{timeZone:tz}));
  setText('api-base',normalizeApiBase(config)||'mesma origem');
  setText('snapshot-status','Carregando...');
  const page=document.body.dataset.page||'overview';
  buildNav(page);
  try{
    if(page==='overview') await renderOverview(config);
    if(page==='etfs') await renderEtfs(config);
    if(page==='corporates') await renderCorporates(config);
    if(page==='market') await renderMarket(config);
    if(page==='onchain') await renderOnchain(config);
    if(page==='settings') await renderSettings(config);
  }catch(err){ showFatal(err); }
  setText('refresh-ms','diario via Vercel Cron');
}

async function renderOverview(config){
  const snap=await getDailySnapshot(config);
  const btc=snap?.data?.btc || await safeProvider(config,'/api/btc-price',{ok:false,price:null});
  const flows=snap?.data?.flows || await safeProvider(config,'/api/farside-btc',{ok:false,summary:{latestTotalFlow:null,latestDate:null},rows:[]});
  const companies=snap?.data?.companies || await safeProvider(config,'/api/public-companies',{ok:false,summary:{publicCompanies:null,totalBtc:null},rows:[]});
  const key='btc-spot-monitor-overview';
  const prev=readSnapshot(key);
  saveSnapshot(key,{totalFlow:flows?.summary?.latestTotalFlow??null,btcPrice:btc?.price??null,publicCompanies:companies?.summary?.publicCompanies??null});
  setText('btc-price',btc?.price?fmtMoney(btc.price,'USD',0):'N/D');
  setHtml('btc-price-delta',prev?deltaLabel(btc?.price,prev?.payload?.btcPrice,0):'<span class="delta neu">Sem base comparativa local</span>');
  setText('etf-total-flow',flows?.summary?.latestTotalFlow!=null?fmtMoney(flows.summary.latestTotalFlow,'USD',1):'N/D');
  setHtml('etf-flow-delta',prev?deltaLabel(flows?.summary?.latestTotalFlow,prev?.payload?.totalFlow,1):'<span class="delta neu">Sem base comparativa local</span>');
  setText('public-companies',companies?.summary?.publicCompanies!=null?fmtNumber(companies.summary.publicCompanies,0):'N/D');
  setHtml('public-companies-delta',prev?deltaLabel(companies?.summary?.publicCompanies,prev?.payload?.publicCompanies,0):'<span class="delta neu">Sem base comparativa local</span>');
  setText('top-public-btc',companies?.summary?.totalBtc!=null?`${fmtNumber(companies.summary.totalBtc,0)} BTC`:'N/D');
  setHtml('top-public-btc-delta','<span class="delta neu">Fonte estrutural diaria</span>');

  const topFlows=sortByCurrentBtcDesc((flows?.rows||[]).filter(r=>r?.ticker && r?.btcSpotLast!=null),'btcSpotLast').slice(0,12)
    .map(r=>`<tr><td><span class="operator">${esc(r.ticker)}</span></td><td>${esc(r.issuer)}</td><td class="num">${btcChangeHtml(r.btcSpotLast,r.btcSpotPrevious)}</td><td class="num">${positionCell(r.btcSpotLast,r.date)}</td><td class="num">${positionCell(r.btcSpotPrevious,r.previousDate)}</td><td class="num">${positionCell(r.btcSpotThird ?? r.btcSpotBeforePrevious,r.thirdDate ?? r.beforePreviousDate)}</td><td>${sourceCell('https://farside.co.uk/btc/','Farside')}</td></tr>`).join('');
  setHtml('top-flows-body',topFlows||'<tr><td colspan="7">Sem dados da fonte diaria</td></tr>');

  const companyRows=sortByCurrentBtcDesc((companies?.rows||[]).filter(r=>r?.btcHeld!=null),'btcHeld').slice(0,12);
  const topCompanies=companyRows.map(r=>companyPositionRow(r, companies?.summary?.sourceUrl, false)).join('');
  setHtml('top-companies-body',topCompanies||'<tr><td colspan="7">Sem dados da fonte diaria</td></tr>');
  setHtml('overview-watch-body',unavailableRows());
}
async function renderEtfs(config){
  const snap=await getDailySnapshot(config);
  const flows=snap?.data?.flows || await safeProvider(config,'/api/farside-btc',{ok:false,summary:{latestTotalFlow:null,latestDate:null},rows:[]});
  const list=await loadJson('./data/etf_watchlist.json');
  const rows=list.map(item=>{
    const f=(flows?.rows||[]).find(x=>x.ticker===item.ticker || (x.issuer||'').toLowerCase().includes((item.issuer||'').toLowerCase().split(' ')[0]))||{};
    return etfPositionRow(item, f);
  }).join('');
  setHtml('etf-table-body',rows||'<tr><td colspan="8">Sem dados</td></tr>');
  setText('etf-last-date',flows?.summary?.latestDate||'N/D');
  setText('etf-last-total',flows?.summary?.latestTotalFlow!=null?fmtMoney(flows.summary.latestTotalFlow,'USD',1):'N/D');
}
async function renderCorporates(config){
  const snap=await getDailySnapshot(config);
  const companies=snap?.data?.companies || await safeProvider(config,'/api/public-companies',{ok:false,summary:{publicCompanies:null,totalBtc:null,displayedCompanies:null},rows:[]});
  const companyRows=sortByCurrentBtcDesc((companies?.rows||[]).filter(r=>r?.btcHeld!=null),'btcHeld').slice(0,30);
  const rows=companyRows.map(r=>companyPositionRow(r, companies?.summary?.sourceUrl, true)).join('');
  setHtml('corp-table-body',rows||'<tr><td colspan="8">Sem dados</td></tr>');
  setText('corp-summary-count',companyRows.length?fmtNumber(companyRows.length,0):'N/D');
  setText('corp-summary-btc',companies?.summary?.totalBtc!=null?`${fmtNumber(companies.summary.totalBtc,0)} BTC`:'N/D');
}
async function renderMarket(config){
  const snap=await getDailySnapshot(config);
  const btc=snap?.data?.btc || await safeProvider(config,'/api/btc-price',{ok:false,price:null});
  const flows=snap?.data?.flows || await safeProvider(config,'/api/farside-btc',{ok:false,summary:{latestTotalFlow:null,latestDate:null},rows:[]});
  const companies=snap?.data?.companies || await safeProvider(config,'/api/public-companies',{ok:false,summary:{publicCompanies:null,totalBtc:null},rows:[]});
  setText('market-btc-price',btc?.price?fmtMoney(btc.price,'USD',0):'N/D');
  setText('market-etf-flow',flows?.summary?.latestTotalFlow!=null?fmtMoney(flows.summary.latestTotalFlow,'USD',1):'N/D');
  setText('market-corp-btc',companies?.summary?.totalBtc!=null?`${fmtNumber(companies.summary.totalBtc,0)} BTC`:'N/D');
  setHtml('market-watch',unavailableRows());
}
async function renderSettings(config){
  const snap=await getDailySnapshot(config);
  const [providers,etfs,corps]=await Promise.all([loadJson('./data/providers.json'),loadJson('./data/etf_watchlist.json'),loadJson('./data/company_watchlist.json')]);
  const configView={...config, dailySnapshotEndpoint:'/api/snapshot', dailyCron:'0 11 * * * UTC', snapshotStatus:snap?.status||null};
  setHtml('config-json',`<pre class="code">${esc(JSON.stringify(configView,null,2))}</pre>`);
  setHtml('providers-list',providers.providers.map(p=>`<div class="list-item"><div><strong>${esc(p.name)}</strong></div><div class="small">${esc(p.purpose)}</div><div class="small">Endpoint: ${esc(p.endpoint)}</div></div>`).join(''));
  setText('watch-etf-count',String(etfs.length));
  setText('watch-corp-count',String(corps.length));
}
window.addEventListener('DOMContentLoaded',init);

function yyyyMmDd(value, tz=DEFAULT_TZ){
  if(!value) return new Date().toLocaleDateString('en-CA',{timeZone:tz});
  const d = new Date(value);
  if(Number.isNaN(d.getTime())) return String(value).slice(0,10);
  return d.toLocaleDateString('en-CA',{timeZone:tz});
}
function ptDateFromKey(key){
  if(!key || key==='N/D') return 'N/D';
  const [y,m,d]=String(key).slice(0,10).split('-');
  return y&&m&&d ? `${d}/${m}/${y}` : key;
}
function addDaysKey(key, delta){
  const d=new Date(`${key}T12:00:00Z`);
  if(Number.isNaN(d.getTime())) return 'N/D';
  d.setUTCDate(d.getUTCDate()+delta);
  return d.toISOString().slice(0,10);
}
function loadOnchainHistory(){
  try{ return JSON.parse(localStorage.getItem('btc_spot_monitor_onchain_history_v1')||'[]'); }catch{ return []; }
}
function saveOnchainHistory(entry){
  try{
    const current=loadOnchainHistory().filter(x=>x && x.date && x.date!==entry.date);
    current.push(entry);
    current.sort((a,b)=>String(a.date).localeCompare(String(b.date)));
    const trimmed=current.slice(-30);
    localStorage.setItem('btc_spot_monitor_onchain_history_v1',JSON.stringify(trimmed));
    return trimmed;
  }catch{ return [entry]; }
}
function onchainEntryFromData(data, dateKey){
  const rows=(data?.rows||[]).map(r=>({
    years:r.years,
    bucket:r.bucket,
    metric:r.metric,
    dormantSupply:r.dormantSupply,
    dormantPct:r.dormantPct,
    activeSupply:r.activeSupply,
    currentSupply:r.currentSupply
  }));
  return {date:dateKey, latestDate:data?.latestDate||dateKey, currentSupply:data?.currentSupply??null, rows};
}
function findHistoryEntry(history,dateKey){
  return (history||[]).find(x=>x?.date===dateKey) || null;
}
function cellOnchain(entry, years){
  const r=(entry?.rows||[]).find(x=>Number(x.years)===Number(years));
  if(!r) return '<strong>N/D</strong><span class="sub">sem historico</span>';
  return `<strong>${fmtBtc(r.dormantSupply,0)}</strong><span class="sub">${fmtPercent(r.dormantPct,2)} da oferta</span>`;
}
function exclusiveLabel(min,max){
  if(min===0 && max===1) return 'Ate 1 ano';
  if(max==null) return `${min} anos ou mais`;
  return `Entre ${min} e ${max} anos`;
}
function ageBandsFromOnchain(data){
  if(Array.isArray(data?.ageBands) && data.ageBands.length) return data.ageBands;
  const cumulative=[...(data?.rows||[])]
    .filter(r=>numOrNull(r.years)!==null && numOrNull(r.dormantSupply)!==null)
    .sort((a,b)=>Number(a.years)-Number(b.years));
  if(!cumulative.length || numOrNull(data?.currentSupply)===null) return [];
  const total=Number(data.currentSupply);
  const result=[];
  const first=cumulative[0];
  if(Number(first.years)===1){
    const btcInBand=total-Number(first.dormantSupply);
    result.push({minYears:0,maxYears:1,bucket:'Ate 1 ano',btcInBand,pctOfSupply:btcInBand/total*100,currentSupply:total,metric:first.metric});
  }
  for(let i=0;i<cumulative.length;i++){
    const current=cumulative[i];
    const next=cumulative[i+1];
    const min=Number(current.years);
    const max=next ? Number(next.years) : null;
    const btcInBand=next ? Number(current.dormantSupply)-Number(next.dormantSupply) : Number(current.dormantSupply);
    if(Number.isFinite(btcInBand) && btcInBand>=0){
      result.push({minYears:min,maxYears:max,bucket:exclusiveLabel(min,max),btcInBand,pctOfSupply:btcInBand/total*100,currentSupply:total,metric:current.metric});
    }
  }
  return result;
}
async function renderOnchain(config){
  const snap=await getDailySnapshot(config);
  const data=snap?.data?.onchainDormant || await safeProvider(config,'/api/onchain-dormant',{ok:false,rows:[],source:'BTCFunk HODL Waves'});
  const rows=data?.rows||[];
  const todayKey=yyyyMmDd(data?.latestDate || snap?.generatedAt || new Date(), config.timezone||DEFAULT_TZ);
  const yesterdayKey=addDaysKey(todayKey,-1);
  const beforeYesterdayKey=addDaysKey(todayKey,-2);
  const entry=onchainEntryFromData(data,todayKey);
  const history=saveOnchainHistory(entry);
  const todayEntry=findHistoryEntry(history,todayKey) || entry;
  const yesterdayEntry=findHistoryEntry(history,yesterdayKey);
  const beforeYesterdayEntry=findHistoryEntry(history,beforeYesterdayKey);
  setText('onchain-source',data?.source||'BTCFunk HODL Waves');
  setText('onchain-date',data?.latestDate?new Date(data.latestDate).toLocaleDateString('pt-BR',{timeZone:config.timezone||DEFAULT_TZ}):'N/D');
  setText('onchain-supply',data?.currentSupply!=null?fmtBtc(data.currentSupply,0):'N/D');
  setText('onchain-max-years',data?.maxYearsAvailable?`${data.maxYearsAvailable} anos`:'N/D');
  const maxDormant = rows.length ? rows.reduce((m,r)=>numOrNull(r.dormantSupply)>numOrNull(m.dormantSupply||-Infinity)?r:m, rows[0]) : null;
  setText('onchain-largest-bucket',maxDormant?`${maxDormant.years}+ anos: ${fmtBtc(maxDormant.dormantSupply,0)}`:'N/D');
  setText('onchain-today-label',ptDateFromKey(todayKey));
  setText('onchain-yesterday-label',ptDateFromKey(yesterdayKey));
  setText('onchain-before-yesterday-label',ptDateFromKey(beforeYesterdayKey));
  const yearsList=[...new Set(rows.map(r=>Number(r.years)).filter(Boolean))].sort((a,b)=>a-b);
  const historyBody=yearsList.map(y=>`<tr><td><span class="operator">${y}+ anos</span><span class="sub">nao movimentados</span></td><td class="num">${cellOnchain(todayEntry,y)}</td><td class="num">${cellOnchain(yesterdayEntry,y)}</td><td class="num">${cellOnchain(beforeYesterdayEntry,y)}</td></tr>`).join('');
  setHtml('onchain-history-body',historyBody||'<tr><td colspan="4">Sem dados on-chain. Verifique /api/onchain-dormant.</td></tr>');
  const ageBands=ageBandsFromOnchain(data);
  const totalAgeBands=ageBands.reduce((acc,r)=>acc+(numOrNull(r.btcInBand)||0),0);
  const body=ageBands.map(r=>`<tr><td>${esc(r.bucket||'N/D')}</td><td class="num">${fmtBtc(r.btcInBand,0)}</td><td class="num">${fmtPercent(r.pctOfSupply,2)}</td><td class="num">${fmtBtc(r.currentSupply,0)}</td><td>${esc(r.metric||'N/D')}</td></tr>`).join('');
  const totalRow=ageBands.length ? `<tr><td><strong>Total minerado na leitura</strong></td><td class="num"><strong>${fmtBtc(totalAgeBands,0)}</strong></td><td class="num"><strong>${fmtPercent(totalAgeBands/(numOrNull(data?.currentSupply)||totalAgeBands)*100,2)}</strong></td><td class="num"><strong>${fmtBtc(data?.currentSupply,0)}</strong></td><td>${esc(data?.source||'BTCFunk HODL Waves')}</td></tr>` : '';
  setHtml('onchain-dormant-body',body+totalRow||'<tr><td colspan="5">Sem dados on-chain. Verifique /api/onchain-dormant.</td></tr>');
}
