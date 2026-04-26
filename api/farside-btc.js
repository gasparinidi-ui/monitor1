import * as cheerio from 'cheerio';
function setCors(res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
}
function toNumber(input){
  if(input==null)return null;
  const clean=String(input).replace(/[$,]/g,'').replace(/\u2212/g,'-').trim();
  if(!clean||clean==='N/A'||clean==='-')return null;
  const val=Number(clean);
  return Number.isNaN(val)?null:val;
}
function normTicker(raw){if(!raw)return '';return String(raw).replace(/\s+/g,'').toUpperCase();}
export default async function handler(req,res){
  setCors(res);
  if(req.method==='OPTIONS') return res.status(204).end();
  try{
    const response=await fetch('https://farside.co.uk/btc/',{headers:{'user-agent':'Mozilla/5.0 BTC Spot Monitor'}});
    if(!response.ok) throw new Error(`Farside HTTP ${response.status}`);
    const html=await response.text();
    const $=cheerio.load(html);
    const tables=$('table'); let target=null;
    tables.each((_,table)=>{const text=$(table).text().toLowerCase();if(text.includes('blackrock')||text.includes('ibit')||text.includes('fidelity')) target=table;});
    if(!target){return res.status(200).json({ok:false,summary:{latestDate:null,latestTotalFlow:null},rows:[],warning:'Tabela principal da Farside não encontrada.'});}
    const headers=[]; $(target).find('thead th').each((_,th)=>headers.push($(th).text().trim()));
    const bodyRows=[]; $(target).find('tbody tr').each((_,tr)=>{const cells=[];$(tr).find('td').each((__,td)=>cells.push($(td).text().trim()));if(cells.length>2)bodyRows.push(cells);});
    const latest=bodyRows.find(r=>r.some(c=>String(c).trim() && String(c).trim()!=='-'))||[];
    const date=latest[0]||null; const rows=[];
    for(let i=1;i<headers.length;i++){
      const issuer=headers[i];
      if(/total/i.test(issuer)) continue;
      rows.push({ticker:normTicker(issuer),issuer,date,flow:toNumber(latest[i]),aum:null});
    }
    const totalIdx=headers.findIndex(h=>/total/i.test(h));
    const latestTotalFlow=totalIdx>=0?toNumber(latest[totalIdx]):null;
    res.setHeader('Cache-Control','s-maxage=300, stale-while-revalidate=600');
    return res.status(200).json({ok:true,summary:{latestDate:date,latestTotalFlow},rows,source:'Farside'});
  }catch(error){
    return res.status(200).json({ok:false,error:error.message,rows:[],summary:{latestDate:null,latestTotalFlow:null},source:'Farside'});
  }
}
