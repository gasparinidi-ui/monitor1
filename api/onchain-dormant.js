function setCors(res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
}

const METRICS = [
  { years: 1, metric: 'SplyAct1Yr', label: '≥ 1 ano sem movimentação' },
  { years: 2, metric: 'SplyAct2Yr', label: '≥ 2 anos sem movimentação' },
  { years: 3, metric: 'SplyAct3Yr', label: '≥ 3 anos sem movimentação' },
  { years: 4, metric: 'SplyAct4Yr', label: '≥ 4 anos sem movimentação' },
  { years: 5, metric: 'SplyAct5Yr', label: '≥ 5 anos sem movimentação' }
];

function toNumber(v){
  if(v===null || v===undefined || v==='') return null;
  const n=Number(v);
  return Number.isFinite(n)?n:null;
}

async function fetchCoinMetrics(){
  const metrics=['SplyCur', ...METRICS.map(x=>x.metric)].join(',');
  const url=new URL('https://api.coinmetrics.io/v4/timeseries/asset-metrics');
  url.searchParams.set('assets','btc');
  url.searchParams.set('metrics',metrics);
  url.searchParams.set('frequency','1d');
  url.searchParams.set('page_size','1');
  url.searchParams.set('sort','time_desc');
  if(process.env.COINMETRICS_API_KEY) url.searchParams.set('api_key',process.env.COINMETRICS_API_KEY);
  const r=await fetch(url.toString(),{
    headers:{'user-agent':'BTC Spot Monitor on-chain dormant supply'},
    cache:'no-store'
  });
  const data=await r.json().catch(()=>null);
  if(!r.ok) throw new Error(`CoinMetrics HTTP ${r.status}: ${data?.error?.message || data?.message || 'falha na consulta'}`);
  const latest=Array.isArray(data?.data) ? data.data[0] : null;
  if(!latest) throw new Error('CoinMetrics retornou resposta sem dados');
  return latest;
}

function buildRows(latest){
  const supply=toNumber(latest.SplyCur);
  return METRICS.map(item=>{
    const active=toNumber(latest[item.metric]);
    const dormant=(supply!==null && active!==null) ? Math.max(supply-active,0) : null;
    const dormantPct=(supply && dormant!==null) ? dormant/supply*100 : null;
    return {
      years:item.years,
      bucket:item.label,
      metric:item.metric,
      currentSupply:supply,
      activeSupply:active,
      dormantSupply:dormant,
      dormantPct,
      date:latest.time || null
    };
  }).filter(r=>r.activeSupply!==null || r.dormantSupply!==null);
}

export default async function handler(req,res){
  setCors(res);
  if(req.method==='OPTIONS') return res.status(204).end();
  try{
    const latest=await fetchCoinMetrics();
    const rows=buildRows(latest);
    const supply=toNumber(latest.SplyCur);
    res.setHeader('Cache-Control','public, s-maxage=86400, stale-while-revalidate=604800');
    return res.status(200).json({
      ok:true,
      source:'CoinMetrics Community API',
      methodology:'Dormant supply = SplyCur - active supply in the trailing N-year interval. Cohorts are cumulative thresholds, not mutually exclusive buckets.',
      maxYearsAvailable: rows.reduce((m,r)=>Math.max(m,r.years||0),0),
      latestDate: latest.time || null,
      currentSupply:supply,
      rows
    });
  }catch(error){
    res.setHeader('Cache-Control','no-store');
    return res.status(500).json({ok:false,source:'CoinMetrics Community API',error:error.message,rows:[]});
  }
}
