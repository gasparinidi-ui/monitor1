function setCors(res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
}

// Fonte gratuita, sem chave/API paga.
// A CoinMetrics Community API não libera as métricas SplyAct* necessárias para esta página.
// Por isso usamos BTCFunk HODL Waves, que publica JSON gratuito sem autenticação.
const BTCFUNK_URL = 'https://btcfunk.com/api/hodl';

function toNumber(v){
  if(v===null || v===undefined || v==='') return null;
  if(typeof v==='number') return Number.isFinite(v) ? v : null;
  let s=String(v).trim();
  if(!s) return null;
  const multiplier = /m\b/i.test(s) ? 1_000_000 : /k\b/i.test(s) ? 1_000 : 1;
  s=s.replace(/btc|bitcoin|bitcoins|%|,/gi,'').replace(/[<>+]/g,'').replace(/[a-z]/gi,'').trim();
  const n=Number(s);
  return Number.isFinite(n) ? n*multiplier : null;
}

function pick(obj, keys){
  for(const k of keys){
    if(obj && Object.prototype.hasOwnProperty.call(obj,k) && obj[k]!==undefined && obj[k]!==null) return obj[k];
  }
  return null;
}

function labelOf(band){
  return String(pick(band,['label','name','bucket','age','range','period','title']) || '').trim();
}

function pctOf(band){
  const raw = pick(band,['pct','percent','percentage','share','value_pct','supply_pct','y','value']);
  const n = toNumber(raw);
  if(n===null) return null;
  // Alguns endpoints retornam fração decimal, outros retornam percentual 0-100.
  return n <= 1 ? n*100 : n;
}

function btcOf(band, totalBtc){
  const raw = pick(band,['btc','supply_btc','amount_btc','total_btc','coins','amount','supply']);
  const direct = toNumber(raw);
  if(direct!==null && direct>1000) return direct;
  const pct = pctOf(band);
  if(pct!==null && totalBtc) return totalBtc * pct / 100;
  return null;
}

function totalSupplyFrom(data){
  const direct = toNumber(pick(data,['total_btc','totalBtc','supply','currentSupply','circulating_supply','sply_cur']));
  if(direct && direct>1_000_000) return direct;
  const bands = Array.isArray(data?.bands) ? data.bands : [];
  const sumDirect = bands.reduce((acc,b)=>{
    const raw = pick(b,['btc','supply_btc','amount_btc','coins','amount','supply']);
    const n=toNumber(raw);
    return acc + ((n!==null && n>1000) ? n : 0);
  },0);
  if(sumDirect>1_000_000) return sumDirect;
  return null;
}

function lowerBoundYears(label){
  const s=String(label||'').toLowerCase();
  if(!s) return null;
  if(/10\s*\+|10y\+|10\s*year|10\s*anos/.test(s)) return 10;
  if(/7\s*(y|year|ano)/.test(s)) return 7;
  if(/5\s*(y|year|ano)/.test(s)) return 5;
  if(/4\s*(y|year|ano)/.test(s)) return 4;
  if(/3\s*(y|year|ano)/.test(s)) return 3;
  if(/2\s*(y|year|ano)/.test(s)) return 2;
  if(/1\s*(y|year|ano)/.test(s)) return 1;
  return 0;
}

function extractBands(data){
  if(Array.isArray(data?.bands)) return data.bands;
  if(Array.isArray(data?.data?.bands)) return data.data.bands;
  if(Array.isArray(data?.hodl?.bands)) return data.hodl.bands;
  if(Array.isArray(data)) return data;
  return [];
}

function latestDateFrom(data){
  return pick(data,['updated_at','updatedAt','date','latestDate','timestamp','time']) ||
    pick(data?.data || {},['updated_at','updatedAt','date','latestDate','timestamp','time']) ||
    new Date().toISOString();
}

async function fetchJson(url){
  const r=await fetch(url,{headers:{'user-agent':'BTC Spot Monitor - free on-chain dormant supply'},cache:'no-store'});
  const text=await r.text();
  let data=null;
  try{ data=JSON.parse(text); }catch{ data={raw:text}; }
  if(!r.ok){
    const msg=data?.error || data?.message || text.slice(0,180) || 'falha na consulta';
    throw new Error(`BTCFunk HTTP ${r.status}: ${msg}`);
  }
  return data;
}

function buildRowsFromHodl(data){
  const bands = extractBands(data);
  const totalSupply = totalSupplyFrom(data);
  if(!bands.length) throw new Error('BTCFunk retornou JSON sem bands[]');
  if(!totalSupply) throw new Error('BTCFunk retornou bands[], mas sem total_btc/supply suficiente para converter % em BTC');

  const normalized = bands.map(b=>{
    const label=labelOf(b);
    return {
      label,
      lowerYears: lowerBoundYears(label),
      pct: pctOf(b),
      btc: btcOf(b,totalSupply)
    };
  }).filter(b=>b.label && b.btc!==null && b.lowerYears!==null);

  const thresholds=[1,2,3,4,5,7,10];
  const rows=thresholds.map(years=>{
    const selected=normalized.filter(b=>b.lowerYears>=years);
    const dormant=selected.reduce((acc,b)=>acc+(b.btc||0),0);
    if(!selected.length || !Number.isFinite(dormant) || dormant<=0) return null;
    const dormantPct=dormant/totalSupply*100;
    return {
      years,
      bucket:`≥ ${years} ano${years>1?'s':''} sem movimentação`,
      metric:'BTCFunk HODL Waves',
      currentSupply:totalSupply,
      activeSupply:Math.max(totalSupply-dormant,0),
      dormantSupply:dormant,
      dormantPct,
      date:latestDateFrom(data)
    };
  }).filter(Boolean);

  if(!rows.length) throw new Error('não foi possível calcular faixas 1+, 2+, 3+, 5+ a partir das bands[]');
  return {rows,totalSupply};
}

async function fetchBtcFunk(){
  const data=await fetchJson(BTCFUNK_URL);
  const {rows,totalSupply}=buildRowsFromHodl(data);
  return {
    provider:'BTCFunk HODL Waves',
    endpoint:'btcfunk.com/api/hodl',
    latestDate:latestDateFrom(data),
    currentSupply:totalSupply,
    maxYearsAvailable:rows.reduce((m,r)=>Math.max(m,r.years||0),0),
    rows,
    methodology:'BTC não movimentado = soma das faixas de HODL Waves com idade igual ou superior ao período indicado. As faixas são acumuladas por limiar: 1+, 2+, 3+, 4+, 5+, 7+ e 10+ anos.'
  };
}

export default async function handler(req,res){
  setCors(res);
  if(req.method==='OPTIONS') return res.status(204).end();
  try{
    const result=await fetchBtcFunk();
    res.setHeader('Cache-Control','public, s-maxage=86400, stale-while-revalidate=604800');
    return res.status(200).json({
      ok:true,
      source:result.provider,
      endpoint:result.endpoint,
      methodology:result.methodology,
      maxYearsAvailable:result.maxYearsAvailable,
      latestDate:result.latestDate,
      currentSupply:result.currentSupply,
      rows:result.rows
    });
  }catch(error){
    res.setHeader('Cache-Control','no-store');
    return res.status(500).json({
      ok:false,
      source:'BTCFunk HODL Waves',
      endpoint:'btcfunk.com/api/hodl',
      error:'Não foi possível carregar os dados gratuitos de HODL Waves.',
      details:error.message,
      rows:[]
    });
  }
}
