function setCors(res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
}

const BITBO_WAVES = [
  { years: 1, key: 'wave_5', index: 5, label: '≥ 1 ano sem movimentação' },
  { years: 2, key: 'wave_6', index: 6, label: '≥ 2 anos sem movimentação' },
  { years: 3, key: 'wave_7', index: 7, label: '≥ 3 anos sem movimentação' },
  { years: 5, key: 'wave_8', index: 8, label: '≥ 5 anos sem movimentação' },
  { years: 7, key: 'wave_9', index: 9, label: '≥ 7 anos sem movimentação' },
  { years: 10, key: 'wave_10', index: 10, label: '≥ 10 anos sem movimentação' }
];

const CM_METRIC_SETS = [
  [
    { years: 1, metric: 'SplyAct1Yr', label: '≥ 1 ano sem movimentação' },
    { years: 2, metric: 'SplyAct2Yr', label: '≥ 2 anos sem movimentação' },
    { years: 3, metric: 'SplyAct3Yr', label: '≥ 3 anos sem movimentação' },
    { years: 4, metric: 'SplyAct4Yr', label: '≥ 4 anos sem movimentação' },
    { years: 5, metric: 'SplyAct5Yr', label: '≥ 5 anos sem movimentação' }
  ],
  [
    { years: 1, metric: 'SplyAct1yr', label: '≥ 1 ano sem movimentação' },
    { years: 2, metric: 'SplyAct2yr', label: '≥ 2 anos sem movimentação' },
    { years: 3, metric: 'SplyAct3yr', label: '≥ 3 anos sem movimentação' },
    { years: 4, metric: 'SplyAct4yr', label: '≥ 4 anos sem movimentação' },
    { years: 5, metric: 'SplyAct5yr', label: '≥ 5 anos sem movimentação' }
  ]
];

function toNumber(v){
  if(v===null || v===undefined || v==='') return null;
  if(typeof v==='string') v=v.replace('%','').replace(/,/g,'').trim();
  const n=Number(v);
  return Number.isFinite(n)?n:null;
}

function firstRecord(data){
  if(Array.isArray(data)) return Array.isArray(data[0]) || typeof data[0]==='object' ? data[0] : null;
  if(Array.isArray(data?.data)) return data.data[0];
  if(Array.isArray(data?.values)) return data.values[0];
  if(Array.isArray(data?.result)) return data.result[0];
  if(data && typeof data==='object') return data.data && !Array.isArray(data.data) ? data.data : data;
  return null;
}

async function fetchJson(url, label){
  const r=await fetch(url.toString(),{
    headers:{'user-agent':'BTC Spot Monitor on-chain dormant supply'},
    cache:'no-store'
  });
  const text=await r.text();
  let data=null;
  try{ data=JSON.parse(text); }catch{ data=text; }
  if(!r.ok){
    const msg=data?.error?.message || data?.message || (typeof data==='string' ? data.slice(0,160) : 'falha na consulta');
    throw new Error(`${label} HTTP ${r.status}: ${msg}`);
  }
  return data;
}

async function fetchCurrentSupply(){
  // Prefer CoinMetrics SplyCur; fallback to blockchain.info current circulation in satoshis.
  try{
    const url=new URL('https://api.coinmetrics.io/v4/timeseries/asset-metrics');
    url.searchParams.set('assets','btc');
    url.searchParams.set('metrics','SplyCur');
    url.searchParams.set('frequency','1d');
    url.searchParams.set('page_size','1');
    url.searchParams.set('sort','time_desc');
    if(process.env.COINMETRICS_API_KEY) url.searchParams.set('api_key',process.env.COINMETRICS_API_KEY);
    const data=await fetchJson(url,'CoinMetrics SplyCur');
    const latest=firstRecord(data);
    const supply=toNumber(latest?.SplyCur);
    if(supply) return {supply,date:latest?.time||null,source:'CoinMetrics SplyCur'};
  }catch{}
  const r=await fetch('https://blockchain.info/q/totalbc',{headers:{'user-agent':'BTC Spot Monitor'},cache:'no-store'});
  const text=await r.text();
  if(!r.ok) throw new Error(`blockchain.info totalbc HTTP ${r.status}`);
  const sats=toNumber(text);
  if(!sats) throw new Error('blockchain.info totalbc sem valor');
  return {supply:sats/100000000,date:new Date().toISOString(),source:'blockchain.info totalbc'};
}

function valueFromBitboRecord(record, item){
  if(!record) return null;
  if(Array.isArray(record)) return toNumber(record[item.index]);
  return toNumber(record[item.key] ?? record[`wave_${item.index}`] ?? record[item.index]);
}

async function fetchBitbo(){
  const supplyInfo=await fetchCurrentSupply();
  const url=new URL('https://charts.bitbo.io/api/v1/hodl-waves/');
  url.searchParams.set('latest','true');
  if(process.env.BITBO_API_KEY) url.searchParams.set('api_key',process.env.BITBO_API_KEY);
  const data=await fetchJson(url,'Bitbo hodl-waves');
  const record=firstRecord(data);
  if(!record) throw new Error('Bitbo retornou resposta sem dados');
  const date=(Array.isArray(record)?record[0]:record.date) || data?.date || supplyInfo.date || null;
  const rows=BITBO_WAVES.map(item=>{
    const pct=valueFromBitboRecord(record,item);
    // Bitbo HODL Waves are percentages of circulating supply at each age threshold.
    const dormantPct=pct===null ? null : (pct>1 ? pct : pct*100);
    const dormantSupply=dormantPct===null ? null : supplyInfo.supply*(dormantPct/100);
    const activeSupply=dormantSupply===null ? null : Math.max(supplyInfo.supply-dormantSupply,0);
    return {
      years:item.years,
      bucket:item.label,
      metric:`Bitbo hodl-waves ${item.key}`,
      currentSupply:supplyInfo.supply,
      activeSupply,
      dormantSupply,
      dormantPct,
      date
    };
  }).filter(r=>r.dormantSupply!==null);
  if(!rows.length) throw new Error('Bitbo não retornou ondas utilizáveis');
  return {
    provider:'Bitbo HODL Waves',
    supplySource:supplyInfo.source,
    latestDate:date,
    currentSupply:supplyInfo.supply,
    rows,
    methodology:'HODL Waves: percentual da oferta por idade desde a última movimentação on-chain. BTC não movimentado = percentual da faixa × oferta atual.'
  };
}

async function fetchCoinMetrics(){
  let lastError=null;
  for(const set of CM_METRIC_SETS){
    try{
      const metrics=['SplyCur', ...set.map(x=>x.metric)].join(',');
      const url=new URL('https://api.coinmetrics.io/v4/timeseries/asset-metrics');
      url.searchParams.set('assets','btc');
      url.searchParams.set('metrics',metrics);
      url.searchParams.set('frequency','1d');
      url.searchParams.set('page_size','1');
      url.searchParams.set('sort','time_desc');
      if(process.env.COINMETRICS_API_KEY) url.searchParams.set('api_key',process.env.COINMETRICS_API_KEY);
      const data=await fetchJson(url,'CoinMetrics active supply');
      const latest=firstRecord(data);
      if(!latest) throw new Error('CoinMetrics retornou resposta sem dados');
      const supply=toNumber(latest.SplyCur);
      if(!supply) throw new Error('CoinMetrics retornou SplyCur vazio');
      const rows=set.map(item=>{
        const active=toNumber(latest[item.metric]);
        const dormant=(supply!==null && active!==null) ? Math.max(supply-active,0) : null;
        const dormantPct=(supply && dormant!==null) ? dormant/supply*100 : null;
        return {years:item.years,bucket:item.label,metric:item.metric,currentSupply:supply,activeSupply:active,dormantSupply:dormant,dormantPct,date:latest.time||null};
      }).filter(r=>r.activeSupply!==null || r.dormantSupply!==null);
      if(!rows.length) throw new Error('CoinMetrics sem métricas SplyAct utilizáveis');
      return {
        provider:'CoinMetrics Community API',
        latestDate:latest.time||null,
        currentSupply:supply,
        rows,
        methodology:'Dormant supply = SplyCur - active supply in the trailing N-year interval. Cohorts are cumulative thresholds, not mutually exclusive buckets.'
      };
    }catch(error){ lastError=error; }
  }
  throw lastError || new Error('CoinMetrics indisponível');
}

export default async function handler(req,res){
  setCors(res);
  if(req.method==='OPTIONS') return res.status(204).end();
  const errors=[];
  try{
    let result;
    try{
      result=await fetchBitbo();
    }catch(error){
      errors.push({source:'Bitbo HODL Waves',error:error.message});
      result=await fetchCoinMetrics();
    }
    const rows=Array.isArray(result.rows) ? result.rows : [];
    res.setHeader('Cache-Control','public, s-maxage=86400, stale-while-revalidate=604800');
    return res.status(200).json({
      ok:true,
      source:result.provider,
      supplySource:result.supplySource || result.provider,
      methodology:result.methodology,
      maxYearsAvailable: rows.reduce((m,r)=>Math.max(m,r.years||0),0),
      latestDate: result.latestDate || null,
      currentSupply:result.currentSupply ?? null,
      rows,
      fallbackErrors:errors
    });
  }catch(error){
    errors.push({source:'CoinMetrics active supply',error:error.message});
    res.setHeader('Cache-Control','no-store');
    return res.status(500).json({
      ok:false,
      source:'Bitbo HODL Waves / CoinMetrics',
      error:'Não foi possível carregar dados on-chain. Configure BITBO_API_KEY ou COINMETRICS_API_KEY no Vercel se a fonte exigir autenticação.',
      details:errors,
      rows:[]
    });
  }
}
