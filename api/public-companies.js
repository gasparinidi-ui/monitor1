import * as cheerio from 'cheerio';
function cleanNum(input){if(input==null)return null;const txt=String(input).replace(/[$,]/g,'').replace(/\s+/g,'').trim();if(!txt||txt==='-')return null;const n=Number(txt);return Number.isNaN(n)?null:n}
export default async function handler(req,res){
  try{
    const response=await fetch('https://bitcointreasuries.net/',{headers:{'user-agent':'Mozilla/5.0'}});
    const html=await response.text();
    const $=cheerio.load(html);
    const pageText=$.text();
    const publicCompaniesMatch=pageText.match(/Number of Public Companies\s+([\d.,]+)/i);
    const totalBtcMatch=pageText.match(/BTC Held by Public Companies\s+([\d.,]+[MK]?)/i);
    const rows=[];
    $('table tbody tr').each((_,tr)=>{const cells=[];$(tr).find('td').each((__,td)=>cells.push($(td).text().trim()));if(cells.length>=4){rows.push({company:cells[0]||null,ticker:cells[1]||null,btcHeld:cleanNum(cells[2]),valueUsd:cleanNum(cells[3])});}});
    const totalBtc=totalBtcMatch?totalBtcMatch[1]:null;
    const publicCompanies=publicCompaniesMatch?cleanNum(publicCompaniesMatch[1]):null;
    res.setHeader('Cache-Control','s-maxage=900, stale-while-revalidate=1800');
    return res.status(200).json({ok:true,summary:{publicCompanies,totalBtc},rows});
  }catch(error){return res.status(500).json({ok:false,error:error.message,summary:{},rows:[]})}
}
