import * as cheerio from 'cheerio';
function setCors(res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
}
const ETF_MAP={
  IBIT:'BlackRock',FBTC:'Fidelity',BITB:'Bitwise',ARKB:'ARK 21Shares',BTCO:'Invesco Galaxy',EZBC:'Franklin Templeton',
  BRRR:'Valkyrie',HODL:'VanEck',BTCW:'WisdomTree',MSBT:'Monarch / MarketVector',GBTC:'Grayscale',BTC:'Grayscale Mini'
};
const KNOWN_ORDER=['IBIT','FBTC','BITB','ARKB','BTCO','EZBC','BRRR','HODL','BTCW','MSBT','GBTC','BTC'];
const KNOWN=KNOWN_ORDER;
function toNumber(input){
  if(input==null)return null;
  let clean=String(input).replace(/[$,]/g,'').replace(/\u2212/g,'-').replace(/\(([^)]+)\)/,'-$1').trim();
  if(!clean||/^N\/?A$/i.test(clean)||clean==='-'||clean==='–')return null;
  clean=clean.replace(/[^0-9.\-]/g,'');
  if(!clean||clean==='-')return null;
  const val=Number(clean);
  return Number.isNaN(val)?null:val;
}
function isDateCell(x){return /\b\d{1,2}\s+[A-Za-z]{3}\s+\d{4}\b/.test(String(x||''));}
function parseRows($,target){
  const rows=[];
  $(target).find('tr').each((_,tr)=>{
    const cells=[];
    $(tr).find('th,td').each((__,td)=>cells.push($(td).text().replace(/\s+/g,' ').trim()));
    if(cells.length) rows.push(cells);
  });
  return rows;
}
function findHeader(rows){
  return rows.find(r=>KNOWN.some(t=>r.map(x=>String(x).toUpperCase().replace(/[^A-Z0-9]/g,'')).includes(t)) && r.length>=5) || [];
}
function mapHeader(header){
  const fallback={};
  KNOWN_ORDER.forEach((t,i)=>{fallback[t]=i+1;});
  fallback.TOTAL=KNOWN_ORDER.length+1;
  if(!header || header.length<5) return fallback;
  const norm=header.map(h=>String(h||'').toUpperCase().replace(/[^A-Z0-9]/g,''));
  if(!/DATE|DATA/.test(norm[0]||'')) return fallback;
  const mapped={};
  KNOWN_ORDER.forEach(t=>{
    const idx=norm.indexOf(t);
    if(idx>=0) mapped[t]=idx;
  });
  const totalIdx=norm.findIndex(x=>/TOTAL/.test(x));
  if(totalIdx>=0) mapped.TOTAL=totalIdx;
  return Object.keys(mapped).length>=6 ? {...fallback,...mapped} : fallback;
}
function parseFarsideDate(x){
  const m=String(x||'').match(/(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/);
  if(!m) return 0;
  const months={jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11};
  const mo=months[m[2].toLowerCase()];
  if(mo==null) return 0;
  return Date.UTC(Number(m[3]),mo,Number(m[1]));
}
function sumThrough(rows,headerMap,ticker,endIdx){
  let total=0;
  let has=false;
  for(let i=0;i<=endIdx;i++){
    const v=toNumber(rows[i]?.[headerMap[ticker]]);
    if(v!=null){ total+=v; has=true; }
  }
  return has ? total : null;
}
export default async function handler(req,res){
  setCors(res);
  if(req.method==='OPTIONS') return res.status(204).end();
  try{
    const response=await fetch('https://farside.co.uk/btc/',{headers:{'user-agent':'Mozilla/5.0 BTC Spot Monitor'}});
    if(!response.ok) throw new Error(`Farside HTTP ${response.status}`);
    const html=await response.text();
    const $=cheerio.load(html);
    let target=null;
    $('table').each((_,table)=>{
      const text=$(table).text().toLowerCase();
      if(text.includes('ibit')&&text.includes('fbtc')&&text.includes('gbtc')) target=table;
    });
    if(!target) return res.status(200).json({ok:false,summary:{latestDate:null,previousDate:null,latestTotalFlow:null,previousTotalFlow:null},rows:[],warning:'Tabela principal da Farside não encontrada.',source:'Farside'});
    const allRows=parseRows($,target);
    const header=findHeader(allRows);
    const headerMap=mapHeader(header);
    const dataRows=allRows.filter(r=>isDateCell(r[0])).sort((a,b)=>parseFarsideDate(a[0])-parseFarsideDate(b[0]));
    const latestIdx=dataRows.length-1;
    const previousIdx=dataRows.length-2;
    const latest=dataRows[latestIdx]||[];
    const previous=dataRows[previousIdx]||[];
    const date=latest[0]||null;
    const previousDate=previous[0]||null;
    const rows=KNOWN.map(t=>{
      const cumulativeFlowUsdM=sumThrough(dataRows,headerMap,t,latestIdx);
      const previousCumulativeFlowUsdM=previousIdx>=0?sumThrough(dataRows,headerMap,t,previousIdx):null;
      return {
        ticker:t,
        issuer:ETF_MAP[t],
        date,
        previousDate,
        flow:toNumber(latest[headerMap[t]]),
        previousFlow:toNumber(previous[headerMap[t]]),
        cumulativeFlowUsdM,
        previousCumulativeFlowUsdM,
        btcSpotLast:null,
        btcSpotPrevious:null,
        btcSpotMethod:'estimated_from_cumulative_usd_flows',
        aum:null
      };
    });
    const latestTotalFlow=toNumber(latest[headerMap.TOTAL]);
    const previousTotalFlow=toNumber(previous[headerMap.TOTAL]);
    res.setHeader('Cache-Control','public, s-maxage=86400, stale-while-revalidate=604800');
    return res.status(200).json({ok:true,summary:{latestDate:date,previousDate,latestTotalFlow,previousTotalFlow},rows,source:'Farside'});
  }catch(error){
    return res.status(200).json({ok:false,error:error.message,rows:[],summary:{latestDate:null,previousDate:null,latestTotalFlow:null,previousTotalFlow:null},source:'Farside'});
  }
}
