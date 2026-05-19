function setCors(res){res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Methods','GET,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type');}
function baseUrl(req){const proto=(req.headers['x-forwarded-proto']||'https').split(',')[0];const host=req.headers['x-forwarded-host']||req.headers.host;return `${proto}://${host}`;}
async function getJson(url){const r=await fetch(url,{headers:{'user-agent':'BTC Spot Monitor Big Holders Summary'},cache:'no-store'});const j=await r.json().catch(()=>null);if(!r.ok)throw new Error(`${url} HTTP ${r.status}`);return j;}
function treasuryRow(companies){const total=Number(companies?.summary?.totalBtc);if(!Number.isFinite(total))return null;return {category:'Tesourarias BTC',operator:'Companhias abertas com BTC',currentBtc:total,currentDate:companies?.summary?.latestDate||null,source:companies?.source||'CoinGecko Bitcoin Treasury Companies',sourceUrl:companies?.summary?.sourceUrl||'https://www.coingecko.com/en/treasuries/bitcoin/companies',note:'Agregado estrutural das companhias abertas rastreadas pela fonte.'};}
export default async function handler(req,res){
  setCors(res); if(req.method==='OPTIONS') return res.status(204).end();
  const base=baseUrl(req);
  const endpoints={funds:`${base}/api/funds-btc`,whales:`${base}/api/whale-address-distribution`,exchanges:`${base}/api/exchange-reserves`,companies:`${base}/api/public-companies`};
  const entries=await Promise.all(Object.entries(endpoints).map(async([name,url])=>{try{const data=await getJson(url);return {name,ok:data?.ok!==false,data,error:data?.error};}catch(error){return {name,ok:false,error:error.message,data:null};}}));
  const map=Object.fromEntries(entries.map(e=>[e.name,e]));
  const rows=[...(map.funds.data?.rows||[]),...(map.whales.data?.rows||[]),...(map.exchanges.data?.rows||[]),treasuryRow(map.companies.data)].filter(Boolean);
  const failed=entries.filter(e=>!e.ok).map(e=>e.name);
  res.setHeader('Cache-Control','public, s-maxage=86400, stale-while-revalidate=604800');
  return res.status(200).json({ok:rows.length>0,status:{status:failed.length?'partial':'updated',label:failed.length?'Parcial':'Atualizado',failed},generatedAt:new Date().toISOString(),rows,errors:entries.filter(e=>!e.ok).map(e=>({source:e.name,error:e.error}))});
}
