import * as cheerio from 'cheerio';
import { applyBigHolderHistory } from './_big-holder-history.js';
const SOURCE_URL='https://bitinfocharts.com/top-100-richest-bitcoin-addresses.html';
function setCors(res){res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Methods','GET,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type');}
function num(v){const m=String(v??'').replace(/,/g,'').match(/-?\d+(?:\.\d+)?/);if(!m)return null;const n=Number(m[0]);return Number.isFinite(n)?n:null;}
function parse(html){const $=cheerio.load(html);const out=[];$('tr').each((_,tr)=>{const c=[];$(tr).find('td,th').each((__,td)=>c.push($(td).text().replace(/\s+/g,' ').trim()));const rank=num(c[0]);if(rank===null||rank<1||rank>100)return;const btcCell=c.find(x=>/\bBTC\b/i.test(x)&&num(x)!==null);const bal=num(btcCell);if(bal&&bal>0)out.push({rank,balance:bal});});const byRank=new Map();for(const r of out){if(!byRank.has(r.rank))byRank.set(r.rank,r);}return [...byRank.values()].slice(0,100);}
export default async function handler(req,res){
  setCors(res); if(req.method==='OPTIONS') return res.status(204).end();
  try{
    const r=await fetch(SOURCE_URL,{headers:{'user-agent':'BTC Spot Monitor Whale Distribution'},cache:'no-store'});
    if(!r.ok) throw new Error(`BitInfoCharts HTTP ${r.status}`);
    const balances=parse(await r.text());
    if(balances.length<20) throw new Error(`BitInfoCharts parse returned only ${balances.length} rows`);
    const date=new Date().toISOString().slice(0,10);
    const hist=await applyBigHolderHistory('whales',[{category:'Baleias',operator:'Top 100 enderecos ricos BTC',currentBtc:balances.reduce((a,x)=>a+x.balance,0),currentDate:date,source:'BitInfoCharts rich list',sourceUrl:SOURCE_URL,note:'Soma de enderecos, nao entidades. Pode incluir corretoras e custodiantes.'}],date);
    res.setHeader('Cache-Control','public, s-maxage=86400, stale-while-revalidate=604800');
    return res.status(200).json({ok:true,summary:{source:'BitInfoCharts',latestDate:date,addressCount:balances.length},rows:hist.rows});
  }catch(error){res.setHeader('Cache-Control','no-store');return res.status(200).json({ok:false,error:error.message,rows:[]});}
}
