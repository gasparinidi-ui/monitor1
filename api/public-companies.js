import * as cheerio from 'cheerio';
import { applyCompanyHistory } from './_company-history.js';

function setCors(res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
}

const COINGECKO_TREASURIES_URL='https://www.coingecko.com/en/treasuries/bitcoin/companies';
const TOP_LIMIT=30;
const FALLBACK_WARNING='CoinGecko live parse unavailable; returning bundled fallback seed. Treat company treasury values as stale until sourceMode is coingecko_live.';

const FALLBACK_TOP30=[
  {rank:1,ticker:'MSTR',company:'Strategy',btcHeld:818334,activity:'+51,364 BTC'},
  {rank:2,ticker:'XXI',company:'XXI',btcHeld:43514,activity:'-'},
  {rank:3,ticker:'3350.T',company:'Metaplanet',btcHeld:40177,activity:'-'},
  {rank:4,ticker:'MARA',company:'MARA Holdings',btcHeld:38689,activity:'-'},
  {rank:5,ticker:'CEPO',company:'Bitcoin Standard Treasury Company',btcHeld:30021,activity:'-'},
  {rank:6,ticker:'GLXY',company:'Galaxy Digital Holdings Ltd',btcHeld:25723,activity:'-'},
  {rank:7,ticker:'BLSH',company:'Bullish',btcHeld:23300,activity:'-'},
  {rank:8,ticker:'RIOT',company:'Riot Platforms',btcHeld:15680,activity:'-'},
  {rank:9,ticker:'COIN',company:'Coinbase Global',btcHeld:15389,activity:'-'},
  {rank:10,ticker:'ASST',company:'Strive',btcHeld:14556,activity:'+816 BTC'},
  {rank:11,ticker:'HUT',company:'Hut 8 Mining Corp',btcHeld:13696,activity:'-'},
  {rank:12,ticker:'CLSK',company:'CleanSpark',btcHeld:13363,activity:'-'},
  {rank:13,ticker:'TSLA',company:'Tesla',btcHeld:11509,activity:'-'},
  {rank:14,ticker:'DJT',company:'Trump Media & Technology Group Corp.',btcHeld:9542,activity:'-'},
  {rank:15,ticker:'XYZ',company:'Block',btcHeld:8997,activity:'+114 BTC'},
  {rank:16,ticker:'GDC',company:'GD Culture Group',btcHeld:7500,activity:'-'},
  {rank:17,ticker:'ABTC',company:'American Bitcoin',btcHeld:6235,activity:'-'},
  {rank:18,ticker:'NXTT',company:'Next Technology Holding',btcHeld:5833,activity:'-'},
  {rank:19,ticker:'BRR',company:'ProCap BTC',btcHeld:5457,activity:'-'},
  {rank:20,ticker:'NAKA',company:'Nakamoto Inc (formerly KindlyMD)',btcHeld:5058,activity:'-'},
  {rank:21,ticker:'GEMI',company:'Gemini Space Station',btcHeld:4827,activity:'-'},
  {rank:22,ticker:'434.HK',company:'Boyaa Interactive International Limited',btcHeld:4091,activity:'-'},
  {rank:23,ticker:'OBTC3.SA',company:'OranjeBTC',btcHeld:3727,activity:'+2 BTC'},
  {rank:24,ticker:'ADE.DE',company:'Bitcoin Group SE',btcHeld:3605,activity:'-'},
  {rank:25,ticker:'EMPD',company:'Empery Digital',btcHeld:2989,activity:'-'},
  {rank:26,ticker:'ALCPB.PA',company:'Capital B',btcHeld:2943,activity:'+55 BTC'},
  {rank:27,ticker:'SWC.AQ',company:'The Smarter Web Company PLC',btcHeld:2805,activity:'+110 BTC'},
  {rank:28,ticker:'DEFI.NE',company:'DeFi Technologies',btcHeld:2596,activity:'-'},
  {rank:29,ticker:'DDC',company:'DDC Enterprise Limited',btcHeld:2383,activity:'-'},
  {rank:30,ticker:'HOLO',company:'Microcloud Hologram',btcHeld:2353,activity:'-'}
];

function cleanNum(input){
  if(input==null) return null;
  let txt=String(input).replace(/[$,]/g,'').replace(/\s+/g,'').replace(/BTC/ig,'').trim();
  if(!txt||txt==='-'||txt==='–') return null;
  const mult=/m$/i.test(txt)?1_000_000:/k$/i.test(txt)?1_000:1;
  txt=txt.replace(/[mk]$/i,'').replace(/[^0-9.\-]/g,'');
  const n=Number(txt);
  return Number.isNaN(n)?null:n*mult;
}
function num(v){ const n=Number(v); return Number.isFinite(n)?n:null; }
function normalizeTicker(raw){
  const t=String(raw||'').trim().toUpperCase();
  if(t==='SQ') return 'XYZ';
  return t.replace(/\.US$/,'');
}
function parseCompanyLine(line){
  const cleaned=String(line||'').replace(/^\d+\s+/,'').trim();
  const parts=cleaned.split(/\s+/).filter(Boolean);
  const rawTicker=parts[parts.length-1]||'';
  if(!rawTicker || !/[A-Z0-9]/i.test(rawTicker)) return null;
  const ticker=normalizeTicker(rawTicker);
  const company=parts.slice(0,-1).join(' ').trim() || ticker;
  return {ticker,company};
}
function parseCoinGeckoText(html){
  const $=cheerio.load(html);
  const text=$('body').text();
  const lines=text.split(/\n+/).map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean);
  const rows=[];
  for(let i=0;i<lines.length;i++){
    const rankMatch=lines[i].match(/^(\d{1,3})\s+(.+\s+[A-Z0-9]{1,10}(?:\.[A-Z]{1,4})?)$/);
    if(!rankMatch) continue;
    const rank=Number(rankMatch[1]);
    if(!Number.isFinite(rank) || rank<1 || rank>TOP_LIMIT) continue;
    const parsed=parseCompanyLine(lines[i]);
    if(!parsed) continue;
    const activity=lines[i+1]||'-';
    const btcHeld=cleanNum(lines[i+2]);
    if(!btcHeld || btcHeld<100) continue;
    rows.push({rank,ticker:parsed.ticker,company:parsed.company,btcHeld,activity});
  }
  const byRank=new Map();
  for(const r of rows){ if(!byRank.has(r.rank)) byRank.set(r.rank,r); }
  return [...byRank.values()].sort((a,b)=>a.rank-b.rank).slice(0,TOP_LIMIT);
}
function parseSummary(html){
  const $=cheerio.load(html);
  const pageText=$.text().replace(/\s+/g,' ');
  const tracked=pageText.match(/CoinGecko tracks\s+([\d,]+)\s+companies/i);
  const total=pageText.match(/total holding of\s+([\d,]+)\s+BTC/i);
  return {
    publicCompanies: tracked ? cleanNum(tracked[1]) : null,
    totalBtc: total ? cleanNum(total[1]) : null,
    latestDate: new Date().toISOString().slice(0,10),
    displayedCompanies: TOP_LIMIT,
    sourceName: 'CoinGecko Bitcoin Treasury Companies',
    sourceUrl: COINGECKO_TREASURIES_URL
  };
}
async function getBtcPrice(){
  try{
    const r=await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd',{headers:{'user-agent':'BTC Spot Monitor'}});
    if(!r.ok) return null;
    const j=await r.json();
    return j?.bitcoin?.usd ?? null;
  }catch{return null;}
}
function buildRows(baseRows, btcPrice, date){
  return (baseRows||[])
    .filter(r=>r && r.ticker && num(r.btcHeld)!==null)
    .sort((a,b)=>(num(b.btcHeld)||0)-(num(a.btcHeld)||0))
    .slice(0,TOP_LIMIT)
    .map((r,idx)=>({
      rank:r.rank||idx+1,
      company:r.company,
      ticker:r.ticker,
      bucket:'Top 30 public companies by BTC treasury',
      btcHeld:num(r.btcHeld),
      valueUsd: btcPrice ? num(r.btcHeld)*btcPrice : null,
      activity30d:r.activity||null,
      lastDisclosureDate:date,
      officialSource:COINGECKO_TREASURIES_URL
    }));
}
export default async function handler(req,res){
  setCors(res);
  if(req.method==='OPTIONS') return res.status(204).end();
  try{
    let summary={publicCompanies:174,totalBtc:1229927,latestDate:new Date().toISOString().slice(0,10),displayedCompanies:TOP_LIMIT,sourceName:'CoinGecko Bitcoin Treasury Companies',sourceUrl:COINGECKO_TREASURIES_URL};
    let baseRows=FALLBACK_TOP30;
    let sourceMode='fallback_seed';
    let liveWarning=FALLBACK_WARNING;
    try{
      const response=await fetch(COINGECKO_TREASURIES_URL,{headers:{'user-agent':'Mozilla/5.0 BTC Spot Monitor'}});
      if(response.ok){
        const html=await response.text();
        const parsed=parseCoinGeckoText(html);
        const parsedSummary=parseSummary(html);
        summary={...summary,...Object.fromEntries(Object.entries(parsedSummary).filter(([,v])=>v!=null))};
        if(parsed.length>=20){
          baseRows=parsed;
          sourceMode='coingecko_live';
          liveWarning=null;
        } else {
          liveWarning=`${FALLBACK_WARNING} Parsed only ${parsed.length} live rows.`;
        }
      } else {
        liveWarning=`${FALLBACK_WARNING} CoinGecko HTTP ${response.status}.`;
      }
    }catch(e){
      liveWarning=`${FALLBACK_WARNING} ${e.message}`;
      console.warn('CoinGecko parse fallback:', e.message);
    }
    const btcPrice=await getBtcPrice();
    const rows=buildRows(baseRows, btcPrice, summary.latestDate);
    const hist=await applyCompanyHistory(rows, summary.latestDate || new Date().toISOString().slice(0,10));
    const finalRows=(hist.rows||[]).sort((a,b)=>(num(b.btcHeld)||0)-(num(a.btcHeld)||0)).slice(0,TOP_LIMIT).map((r,idx)=>({
      ...r,
      rank:idx+1,
      officialSource:r.officialSource||COINGECKO_TREASURIES_URL
    }));
    res.setHeader('Cache-Control',sourceMode==='coingecko_live' ? 'public, s-maxage=86400, stale-while-revalidate=604800' : 'public, s-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).json({
      ok:sourceMode==='coingecko_live',
      stale:sourceMode!=='coingecko_live',
      warning:liveWarning || undefined,
      summary,
      rows:finalRows,
      historyMeta:hist.historyMeta,
      source:`${summary.sourceName} + historico persistente`,
      sourceMode
    });
  }catch(error){
    const date=new Date().toISOString().slice(0,10);
    const btcPrice=await getBtcPrice();
    const rows=buildRows(FALLBACK_TOP30, btcPrice, date);
    const hist=await applyCompanyHistory(rows, date);
    res.setHeader('Cache-Control','public, s-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).json({
      ok:false,
      stale:true,
      warning:`${FALLBACK_WARNING} ${error.message}`,
      summary:{publicCompanies:174,totalBtc:1229927,latestDate:date,displayedCompanies:TOP_LIMIT,sourceName:'CoinGecko fallback seed',sourceUrl:COINGECKO_TREASURIES_URL},
      rows:hist.rows,
      historyMeta:hist.historyMeta,
      source:'CoinGecko fallback seed + historico persistente',
      sourceMode:'fallback_seed'
    });
  }
}
