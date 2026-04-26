const DEFAULT_TZ = 'America/Campo_Grande';

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
function fmtPercent(v,d=2){
  if(v===null||v===undefined||v==='') return 'N/D';
  const n=Number(v);
  if(Number.isNaN(n)) return String(v);
  return `${n.toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d})}%`;
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
  return `<span class="delta ${cls}">${prefix}${fmtNumber(delta,d)} vs. último refresh local</span>`;
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
async function safeProvider(config, endpoint, fallback){
  try { return await fetchProvider(config, endpoint); }
  catch(err){
    console.warn(err);
    addRuntimeWarning(err.message);
    return fallback;
  }
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
  try{
    config = await loadJson('./data/app-config.json');
  }catch(err){
    showFatal(err);
    return;
  }
  const tz = config.timezone || DEFAULT_TZ;
  setText('generated-time',new Date().toLocaleString('pt-BR',{timeZone:tz}));
  setText('api-base',normalizeApiBase(config)||'mesma origem');
  const page=document.body.dataset.page||'overview';
  buildNav(page);
  try{
    if(page==='overview') await renderOverview(config);
    if(page==='etfs') await renderEtfs(config);
    if(page==='corporates') await renderCorporates(config);
    if(page==='market') await renderMarket(config);
    if(page==='settings') await renderSettings(config);
  }catch(err){ showFatal(err); }
  if(config.refreshMs){
    setText('refresh-ms',`${Math.round(config.refreshMs/1000)}s`);
    setInterval(()=>window.location.reload(),config.refreshMs);
  } else {
    setText('refresh-ms','desativado');
  }
}

async function renderOverview(config){
  const [btc,flows,companies,batch]=await Promise.all([
    safeProvider(config,'/api/btc-price',{ok:false,price:null}),
    safeProvider(config,'/api/farside-btc',{ok:false,summary:{latestTotalFlow:null,latestDate:null},rows:[]}),
    safeProvider(config,'/api/public-companies',{ok:false,summary:{publicCompanies:null,totalBtc:null},rows:[]}),
    safeProvider(config,'/api/finnhub-batch?kind=overview',{ok:false,quotes:[]})
  ]);
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
  setHtml('top-public-btc-delta','<span class="delta neu">Fonte estrutural</span>');
  const topFlows=(flows?.rows||[]).slice(0,8).map(r=>`<tr><td>${r.ticker||'N/D'}</td><td>${r.issuer||'N/D'}</td><td>${fmtMoney(r.flow,'USD',1)}</td><td>${fmtMoney(r.aum||null,'USD',0)}</td></tr>`).join('');
  setHtml('top-flows-body',topFlows||'<tr><td colspan="4">Sem dados</td></tr>');
  const topCompanies=(companies?.rows||[]).slice(0,8).map(r=>`<tr><td>${r.company||'N/D'}</td><td>${r.ticker||'N/D'}</td><td>${fmtNumber(r.btcHeld,0)}</td><td>${fmtMoney(r.valueUsd||null,'USD',0)}</td></tr>`).join('');
  setHtml('top-companies-body',topCompanies||'<tr><td colspan="4">Sem dados</td></tr>');
  const watch=(batch?.quotes||[]).map(q=>`<div class="list-item"><div style="display:flex;justify-content:space-between;gap:12px;align-items:center"><div><div><strong>${q.symbol}</strong> <span class="small">— ${q.name||'N/D'}</span></div><div class="small">${q.type||'Watchlist'}</div></div><div style="text-align:right"><div><strong>${fmtMoney(q.price,'USD',2)}</strong></div><div class="small">${fmtPercent(q.changePct,2)}</div></div></div></div>`).join('');
  setHtml('watchlist-cards',watch||'<div class="notice">Sem dados de cotação. Verifique FINNHUB_API_KEY na Vercel.</div>');
}
async function renderEtfs(config){
  const [flows,holdings,list]=await Promise.all([
    safeProvider(config,'/api/farside-btc',{ok:false,summary:{latestTotalFlow:null,latestDate:null},rows:[]}),
    safeProvider(config,'/api/finnhub-batch?kind=etfs',{ok:false,quotes:[]}),
    loadJson('./data/etf_watchlist.json')
  ]);
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
  const [companies,quotes,list]=await Promise.all([
    safeProvider(config,'/api/public-companies',{ok:false,summary:{publicCompanies:null,totalBtc:null},rows:[]}),
    safeProvider(config,'/api/finnhub-batch?kind=companies',{ok:false,quotes:[]}),
    loadJson('./data/company_watchlist.json')
  ]);
  const mapQuote=new Map((quotes?.quotes||[]).map(x=>[x.symbol,x]));
  const rows=list.map(item=>{
    const q=mapQuote.get(item.ticker)||{};
    const live=(companies?.rows||[]).find(x=>(x.ticker||'').toUpperCase()===item.ticker.toUpperCase())||{};
    return `<tr><td>${item.company}</td><td>${item.ticker}</td><td>${item.bucket}</td><td>${fmtMoney(q.price,'USD',2)}</td><td>${fmtPercent(q.changePct,2)}</td><td>${fmtNumber(live.btcHeld||null,0)}</td><td>${fmtMoney(live.valueUsd||null,'USD',0)}</td><td><a href="${item.officialSource}" target="_blank" rel="noreferrer">IR</a></td></tr>`;
  }).join('');
  setHtml('corp-table-body',rows||'<tr><td colspan="8">Sem dados</td></tr>');
  setText('corp-summary-count',companies?.summary?.publicCompanies!=null?fmtNumber(companies.summary.publicCompanies,0):'N/D');
  setText('corp-summary-btc',companies?.summary?.totalBtc!=null?`${fmtNumber(companies.summary.totalBtc,0)} BTC`:'N/D');
}
async function renderMarket(config){
  const [btc,flows,companies,etfQuotes]=await Promise.all([
    safeProvider(config,'/api/btc-price',{ok:false,price:null}),
    safeProvider(config,'/api/farside-btc',{ok:false,summary:{latestTotalFlow:null,latestDate:null},rows:[]}),
    safeProvider(config,'/api/public-companies',{ok:false,summary:{publicCompanies:null,totalBtc:null},rows:[]}),
    safeProvider(config,'/api/finnhub-batch?kind=etfs',{ok:false,quotes:[]})
  ]);
  setText('market-btc-price',btc?.price?fmtMoney(btc.price,'USD',0):'N/D');
  setText('market-etf-flow',flows?.summary?.latestTotalFlow!=null?fmtMoney(flows.summary.latestTotalFlow,'USD',1):'N/D');
  setText('market-corp-btc',companies?.summary?.totalBtc!=null?`${fmtNumber(companies.summary.totalBtc,0)} BTC`:'N/D');
  const top3=(etfQuotes?.quotes||[]).slice(0,6).map(q=>`<div class="list-item"><div class="kv"><div>${q.symbol}</div><div><strong>${fmtMoney(q.price,'USD',2)}</strong> <span class="small">· ${fmtPercent(q.changePct,2)}</span></div></div></div>`).join('');
  setHtml('market-watch',top3||'<div class="notice">Sem dados de cotação. Verifique FINNHUB_API_KEY na Vercel.</div>');
}
async function renderSettings(config){
  const [providers,etfs,corps]=await Promise.all([loadJson('./data/providers.json'),loadJson('./data/etf_watchlist.json'),loadJson('./data/company_watchlist.json')]);
  setHtml('config-json',`<pre class="code">${JSON.stringify(config,null,2)}</pre>`);
  setHtml('providers-list',providers.providers.map(p=>`<div class="list-item"><div><strong>${p.name}</strong></div><div class="small">${p.purpose}</div><div class="small">Endpoint: ${p.endpoint}</div></div>`).join(''));
  setText('watch-etf-count',String(etfs.length));
  setText('watch-corp-count',String(corps.length));
}
window.addEventListener('DOMContentLoaded',init);
