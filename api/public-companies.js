import * as cheerio from 'cheerio';
function setCors(res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
}
const WATCHLIST=['MSTR','MARA','TSLA','COIN','HUT','RIOT','CLSK','SQ'];
const FALLBACK_COMPANY_NAMES={
  MSTR:'Strategy',MARA:'MARA Holdings',TSLA:'Tesla',COIN:'Coinbase',HUT:'Hut 8',RIOT:'Riot Platforms',CLSK:'CleanSpark',SQ:'Block'
};
function cleanNum(input){
  if(input==null)return null;
  let txt=String(input).replace(/[$,]/g,'').replace(/\s+/g,'').replace(/BTC/ig,'').trim();
  if(!txt||txt==='-'||txt==='–')return null;
  const mult=/m$/i.test(txt)?1_000_000:/k$/i.test(txt)?1_000:1;
  txt=txt.replace(/[mk]$/i,'').replace(/[^0-9.\-]/g,'');
  const n=Number(txt);
  return Number.isNaN(n)?null:n*mult;
}
function looksTicker(x){
  const s=String(x||'').trim().toUpperCase().replace(/[^A-Z.]/g,'');
  if(WATCHLIST.includes(s)) return true;
  if(!/^[A-Z.]{1,6}$/.test(s)) return false;
  return !['US','CA','JP','CN','GB','HK','DE','FR','NL','SG','BR','IL','KY','INC','LTD','PLC','THE'].includes(s);
}
function extractRow(cells){
  const clean=cells.map(x=>String(x||'').replace(/\s+/g,' ').trim()).filter(Boolean);
  if(clean.length<3) return null;
  let idx=0;
  if(/^\d+$/.test(clean[0])) idx=1;
  const company=clean[idx]||clean[0];
  const tickerCell=clean.find(c=>WATCHLIST.includes(String(c||'').trim().toUpperCase().replace(/[^A-Z.]/g,''))) || clean.find(looksTicker) || null;
  const ticker=tickerCell ? tickerCell.split(':').pop().replace(/[^A-Z.]/gi,'').toUpperCase() : null;
  const dataCells=clean.slice(Math.min(idx+1,clean.length));
  const nums=dataCells.map(cleanNum).filter(v=>v!=null && v>0);
  const btcCandidates=nums.filter(v=>v>=10 && v<5000000);
  const btcHeld=btcCandidates.length ? Math.max(...btcCandidates) : null;
  const valueUsd=nums.find(v=>v>=1000000 && v!==btcHeld) ?? null;
  if(!company||/^\d+$/.test(company)) return null;
  return {company,ticker,btcHeld,valueUsd,lastDisclosureDate:new Date().toISOString().slice(0,10)};
}
export default async function handler(req,res){
  setCors(res);
  if(req.method==='OPTIONS') return res.status(204).end();
  try{
    const response=await fetch('https://bitcointreasuries.net/',{headers:{'user-agent':'Mozilla/5.0 BTC Spot Monitor'}});
    if(!response.ok) throw new Error(`BitcoinTreasuries HTTP ${response.status}`);
    const html=await response.text();
    const $=cheerio.load(html);
    const pageText=$.text().replace(/\s+/g,' ');
    const publicCompaniesMatch=pageText.match(/Number of Public Companies\s+([\d.,]+)/i);
    const totalBtcMatch=pageText.match(/BTC Held by Public Companies\s+([\d.,]+\s*[MK]?)/i);
    const rows=[];
    $('table tr').each((_,tr)=>{
      const cells=[];
      $(tr).find('th,td').each((__,td)=>cells.push($(td).text().trim()));
      const parsed=extractRow(cells);
      if(parsed && parsed.company && !rows.some(r=>r.company===parsed.company&&r.ticker===parsed.ticker)) rows.push(parsed);
    });
    for(const t of WATCHLIST){
      if(!rows.some(r=>(r.ticker||'').toUpperCase()===t)) rows.push({company:FALLBACK_COMPANY_NAMES[t]||t,ticker:t,btcHeld:null,valueUsd:null,lastDisclosureDate:null});
    }
    rows.sort((a,b)=>((Number(b.btcHeld)||-1)-(Number(a.btcHeld)||-1)));
    const totalBtc=totalBtcMatch?totalBtcMatch[1].replace(/\s+/g,''):null;
    const publicCompanies=publicCompaniesMatch?cleanNum(publicCompaniesMatch[1]):(rows.length||null);
    res.setHeader('Cache-Control','public, s-maxage=86400, stale-while-revalidate=604800');
    return res.status(200).json({ok:true,summary:{publicCompanies,totalBtc,latestDate:new Date().toISOString().slice(0,10)},rows,source:'BitcoinTreasuries'});
  }catch(error){
    return res.status(200).json({ok:false,error:error.message,summary:{publicCompanies:null,totalBtc:null,latestDate:null},rows:[],source:'BitcoinTreasuries'});
  }
}
