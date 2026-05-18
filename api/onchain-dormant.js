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

function parseYearsToken(value, unit){
  const n=Number(value);
  if(!Number.isFinite(n)) return null;
  const u=String(unit||'').toLowerCase();
  if(u.startsWith('d')) return n/365;
  if(u.startsWith('w')) return n/52;
  if(u.startsWith('m')) return n/12;
  return n;
}

function bandBounds(label){
  const raw=String(label||'').toLowerCase()
    .replace(/years?/g,'y').replace(/anos?/g,'y')
    .replace(/months?/g,'m').replace(/weeks?/g,'w').replace(/days?/g,'d');
  const s=raw.replace(/\s+/g,'').replace(/[–—_]/g,'-');
  const range=s.match(/(\d+(?:\.\d+)?)([dwmy])-(\d+(?:\.\d+)?)([dwmy])/);
  if(range) return {min:parseYearsToken(range[1],range[2]),max:parseYearsToken(range[3],range[4])};
  const plus=s.match(/(?:>=?|≥)?(\d+(?:\.\d+)?)([dwmy])\+?|\+(\d+(?:\.\d+)?)([dwmy])/);
  if(plus) return {min:parseYearsToken(plus[1] || plus[3],plus[2] || plus[4]),max:null};
  const under=s.match(/(?:<|under|less(?:than)?)(\d+(?:\.\d+)?)([dwmy])/);
  if(under) return {min:0,max:parseYearsToken(under[1],under[2])};
  const lower=lowerBoundYears(label);
  return lower===null ? null : {min:lower,max:null};
}

function yearsLabel(n){
  if(n===0) return '0';
  if(Math.abs(n-1)<1e-9) return '1 ano';
  return `${Number.isInteger(n)?n:n.toFixed(2).replace(/0+$/,'').replace(/\.$/,'')} anos`;
}

function exclusiveBucketLabel(min,max){
  if(min===0 && max!==null && max<=1) return 'Ate 1 ano';
  if(max===null) return `${yearsLabel(min)} ou mais`;
  return `Entre ${yearsLabel(min)} e ${yearsLabel(max)}`;
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
      bounds: bandBounds(label),
      pct: pctOf(b),
      btc: btcOf(b,totalSupply)
    };
  }).filter(b=>b.label && b.btc!==null && b.lowerYears!==null);

  const ageBandsMap=new Map();
  for(const band of normalized){
    if(!band.bounds) continue;
    const min=band.bounds.min || 0;
    const max=band.bounds.max;
    const key=(max!==null && max<=1) ? '0-1' : `${min}-${max ?? 'plus'}`;
    const current=ageBandsMap.get(key) || {
      minYears:(max!==null && max<=1) ? 0 : min,
      maxYears:(max!==null && max<=1) ? 1 : max,
      bucket:(max!==null && max<=1) ? 'Ate 1 ano' : exclusiveBucketLabel(min,max),
      metric:'BTCFunk HODL Waves',
      currentSupply:totalSupply,
      btcInBand:0,
      pctOfSupply:0
    };
    current.btcInBand += band.btc || 0;
    current.pctOfSupply = current.btcInBand/totalSupply*100;
    ageBandsMap.set(key,current);
  }
  const ageBands=[...ageBandsMap.values()]
    .filter(r=>Number.isFinite(r.btcInBand) && r.btcInBand>0)
    .sort((a,b)=>(a.minYears||0)-(b.minYears||0));
  const totalAgeBands=ageBands.reduce((acc,r)=>acc+(r.btcInBand||0),0);

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
  return {rows,ageBands,totalAgeBands,totalSupply};
}

async function fetchBtcFunk(){
  const data=await fetchJson(BTCFUNK_URL);
  const {rows,ageBands,totalAgeBands,totalSupply}=buildRowsFromHodl(data);
  return {
    provider:'BTCFunk HODL Waves',
    endpoint:'btcfunk.com/api/hodl',
    latestDate:latestDateFrom(data),
    currentSupply:totalSupply,
    maxYearsAvailable:rows.reduce((m,r)=>Math.max(m,r.years||0),0),
    rows,
    ageBands,
    totalAgeBands,
    methodology:'rows = faixas acumuladas por limiar. ageBands = faixas exclusivas por idade, sem dupla contagem; a soma deve fechar na oferta atual minerada retornada pela fonte.'
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
      rows:result.rows,
      ageBands:result.ageBands,
      totalAgeBands:result.totalAgeBands
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
