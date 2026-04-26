import * as cheerio from 'cheerio';
function setCors(res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
}
const ETF_MAP={
  IBIT:'BlackRock',FBTC:'Fidelity',BITB:'Bitwise',ARKB:'ARK 21Shares',BTCO:'Invesco Galaxy',EZBC:'Franklin Templeton',
  BRRR:'Valkyrie',HODL:'VanEck',BTCW:'WisdomTree',GBTC:'Grayscale',BTC:'Grayscale Mini'
};
const KNOWN=Object.keys(ETF_MAP);
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
  return rows.find(r=>KNOWN.some(t=>r.map(x=>String(x).toUpperCase()).includes(t)) && r.length>=5) || [];
}
function mapHeader(header){
  const map={};
  header.forEach((h,i)=>{
    const up=String(h||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
    if(KNOWN.includes(up)) map[up]=i;
    if(/TOTAL/.test(up)) map.TOTAL=i;
  });
  if(Object.keys(map).length<3){
    // Farside historical table often follows Date + tickers + Total.
    KNOWN.forEach((t,i)=>{map[t]=i+1;});
    map.TOTAL=KNOWN.length+1;
  }
  return map;
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
    if(!target) return res.status(200).json({ok:false,summary:{latestDate:null,latestTotalFlow:null},rows:[],warning:'Tabela principal da Farside não encontrada.',source:'Farside'});
    const allRows=parseRows($,target);
    const header=findHeader(allRows);
    const headerMap=mapHeader(header);
    const dataRows=allRows.filter(r=>isDateCell(r[0]));
    const latest=dataRows[0]||[];
    const date=latest[0]||null;
    const rows=KNOWN.map(t=>({ticker:t,issuer:ETF_MAP[t],date,flow:toNumber(latest[headerMap[t]]),aum:null}));
    const latestTotalFlow=toNumber(latest[headerMap.TOTAL]);
    res.setHeader('Cache-Control','public, s-maxage=86400, stale-while-revalidate=604800');
    return res.status(200).json({ok:true,summary:{latestDate:date,latestTotalFlow},rows,source:'Farside'});
  }catch(error){
    return res.status(200).json({ok:false,error:error.message,rows:[],summary:{latestDate:null,latestTotalFlow:null},source:'Farside'});
  }
}
