import * as cheerio from 'cheerio';
import { applyCompanyHistory } from './_company-history.js';

function setCors(res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
}

const COINGECKO_TREASURIES_URL='https://www.coingecko.com/en/treasuries/bitcoin/companies';
const COINGECKO_TREASURIES_API='https://api.coingecko.com/api/v3/companies/public_treasury/bitcoin?per_page=250&page=1';
const TOP_LIMIT=30;
const FALLBACK_WARNING='CoinGecko treasury data unavailable; returning bundled fallback seed. Treat company treasury values as stale until sourceMode is coingecko_page or coingecko_api.';

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
  let txt=String(input).replace(/[$,]/g,'').replace(/\s+/g,'').replace(/BTC|USD/ig,'').trim();
  if(!txt||txt==='-'||txt==='--'||txt==='–') return null;
  const mult=/m$/i.test(txt)?1_000_000:/k$/i.test(txt)?1_000:1;
  txt=txt.replace(/[mk]$/i,'').replace(/[^0-9.\-+]/g,'');
  const n=Number(txt);
  return Number.isNaN(n)?null:n*mult;
}
function num(v){ const n=Number(v); return Number.isFinite(n)?n:null; }
function normalizeTicker(raw){
  const t=String(raw||'').trim().toUpperCase();
  if(t==='SQ') return 'XYZ';
  return t.replace(/\.US$/,'');
}
function stripCountryPrefix(text){
  return String(text||'')
    .replace(/[\u{1F1E6}-\u{1F1FF}]/gu,'')
    .replace(/^(US|JP|CN|CA|HK|GB|FR|DE|AU|BR|SE|NL|SG)\s+/i,'')
    .trim();
}
function parseCompanyCell(cell){
  const clean=stripCountryPrefix(String(cell||'').replace(/\s+/g,' '));
  const match=clean.match(/(.+?)\s+([A-Z0-9]{1,12}(?:\.[A-Z]{1,4})?)$/);
  if(!match) return null;
  return {company:match[1].trim(), ticker:normalizeTicker(match[2])};
}
function parseActivity(text){
  const n=cleanNum(text);
  return n===null ? null : n;
}
function activityText(value){
  if(value===null || value===undefined) return '-';
  const prefix=Number(value)>0?'+':'';
  return `${prefix}${Number(value).toLocaleString('en-US')} BTC`;
}
function previousFromActivity(current, activity){
  const c=num(current), a=num(activity);
  if(c===null || a===null) return null;
  return c-a;
}
function parseSummaryFromPage($){
  const pageText=$.text().replace(/\s+/g,' ');
  const tracked=pageText.match(/([\d,]+)\s+Total Companies/i) || pageText.match(/CoinGecko tracks\s+([\d,]+)\s+companies/i);
  const total=pageText.match(/([\d,]+)\s+Total BTC Holdings/i) || pageText.match(/total holding of\s+([\d,]+)\s+BTC/i);
  return {
    publicCompanies:tracked ? cleanNum(tracked[1]) : null,
    totalBtc:total ? cleanNum(total[1]) : null,
    latestDate:new Date().toISOString().slice(0,10),
    displayedCompanies:TOP_LIMIT,
    sourceName:'CoinGecko Bitcoin Treasury Companies',
    sourceUrl:COINGECKO_TREASURIES_URL
  };
}
function parseRowsFromTables($){
  const rows=[];
  $('tr').each((_,tr)=>{
    const cells=[];
    $(tr).find('th,td').each((__,td)=>cells.push($(td).text().replace(/\s+/g,' ').trim()));
    if(cells.length<4) return;
    const rank=cleanNum(cells[0]);
    if(rank===null || rank<1 || rank>250) return;
    const parsed=parseCompanyCell(cells[1]);
    if(!parsed) return;
    const activity=parseActivity(cells[2]);
    const btcHeld=cleanNum(cells[3]);
    if(btcHeld===null || btcHeld<100) return;
    rows.push({
      rank,
      ...parsed,
      btcHeld,
      activity,
      activity30d:activityText(activity),
      valueUsd:cleanNum(cells[5]),
      sourceMode:'coingecko_page'
    });
  });
  return rows;
}
function parseRowsFromText($){
  const text=$('body').text().replace(/\s+/g,' ');
  const rows=[];
  const rowRegex=/(\d{1,3})\s+([A-Z]{2}\s+)?(.+?)\s+([A-Z0-9]{1,12}(?:\.[A-Z]{1,4})?)\s+([+-][\d,]+\s+BTC|-)\s+([\d,]+)/g;
  let match;
  while((match=rowRegex.exec(text))){
    const rank=Number(match[1]);
    if(!Number.isFinite(rank) || rank<1 || rank>250) continue;
    const ticker=normalizeTicker(match[4]);
    const btcHeld=cleanNum(match[6]);
    if(btcHeld===null || btcHeld<100) continue;
    const activity=parseActivity(match[5]);
    rows.push({
      rank,
      company:stripCountryPrefix(match[3]),
      ticker,
      btcHeld,
      activity,
      activity30d:activityText(activity),
      sourceMode:'coingecko_page'
    });
  }
  return rows;
}
function dedupeRows(rows){
  const byTicker=new Map();
  for(const row of rows||[]){
    const key=normalizeTicker(row.ticker);
    if(!byTicker.has(key)) byTicker.set(key,row);
  }
  return [...byTicker.values()].sort((a,b)=>(num(b.btcHeld)||0)-(num(a.btcHeld)||0));
}
async function fetchCoinGeckoPage(){
  const response=await fetch(COINGECKO_TREASURIES_URL,{headers:{'user-agent':'Mozilla/5.0 BTC Spot Monitor CoinGecko Treasury'},cache:'no-store'});
  if(!response.ok) throw new Error(`CoinGecko page HTTP ${response.status}`);
  const html=await response.text();
  const $=cheerio.load(html);
  const summary=parseSummaryFromPage($);
  const rows=dedupeRows([...parseRowsFromTables($),...parseRowsFromText($)]);
  return {summary,rows};
}
async function fetchCoinGeckoApi(){
  const key=process.env.COINGECKO_API_KEY || process.env.CG_DEMO_API_KEY || process.env.X_CG_DEMO_API_KEY;
  const headers={'user-agent':'BTC Spot Monitor CoinGecko Treasury API'};
  if(key) headers['x-cg-demo-api-key']=key;
  const response=await fetch(COINGECKO_TREASURIES_API,{headers,cache:'no-store'});
  if(!response.ok) throw new Error(`CoinGecko treasury API HTTP ${response.status}`);
  const data=await response.json();
  const companies=Array.isArray(data?.companies) ? data.companies : [];
  const rows=companies.map((c,idx)=>({
    rank:idx+1,
    company:c.name,
    ticker:normalizeTicker(c.symbol),
    btcHeld:num(c.total_holdings),
    valueUsd:num(c.total_current_value_usd),
    sourceMode:'coingecko_api'
  })).filter(r=>r.company && r.ticker && r.btcHeld!==null);
  return {
    summary:{
      publicCompanies:rows.length||null,
      totalBtc:num(data?.total_holdings),
      totalValueUsd:num(data?.total_value_usd),
      latestDate:new Date().toISOString().slice(0,10),
      displayedCompanies:TOP_LIMIT,
      sourceName:'CoinGecko Public Treasury API',
      sourceUrl:COINGECKO_TREASURIES_URL
    },
    rows
  };
}
async function getBtcPrice(){
  try{
    const r=await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd',{headers:{'user-agent':'BTC Spot Monitor'},cache:'no-store'});
    if(!r.ok) return null;
    const j=await r.json();
    return j?.bitcoin?.usd ?? null;
  }catch{return null;}
}
function mergeApiAndPage(apiRows, pageRows){
  const pageByTicker=new Map((pageRows||[]).map(r=>[normalizeTicker(r.ticker),r]));
  return (apiRows||[]).map(row=>{
    const page=pageByTicker.get(normalizeTicker(row.ticker));
    if(!page) return row;
    return {
      ...row,
      rank:page.rank||row.rank,
      company:page.company||row.company,
      activity:page.activity,
      activity30d:page.activity30d,
      sourceMode:'coingecko_api+page_activity'
    };
  });
}
function rowsWithDerivedPrevious(rows, date){
  return (rows||[]).map(row=>{
    const previousBtcHeld=previousFromActivity(row.btcHeld,row.activity);
    return {
      ...row,
      previousBtcHeld,
      previousDisclosureDate:previousBtcHeld!==null ? '30d' : null,
      lastDisclosureDate:date,
      activity30d:row.activity30d || activityText(row.activity),
      officialSource:COINGECKO_TREASURIES_URL
    };
  });
}
function buildRows(baseRows, btcPrice, date){
  return rowsWithDerivedPrevious(baseRows,date)
    .filter(r=>r && r.ticker && num(r.btcHeld)!==null)
    .sort((a,b)=>(num(b.btcHeld)||0)-(num(a.btcHeld)||0))
    .slice(0,TOP_LIMIT)
    .map((r,idx)=>({
      rank:r.rank||idx+1,
      company:r.company,
      ticker:r.ticker,
      bucket:'Top 30 public companies by BTC treasury',
      btcHeld:num(r.btcHeld),
      valueUsd:num(r.valueUsd) ?? (btcPrice ? num(r.btcHeld)*btcPrice : null),
      activity30d:r.activity30d||null,
      lastDisclosureDate:r.lastDisclosureDate||date,
      previousBtcHeld:num(r.previousBtcHeld),
      previousDisclosureDate:r.previousDisclosureDate||null,
      officialSource:r.officialSource||COINGECKO_TREASURIES_URL
    }));
}
async function loadCoinGeckoTreasury(){
  const pageResult=await fetchCoinGeckoPage();
  let apiResult=null;
  try{ apiResult=await fetchCoinGeckoApi(); }
  catch(e){ console.warn('CoinGecko API unavailable, using page table:', e.message); }
  if(apiResult?.rows?.length>=20){
    return {
      summary:{...pageResult.summary,...Object.fromEntries(Object.entries(apiResult.summary).filter(([,v])=>v!=null)),sourceName:'CoinGecko Public Treasury API + page activity'},
      rows:mergeApiAndPage(apiResult.rows,pageResult.rows),
      sourceMode:'coingecko_api'
    };
  }
  if(pageResult.rows.length>=20) return {...pageResult,sourceMode:'coingecko_page'};
  throw new Error(`CoinGecko page parse returned only ${pageResult.rows.length} rows`);
}
export default async function handler(req,res){
  setCors(res);
  if(req.method==='OPTIONS') return res.status(204).end();
  try{
    let summary={publicCompanies:174,totalBtc:null,latestDate:new Date().toISOString().slice(0,10),displayedCompanies:TOP_LIMIT,sourceName:'CoinGecko Bitcoin Treasury Companies',sourceUrl:COINGECKO_TREASURIES_URL};
    let baseRows=FALLBACK_TOP30;
    let sourceMode='fallback_seed';
    let warning=FALLBACK_WARNING;
    try{
      const live=await loadCoinGeckoTreasury();
      summary={...summary,...Object.fromEntries(Object.entries(live.summary||{}).filter(([,v])=>v!=null))};
      baseRows=live.rows;
      sourceMode=live.sourceMode;
      warning=null;
    }catch(e){
      console.warn('CoinGecko treasury fallback:', e.message);
      warning=`${FALLBACK_WARNING} ${e.message}`;
      summary.totalBtc=FALLBACK_TOP30.reduce((acc,r)=>acc+(num(r.btcHeld)||0),0);
    }
    const btcPrice=await getBtcPrice();
    const rows=buildRows(baseRows, btcPrice, summary.latestDate);
    if(num(summary.totalBtc)===null) summary.totalBtc=rows.reduce((acc,r)=>acc+(num(r.btcHeld)||0),0);
    const hist=await applyCompanyHistory(rows, summary.latestDate || new Date().toISOString().slice(0,10));
    const finalRows=(hist.rows||[]).sort((a,b)=>(num(b.btcHeld)||0)-(num(a.btcHeld)||0)).slice(0,TOP_LIMIT).map((r,idx)=>({
      ...r,
      rank:idx+1,
      officialSource:r.officialSource||COINGECKO_TREASURIES_URL
    }));
    res.setHeader('Cache-Control',sourceMode==='fallback_seed'?'public, s-maxage=3600, stale-while-revalidate=86400':'public, s-maxage=300, stale-while-revalidate=3600');
    return res.status(200).json({
      ok:sourceMode!=='fallback_seed',
      stale:sourceMode==='fallback_seed',
      warning:warning||undefined,
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
      summary:{publicCompanies:174,totalBtc:rows.reduce((acc,r)=>acc+(num(r.btcHeld)||0),0),latestDate:date,displayedCompanies:TOP_LIMIT,sourceName:'CoinGecko fallback seed',sourceUrl:COINGECKO_TREASURIES_URL},
      rows:hist.rows,
      historyMeta:hist.historyMeta,
      source:'CoinGecko fallback seed + historico persistente',
      sourceMode:'fallback_seed'
    });
  }
}
