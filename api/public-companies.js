import * as cheerio from 'cheerio';
function setCors(res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
}
const WATCHLIST=['MSTR','MARA','TSLA','COIN','HUT','RIOT','CLSK','SQ'];
const CURATED={
  MSTR:{company:'Strategy',btcHeld:815061},
  MARA:{company:'MARA Holdings',btcHeld:38689},
  TSLA:{company:'Tesla',btcHeld:11509},
  COIN:{company:'Coinbase',btcHeld:15389},
  HUT:{company:'Hut 8',btcHeld:13696},
  RIOT:{company:'Riot Platforms',btcHeld:15680},
  CLSK:{company:'CleanSpark',btcHeld:13363},
  SQ:{company:'Block',btcHeld:8883}
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
function normalizeName(v){ return String(v||'').toLowerCase().replace(/[^a-z0-9]/g,''); }
function extractRow(cells){
  const clean=cells.map(x=>String(x||'').replace(/\s+/g,' ').trim()).filter(Boolean);
  if(clean.length<3) return null;
  const joined=clean.join(' | ');
  let ticker=null;
  for(const t of WATCHLIST){
    const re=new RegExp(`(^|[^A-Z])${t}([^A-Z]|$)`,'i');
    if(re.test(joined)){ ticker=t; break; }
  }
  if(!ticker){
    const nj=normalizeName(joined);
    for(const [t,info] of Object.entries(CURATED)){
      if(nj.includes(normalizeName(info.company).slice(0,8))){ ticker=t; break; }
    }
  }
  if(!ticker) return null;
  const nums=clean.map(cleanNum).filter(v=>v!=null && v>0);
  const btcCandidates=nums.filter(v=>v>=1000 && v<2000000);
  const btcHeld=btcCandidates.length ? Math.max(...btcCandidates) : null;
  const valueUsd=nums.find(v=>v>=1000000 && v!==btcHeld) ?? null;
  return {company:CURATED[ticker].company,ticker,btcHeld,valueUsd,lastDisclosureDate:new Date().toISOString().slice(0,10)};
}
async function getBtcPrice(){
  try{
    const r=await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd',{headers:{'user-agent':'BTC Spot Monitor'}});
    if(!r.ok) return null;
    const j=await r.json();
    return j?.bitcoin?.usd ?? null;
  }catch{return null;}
}
export default async function handler(req,res){
  setCors(res);
  if(req.method==='OPTIONS') return res.status(204).end();
  try{
    let parsed=[];
    let summary={publicCompanies:196,totalBtc:'1.213M',latestDate:new Date().toISOString().slice(0,10)};
    try{
      const response=await fetch('https://bitcointreasuries.net/',{headers:{'user-agent':'Mozilla/5.0 BTC Spot Monitor'}});
      if(response.ok){
        const html=await response.text();
        const $=cheerio.load(html);
        const pageText=$.text().replace(/\s+/g,' ');
        const publicCompaniesMatch=pageText.match(/Number of Public Companies\s+([\d.,]+)/i);
        const totalBtcMatch=pageText.match(/BTC Held by Public Companies\s+([\d.,]+\s*[MK]?)/i);
        if(publicCompaniesMatch) summary.publicCompanies=cleanNum(publicCompaniesMatch[1])||summary.publicCompanies;
        if(totalBtcMatch) summary.totalBtc=totalBtcMatch[1].replace(/\s+/g,'');
        $('table tr').each((_,tr)=>{
          const cells=[];
          $(tr).find('th,td').each((__,td)=>cells.push($(td).text().trim()));
          const row=extractRow(cells);
          if(row) parsed.push(row);
        });
      }
    }catch(e){ console.warn('BitcoinTreasuries parse fallback:', e.message); }
    const btcPrice=await getBtcPrice();
    const byTicker=new Map();
    for(const row of parsed){
      if(!byTicker.has(row.ticker) || (row.btcHeld||0)>(byTicker.get(row.ticker).btcHeld||0)) byTicker.set(row.ticker,row);
    }
    const rows=WATCHLIST.map(t=>{
      const live=byTicker.get(t)||{};
      const btcHeld=live.btcHeld ?? CURATED[t].btcHeld;
      const valueUsd=live.valueUsd ?? (btcPrice && btcHeld ? btcHeld*btcPrice : null);
      return {company:CURATED[t].company,ticker:t,btcHeld,valueUsd,lastDisclosureDate:live.lastDisclosureDate||summary.latestDate};
    }).sort((a,b)=>(Number(b.btcHeld)||0)-(Number(a.btcHeld)||0));
    res.setHeader('Cache-Control','public, s-maxage=86400, stale-while-revalidate=604800');
    return res.status(200).json({ok:true,summary,rows,source:'BitcoinTreasuries + watchlist controlada'});
  }catch(error){
    return res.status(200).json({ok:false,error:error.message,summary:{publicCompanies:null,totalBtc:null,latestDate:null},rows:[],source:'BitcoinTreasuries'});
  }
}
