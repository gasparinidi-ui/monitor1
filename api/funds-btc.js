import { applyBigHolderHistory } from './_big-holder-history.js';
function setCors(res){res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Methods','GET,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type');}
function baseUrl(req){const proto=(req.headers['x-forwarded-proto']||'https').split(',')[0];const host=req.headers['x-forwarded-host']||req.headers.host;return `${proto}://${host}`;}
async function getJson(url){const r=await fetch(url,{headers:{'user-agent':'BTC Spot Monitor Funds'},cache:'no-store'});const j=await r.json().catch(()=>null);if(!r.ok)throw new Error(`${url} HTTP ${r.status}`);return j;}
function num(v){const n=Number(v);return Number.isFinite(n)?n:null;}
function sum(rows,field){let t=0,h=false;for(const r of rows||[]){const n=num(r?.[field]);if(n!==null){t+=n;h=true;}}return h?t:null;}
export default async function handler(req,res){
  setCors(res); if(req.method==='OPTIONS') return res.status(204).end();
  try{
    const base=baseUrl(req);
    const [btc,flows]=await Promise.all([getJson(`${base}/api/btc-price`),getJson(`${base}/api/farside-btc`)]);
    const price=num(btc?.price);
    const rows=(flows?.rows||[]).map(r=>({...r,btcSpotLast:num(r.btcSpotLast)??(price&&num(r.cumulativeFlowUsdM)!==null?num(r.cumulativeFlowUsdM)*1000000/price:null),btcSpotPrevious:num(r.btcSpotPrevious)??(price&&num(r.previousCumulativeFlowUsdM)!==null?num(r.previousCumulativeFlowUsdM)*1000000/price:null)}));
    const date=flows?.summary?.latestDate||new Date().toISOString().slice(0,10);
    const hist=await applyBigHolderHistory('funds-btc',[{category:'Fundos',operator:'ETFs spot BTC dos EUA',currentBtc:sum(rows,'btcSpotLast'),currentDate:date,previousBtc:sum(rows,'btcSpotPrevious'),previousDate:flows?.summary?.previousDate||null,source:'Farside + CoinGecko BTC/USD',sourceUrl:'https://farside.co.uk/btc/',note:'BTC estimado a partir do fluxo cumulativo em USD dividido pelo preco BTC/USD.'}],date);
    res.setHeader('Cache-Control','public, s-maxage=86400, stale-while-revalidate=604800');
    return res.status(200).json({ok:true,summary:{source:'Farside',latestDate:date},rows:hist.rows});
  }catch(error){res.setHeader('Cache-Control','no-store');return res.status(200).json({ok:false,error:error.message,rows:[]});}
}
