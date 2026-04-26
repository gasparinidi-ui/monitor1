const DEFAULT_TZ = 'America/Campo_Grande';
let DAILY_SNAPSHOT_CACHE = null;

async function loadJson(path){
  const r = await fetch(path, { cache: 'no-store' });
  if(!r.ok) throw new Error(`Falha ao carregar ${path} (${r.status})`);
  return r.json();
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
function findPreviousDifferentFromHistory(history,row,currentDate,valueField='btcHeld'){
  const key=(row.ticker||row.company||'').toUpperCase();
  const currentValue=row[valueField];
  for(const snap of [...history].reverse()){
    for(const candidate of (snap.rows||[])){
      const ckey=(candidate.ticker||candidate.company||'').toUpperCase();
      if(ckey!==key) continue;
      const candidateDate=candidate.lastDisclosureDate||candidate.date||snap.date||null;
      const candidateValue=candidate[valueField];
      if(sameDateLabel(candidateDate,currentDate)) continue;
      if(sameValue(candidateValue,currentValue)) continue;
      return {date:candidateDate,value:candidateValue};
    }
  }
  return {date:null,value:null};
}
function todayLabel(tz=DEFAULT_TZ){
  return new Date().toLocaleDateString('pt-BR',{timeZone:tz});
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
  return `<span class="delta ${cls}">${prefix}${fmtNumber(delta,d)} vs. último snapshot local</span>`;
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
  if(!res.ok) throw new Error(`${endpoint}: HTTP ${res.status}${data?.error ? ' — '+data.error : ''}`);
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
    addRuntimeWarning(`Snapshot diário indisponível: ${err.message}. Usando APIs individuais como fallback.`);
    DAILY_SNAPSHOT_CACHE = null;
    return null;
  }
}
function renderSnapshotStatus(snap, config){
  const status=snap?.status?.label || 'N/D';
  const generated=fmtDateTime(snap?.generatedAt, config.timezone || DEFAULT_TZ);
  const failed=(snap?.status?.failed||[]).length ? ` | Falhas: ${(snap.status.failed||[]).join(', ')}` : '';
  setText('snapshot-status',`${status} | Snapshot: ${generated}${failed}`);
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
  setHtml('page-error',`<div class="notice bad-note"><strong>Erro ao inicializar:</strong> ${err.message}</div>`);
}

async function init(){
  let config;
  try{ config = await loadJson('./data/app-config.json'); }
  catch(err){ showFatal(err); return; }
  const tz = config.timezone || DEFAULT_TZ;
  setText('generated-time',new Date().toLocaleString('pt-BR',{timeZone:tz}));
  setText('api-base',normalizeApiBase(config)||'mesma origem');
  setText('snapshot-status','Carregando snapshot diário...');
  const page=document.body.dataset.page||'overview';
  buildNav(page);
  try{
    if(page==='overview') await renderOverview(config);
    if(page==='etfs') await renderEtfs(config);
    if(page==='corporates') await renderCorporates(config);
    if(page==='market') await renderMarket(config);
    if(page==='settings') await renderSettings(config);
  }catch(err){ showFatal(err); }
  setText('refresh-ms','diário via Vercel Cron');
}

async function renderOverview(config){
  const snap=await getDailySnapshot(config);
  const btc=snap?.data?.btc || await safeProvider(config,'/api/btc-price',{ok:false,price:null});
  const flows=snap?.data?.flows || await safeProvider(config,'/api/farside-btc',{ok:false,summary:{latestTotalFlow:null,latestDate:null},rows:[]});
  const companies=snap?.data?.companies || await safeProvider(config,'/api/public-companies',{ok:false,summary:{publicCompanies:null,totalBtc:null},rows:[]});
  const batch=snap?.data?.overviewQuotes || await safeProvider(config,'/api/finnhub-batch?kind=overview',{ok:false,quotes:[]});
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
  setHtml('top-public-btc-delta','<span class="delta neu">Fonte estrutural diária</span>');
  const topFlows=sortByCurrentBtcDesc((flows?.rows||[]).filter(r=>r?.ticker && r?.btcSpotLast!=null),'btcSpotLast')
    .slice(0,12)
    .map(r=>`<tr><td>${r.ticker||'N/D'}</td><td>${r.issuer||'N/D'}</td><td>${btcChangeHtml(r.btcSpotLast,r.btcSpotPrevious)}</td><td>${r.date||'N/D'}</td><td>${fmtBtc(r.btcSpotLast,0)}</td><td>${r.previousDate||'N/D'}</td><td>${fmtBtc(r.btcSpotPrevious,0)}</td></tr>`).join('');
  setHtml('top-flows-body',topFlows||'<tr><td colspan="7">Sem dados da fonte diária</td></tr>');

  const companyHistoryKey='btc-spot-monitor-company-ranking-history';
  const companyHistory=readHistory(companyHistoryKey);
  const companyWatchlist=await loadJson('./data/company_watchlist.json');
  const matchedCompanyRows=companyWatchlist.map(item=>{
    const live=(companies?.rows||[]).find(x=>
      (x.ticker||'').toUpperCase()===item.ticker.toUpperCase() ||
      (x.company||'').toLowerCase().includes((item.company||'').toLowerCase().split(' ')[0])
    )||{};
    return {
      ticker:item.ticker,
      company:item.company,
      btcHeld:live.btcHeld ?? null,
      valueUsd:live.valueUsd ?? null,
      lastDisclosureDate:live.lastDisclosureDate || live.date || companies?.summary?.latestDate || 'Base diária',
      previousDisclosureDate:live.previousDisclosureDate || null,
      previousBtcHeld:live.previousBtcHeld ?? null
    };
  });
  const companyRows=sortByCurrentBtcDesc(matchedCompanyRows.filter(r=>r?.btcHeld!=null),'btcHeld').slice(0,12);
  const topCompanies=companyRows.map(r=>{
    const lastDate=r.lastDisclosureDate||companies?.summary?.latestDate||todayLabel(config.timezone||DEFAULT_TZ);
    let previousDate=r.previousDisclosureDate||null;
    let previousBtc=r.previousBtcHeld ?? null;
    if(!previousDate || sameDateLabel(previousDate,lastDate) || sameValue(previousBtc,r.btcHeld)){
      const histPrev=findPreviousDifferentFromHistory(companyHistory,r,lastDate,'btcHeld');
      previousDate=histPrev.date;
      previousBtc=histPrev.value;
    }
    return `<tr><td>${r.ticker||'N/D'}</td><td>${r.company||'N/D'}</td><td>${btcChangeHtml(r.btcHeld,previousBtc)}</td><td>${lastDate}</td><td>${fmtBtc(r.btcHeld,0)}</td><td>${previousDate||'N/D'}</td><td>${fmtBtc(previousBtc,0)}</td></tr>`;
  }).join('');
  setHtml('top-companies-body',topCompanies||'<tr><td colspan="7">Sem dados da fonte diária</td></tr>');
  saveHistory(companyHistoryKey,{date:todayLabel(config.timezone||DEFAULT_TZ),rows:companyRows.map(r=>({ticker:r.ticker,company:r.company,btcHeld:r.btcHeld,lastDisclosureDate:r.lastDisclosureDate||todayLabel(config.timezone||DEFAULT_TZ)}))});
  const watch=(batch?.quotes||[]).map(q=>`<div class="list-item"><div style="display:flex;justify-content:space-between;gap:12px;align-items:center"><div><div><strong>${q.symbol}</strong> <span class="small">— ${q.name||'N/D'}</span></div><div class="small">${q.type||'Watchlist'}</div></div><div style="text-align:right"><div><strong>${fmtMoney(q.price,'USD',2)}</strong></div><div class="small">${fmtPercent(q.changePct,2)}</div></div></div></div>`).join('');
  setHtml('watchlist-cards',watch||'<div class="notice">Sem dados de cotação. Verifique FINNHUB_API_KEY na Vercel.</div>');
}
async function renderEtfs(config){
  const snap=await getDailySnapshot(config);
  const flows=snap?.data?.flows || await safeProvider(config,'/api/farside-btc',{ok:false,summary:{latestTotalFlow:null,latestDate:null},rows:[]});
  const holdings=snap?.data?.etfQuotes || await safeProvider(config,'/api/finnhub-batch?kind=etfs',{ok:false,quotes:[]});
  const list=await loadJson('./data/etf_watchlist.json');
  const rows=list.map(item=>{
    const q=(holdings?.quotes||[]).find(x=>x.symbol===item.ticker)||{};
    const f=(flows?.rows||[]).find(x=>x.ticker===item.ticker || (x.issuer||'').toLowerCase().includes((item.issuer||'').toLowerCase().split(' ')[0]))||{};
    return `<tr><td>${item.ticker}</td><td>${item.issuer}</td><td>${item.label}</td><td>${fmtMoney(q.price,'USD',2)}</td><td>${fmtPercent(q.changePct,2)}</td><td>${fmtMoney(f.flow,'USD',1)}</td><td>${fmtMoney(q.aum||null,'USD',0)}</td><td>${fmtNumber(q.sharesOutstanding||null,0)}</td></tr>`;
  }).join('');
  setHtml('etf-table-body',rows||'<tr><td colspan="8">Sem dados</td></tr>');
  setText('etf-last-date',flows?.summary?.latestDate||'N/D');
  setText('etf-last-total',flows?.summary?.latestTotalFlow!=null?fmtMoney(flows.summary.latestTotalFlow,'USD',1):'N/D');
}
async function renderCorporates(config){
  const snap=await getDailySnapshot(config);
  const companies=snap?.data?.companies || await safeProvider(config,'/api/public-companies',{ok:false,summary:{publicCompanies:null,totalBtc:null},rows:[]});
  const quotes=snap?.data?.companyQuotes || await safeProvider(config,'/api/finnhub-batch?kind=companies',{ok:false,quotes:[]});
  const list=await loadJson('./data/company_watchlist.json');
  const mapQuote=new Map((quotes?.quotes||[]).map(x=>[x.symbol,x]));
  const rows=list.map(item=>{
    const q=mapQuote.get(item.ticker)||{};
    const live=(companies?.rows||[]).find(x=>(x.ticker||'').toUpperCase()===item.ticker.toUpperCase() || (x.company||'').toLowerCase().includes((item.company||'').toLowerCase().split(' ')[0]))||{};
    return `<tr><td>${item.company}</td><td>${item.ticker}</td><td>${item.bucket}</td><td>${fmtMoney(q.price,'USD',2)}</td><td>${fmtPercent(q.changePct,2)}</td><td>${fmtNumber(live.btcHeld||null,0)}</td><td>${fmtMoney(live.valueUsd||null,'USD',0)}</td><td><a href="${item.officialSource}" target="_blank" rel="noreferrer">IR</a></td></tr>`;
  }).join('');
  setHtml('corp-table-body',rows||'<tr><td colspan="8">Sem dados</td></tr>');
  setText('corp-summary-count',companies?.summary?.publicCompanies!=null?fmtNumber(companies.summary.publicCompanies,0):'N/D');
  setText('corp-summary-btc',companies?.summary?.totalBtc!=null?`${fmtNumber(companies.summary.totalBtc,0)} BTC`:'N/D');
}
async function renderMarket(config){
  const snap=await getDailySnapshot(config);
  const btc=snap?.data?.btc || await safeProvider(config,'/api/btc-price',{ok:false,price:null});
  const flows=snap?.data?.flows || await safeProvider(config,'/api/farside-btc',{ok:false,summary:{latestTotalFlow:null,latestDate:null},rows:[]});
  const companies=snap?.data?.companies || await safeProvider(config,'/api/public-companies',{ok:false,summary:{publicCompanies:null,totalBtc:null},rows:[]});
  const etfQuotes=snap?.data?.etfQuotes || await safeProvider(config,'/api/finnhub-batch?kind=etfs',{ok:false,quotes:[]});
  setText('market-btc-price',btc?.price?fmtMoney(btc.price,'USD',0):'N/D');
  setText('market-etf-flow',flows?.summary?.latestTotalFlow!=null?fmtMoney(flows.summary.latestTotalFlow,'USD',1):'N/D');
  setText('market-corp-btc',companies?.summary?.totalBtc!=null?`${fmtNumber(companies.summary.totalBtc,0)} BTC`:'N/D');
  const top3=(etfQuotes?.quotes||[]).slice(0,6).map(q=>`<div class="list-item"><div class="kv"><div>${q.symbol}</div><div><strong>${fmtMoney(q.price,'USD',2)}</strong> <span class="small">· ${fmtPercent(q.changePct,2)}</span></div></div></div>`).join('');
  setHtml('market-watch',top3||'<div class="notice">Sem dados de cotação. Verifique FINNHUB_API_KEY na Vercel.</div>');
}
async function renderSettings(config){
  const snap=await getDailySnapshot(config);
  const [providers,etfs,corps]=await Promise.all([loadJson('./data/providers.json'),loadJson('./data/etf_watchlist.json'),loadJson('./data/company_watchlist.json')]);
  const configView={...config, dailySnapshotEndpoint:'/api/snapshot', dailyCron:'0 11 * * * UTC', snapshotStatus:snap?.status||null};
  setHtml('config-json',`<pre class="code">${JSON.stringify(configView,null,2)}</pre>`);
  setHtml('providers-list',providers.providers.map(p=>`<div class="list-item"><div><strong>${p.name}</strong></div><div class="small">${p.purpose}</div><div class="small">Endpoint: ${p.endpoint}</div></div>`).join(''));
  setText('watch-etf-count',String(etfs.length));
  setText('watch-corp-count',String(corps.length));
}
window.addEventListener('DOMContentLoaded',init);
