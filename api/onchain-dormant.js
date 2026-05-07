function setCors(res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
}

const CM_BASE = 'https://community-api.coinmetrics.io/v4/timeseries/asset-metrics';

const METRIC_SETS = [
  [
    { years: 1, metric: 'SplyAct1yr', label: '≥ 1 ano sem movimentação' },
    { years: 2, metric: 'SplyAct2yr', label: '≥ 2 anos sem movimentação' },
    { years: 3, metric: 'SplyAct3yr', label: '≥ 3 anos sem movimentação' },
    { years: 4, metric: 'SplyAct4yr', label: '≥ 4 anos sem movimentação' },
    { years: 5, metric: 'SplyAct5yr', label: '≥ 5 anos sem movimentação' },
    { years: 7, metric: 'SplyAct7yr', label: '≥ 7 anos sem movimentação' },
    { years: 10, metric: 'SplyAct10yr', label: '≥ 10 anos sem movimentação' }
  ],
  [
    { years: 1, metric: 'SplyAct1yr', label: '≥ 1 ano sem movimentação' },
    { years: 2, metric: 'SplyAct2yr', label: '≥ 2 anos sem movimentação' },
    { years: 3, metric: 'SplyAct3yr', label: '≥ 3 anos sem movimentação' },
    { years: 4, metric: 'SplyAct4yr', label: '≥ 4 anos sem movimentação' },
    { years: 5, metric: 'SplyAct5yr', label: '≥ 5 anos sem movimentação' }
  ],
  [
    { years: 1, metric: 'SplyAct1Yr', label: '≥ 1 ano sem movimentação' },
    { years: 2, metric: 'SplyAct2Yr', label: '≥ 2 anos sem movimentação' },
    { years: 3, metric: 'SplyAct3Yr', label: '≥ 3 anos sem movimentação' },
    { years: 4, metric: 'SplyAct4Yr', label: '≥ 4 anos sem movimentação' },
    { years: 5, metric: 'SplyAct5Yr', label: '≥ 5 anos sem movimentação' }
  ]
];

function toNumber(v){
  if(v===null || v===undefined || v==='') return null;
  if(typeof v==='string') v=v.replace('%','').replace(/,/g,'').trim();
  const n=Number(v);
  return Number.isFinite(n)?n:null;
}

function firstRecord(data){
  if(Array.isArray(data?.data)) return data.data[0] || null;
  if(Array.isArray(data)) return data[0] || null;
  return null;
}

async function fetchJson(url){
  const r=await fetch(url.toString(),{
    headers:{'user-agent':'BTC Spot Monitor - CoinMetrics Community API'},
    cache:'no-store'
  });
  const text=await r.text();
  let data=null;
  try{ data=JSON.parse(text); }catch{ data={raw:text}; }
  if(!r.ok){
    const msg=data?.error?.message || data?.message || text.slice(0,180) || 'falha na consulta';
    throw new Error(`CoinMetrics Community API HTTP ${r.status}: ${msg}`);
  }
  return data;
}

async function fetchCoinMetricsCommunity(){
  const errors=[];
  for(const set of METRIC_SETS){
    const metrics=['SplyCur', ...set.map(x=>x.metric)].join(',');
    const url=new URL(CM_BASE);
    url.searchParams.set('assets','btc');
    url.searchParams.set('metrics',metrics);
    url.searchParams.set('frequency','1d');
    url.searchParams.set('page_size','1');
    url.searchParams.set('sort','time_desc');

    try{
      const data=await fetchJson(url);
      const latest=firstRecord(data);
      if(!latest) throw new Error('resposta sem linha de dados');
      const supply=toNumber(latest.SplyCur);
      if(!supply) throw new Error('SplyCur vazio ou inválido');
      const rows=set.map(item=>{
        const active=toNumber(latest[item.metric]);
        const dormant=(active!==null) ? Math.max(supply-active,0) : null;
        const dormantPct=(dormant!==null && supply) ? dormant/supply*100 : null;
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
      }).filter(r=>r.activeSupply!==null && r.dormantSupply!==null);
      if(!rows.length) throw new Error('nenhuma métrica SplyAct disponível no plano Community');
      return {
        provider:'CoinMetrics Community API',
        endpoint:'community-api.coinmetrics.io/v4',
        latestDate:latest.time || null,
        currentSupply:supply,
        maxYearsAvailable: rows.reduce((m,r)=>Math.max(m,r.years||0),0),
        rows,
        methodology:'BTC não movimentado = SplyCur - SplyAct(N)yr. As faixas são limiares acumulados, não buckets exclusivos.'
      };
    }catch(error){
      errors.push({metrics,error:error.message});
    }
  }
  const detail=errors.map(e=>`${e.metrics}: ${e.error}`).join(' | ');
  throw new Error(detail || 'CoinMetrics Community API indisponível');
}

export default async function handler(req,res){
  setCors(res);
  if(req.method==='OPTIONS') return res.status(204).end();
  try{
    const result=await fetchCoinMetricsCommunity();
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
      source:'CoinMetrics Community API',
      endpoint:'community-api.coinmetrics.io/v4',
      error:'Não foi possível carregar os dados on-chain gratuitos da CoinMetrics Community API.',
      details:error.message,
      rows:[]
    });
  }
}
