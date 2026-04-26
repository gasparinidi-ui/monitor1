function setCors(res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
}

function absoluteBaseUrl(req){
  const proto=(req.headers['x-forwarded-proto']||'https').split(',')[0];
  const host=req.headers['x-forwarded-host']||req.headers.host;
  return `${proto}://${host}`;
}

async function getJson(url){
  const r=await fetch(url,{headers:{'user-agent':'Mozilla/5.0 BTC Spot Monitor Daily Snapshot'},cache:'no-store'});
  let data=null;
  try{data=await r.json();}catch{data=null;}
  if(!r.ok) throw new Error(`${url} HTTP ${r.status}`);
  return data;
}

function statusFrom(results){
  const failed=results.filter(x=>!x.ok).map(x=>x.name);
  if(failed.length===0) return {status:'updated',label:'Atualizado',failed:[]};
  if(failed.length===results.length) return {status:'failed',label:'Falha geral',failed};
  return {status:'partial',label:'Parcial',failed};
}

function enrichEtfFlows(flows, btc){
  const btcPrice=Number(btc?.price||0) || null;
  if(!flows || !Array.isArray(flows.rows) || !btcPrice) return flows;
  const rows=flows.rows.map(r=>{
    const cum=Number(r.cumulativeFlowUsdM);
    const prev=Number(r.previousCumulativeFlowUsdM);
    return {
      ...r,
      btcSpotLast:Number.isFinite(cum) ? (cum*1000000)/btcPrice : null,
      btcSpotPrevious:Number.isFinite(prev) ? (prev*1000000)/btcPrice : null,
      btcSpotMethod:'estimated_from_cumulative_usd_flows_and_btc_price'
    };
  });
  return {...flows,rows};
}

function mergeCompanies(companies, btc){
  const btcPrice=Number(btc?.price||0) || null;
  const rows=(companies?.rows||[]).map(r=>({
    ...r,
    valueUsd: r.valueUsd ?? (btcPrice && r.btcHeld ? Number(r.btcHeld)*btcPrice : null)
  }));
  return {...companies,rows};
}

export default async function handler(req,res){
  setCors(res);
  if(req.method==='OPTIONS') return res.status(204).end();
  const base=absoluteBaseUrl(req);
  const endpoints={
    btc:`${base}/api/btc-price`,
    flows:`${base}/api/farside-btc`,
    companies:`${base}/api/public-companies`,
    overviewQuotes:`${base}/api/finnhub-batch?kind=overview`,
    etfQuotes:`${base}/api/finnhub-batch?kind=etfs`,
    companyQuotes:`${base}/api/finnhub-batch?kind=companies`
  };
  const entries=await Promise.all(Object.entries(endpoints).map(async([name,url])=>{
    try{return {name,ok:true,data:await getJson(url)}}
    catch(error){return {name,ok:false,error:error.message,data:null}}
  }));
  const map=Object.fromEntries(entries.map(e=>[e.name,e]));
  const status=statusFrom(entries);
  const btc=map.btc.data||{ok:false,price:null,source:'CoinGecko'};
  const flows=enrichEtfFlows(map.flows.data||{ok:false,summary:{latestDate:null,latestTotalFlow:null},rows:[],source:'Farside'},btc);
  const companies=mergeCompanies(map.companies.data||{ok:false,summary:{publicCompanies:null,totalBtc:null},rows:[],source:'BitcoinTreasuries'},btc);
  const payload={
    ok: status.status!=='failed',
    snapshotType:'daily-cached',
    generatedAt:new Date().toISOString(),
    timezone:'America/Campo_Grande',
    status,
    cache:{policy:'Vercel CDN',seconds:86400,staleWhileRevalidate:604800},
    sources:{
      btc:btc?.source||'CoinGecko',
      flows:flows?.source||'Farside',
      companies:companies?.source||'BitcoinTreasuries',
      quotes:'Finnhub'
    },
    data:{
      btc,
      flows,
      companies,
      overviewQuotes:map.overviewQuotes.data||{ok:false,quotes:[]},
      etfQuotes:map.etfQuotes.data||{ok:false,quotes:[]},
      companyQuotes:map.companyQuotes.data||{ok:false,quotes:[]}
    },
    errors:entries.filter(e=>!e.ok).map(e=>({source:e.name,error:e.error}))
  };
  res.setHeader('Cache-Control','public, s-maxage=86400, stale-while-revalidate=604800');
  return res.status(200).json(payload);
}
