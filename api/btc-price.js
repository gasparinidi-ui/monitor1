function setCors(res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
}
export default async function handler(req,res){
  setCors(res);
  if(req.method==='OPTIONS') return res.status(204).end();
  try{
    const url='https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd';
    const response=await fetch(url,{headers:{'user-agent':'Mozilla/5.0 BTC Spot Monitor'}});
    if(!response.ok) throw new Error(`CoinGecko HTTP ${response.status}`);
    const data=await response.json();
    res.setHeader('Cache-Control','s-maxage=60, stale-while-revalidate=120');
    return res.status(200).json({ok:true,price:data?.bitcoin?.usd??null,source:'CoinGecko',updatedAt:new Date().toISOString()});
  }catch(error){
    return res.status(200).json({ok:false,error:error.message,price:null,source:'CoinGecko'});
  }
}
