import { applyBigHolderHistory } from './_big-holder-history.js';
function setCors(res){res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Methods','GET,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type');}
async function getJson(url){const r=await fetch(url,{headers:{'user-agent':'BTC Spot Monitor CEX Transparency'},cache:'no-store'});const j=await r.json().catch(()=>null);if(!r.ok)throw new Error(`${url} HTTP ${r.status}`);return j;}
function num(v){const n=Number(v);return Number.isFinite(n)?n:null;}
function arr(data){if(Array.isArray(data))return data;for(const k of ['cexs','cex','exchanges','protocols','data'])if(Array.isArray(data?.[k]))return data[k];return [];}
function usd(row){for(const k of ['tvl','totalAssets','totalAssetsUsd','totalReserves','totalReservesUsd','usd','balanceUsd']){const n=num(row?.[k]);if(n&&n>0)return n;}return null;}
export default async function handler(req,res){
  setCors(res); if(req.method==='OPTIONS') return res.status(204).end();
  try{
    const [btc,data]=await Promise.all([getJson('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd'),getJson('https://api.llama.fi/cexs')]);
    const price=num(btc?.bitcoin?.usd); if(!price) throw new Error('CoinGecko BTC price unavailable');
    const values=arr(data).map(usd).filter(v=>v!==null); if(!values.length) throw new Error('DefiLlama CEX response did not expose reserve USD fields');
    const date=new Date().toISOString().slice(0,10);
    const hist=await applyBigHolderHistory('exchange-reserves',[{category:'Corretoras',operator:'Reservas CEX em BTC equivalente',currentBtc:values.reduce((a,v)=>a+v,0)/price,currentDate:date,source:'DefiLlama CEX Transparency + CoinGecko BTC/USD',sourceUrl:'https://defillama.com/cexs',note:'BTC equivalente calculado a partir do total de reservas em USD; nao e prova BTC-only.'}],date);
    res.setHeader('Cache-Control','public, s-maxage=86400, stale-while-revalidate=604800');
    return res.status(200).json({ok:true,estimated:true,summary:{source:'DefiLlama',latestDate:date},rows:hist.rows});
  }catch(error){res.setHeader('Cache-Control','no-store');return res.status(200).json({ok:false,error:error.message,rows:[]});}
}
