import * as cheerio from 'cheerio';
function setCors(res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
}
const WATCHLIST=['MSTR','MARA','TSLA','COIN','HUT','RIOT','CLSK','SQ'];
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
  const s=String(x||'').trim().toUpperCase();
  if(WATCHLIST.includes(s)) return true;
  return /^[A-Z.:-]{1,8}$/.test(s) && !['US','CA','JP','CN','GB','HK','DE','FR','NL','SG','BR','IL','KY'].includes(s);
}
function extractRow(cells){
  const clean=cells.map(x=>String(x||'').replace(/\s+/g,' ').trim()).filter(Boolean);
  if(clean.length<3) return null;
  let company=clean[0];
  if(/^\d+$/.test(company)) company=clean[1]||company;
  const tickerCell=clean.find(looksTicker) || null;
  const ticker=tickerCell ? tickerCell.split(':').pop().replace(/[^A-Z.]/gi,'').toUpperCase() : null;
  const nums=clean.map(cleanNum).filter(v=>v!=null);
  const btcHeld=nums.find(v=>v>0 && v<1000000) ?? null;
  const valueUsd=nums.find(v=>v>1000000) ?? null;
  if(!company||/^\d+$/.test(company)) return null;
  return {company,ticker,btcHeld,valueUsd};
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
    const totalBtc=totalBtcMatch?totalBtcMatch[1].replace(/\s+/g,''):null;
    const publicCompanies=publicCompaniesMatch?cleanNum(publicCompaniesMatch[1]):(rows.length||null);
    res.setHeader('Cache-Control','public, s-maxage=86400, stale-while-revalidate=604800');
    return res.status(200).json({ok:true,summary:{publicCompanies,totalBtc},rows,source:'BitcoinTreasuries'});
  }catch(error){
    return res.status(200).json({ok:false,error:error.message,summary:{publicCompanies:null,totalBtc:null},rows:[],source:'BitcoinTreasuries'});
  }
}
