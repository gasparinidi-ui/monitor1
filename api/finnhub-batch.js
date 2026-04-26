const ETF_SYMBOLS=['IBIT','FBTC','BITB','ARKB','BTCO','EZBC','HODL','BTCW','BRRR','GBTC','BTC'];
const COMPANY_SYMBOLS=['MSTR','MARA','TSLA','COIN','HUT','RIOT','CLSK','SQ'];
async function getQuote(token,symbol){const url=`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${token}`;const res=await fetch(url);const data=await res.json();return {symbol,price:data.c??null,changePct:data.dp??null};}
async function getProfile(token,symbol){const url=`https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${token}`;const res=await fetch(url);return res.json();}
async function getETFHoldings(token,symbol){const url=`https://finnhub.io/api/v1/etfs/holdings?symbol=${encodeURIComponent(symbol)}&token=${token}`;const res=await fetch(url);return res.json();}
export default async function handler(req,res){
  const token=process.env.FINNHUB_API_KEY; if(!token){return res.status(500).json({ok:false,error:'FINNHUB_API_KEY não definida.',quotes:[]});}
  try{
    const kind=req.query.kind||'overview'; let symbols=ETF_SYMBOLS; if(kind==='companies') symbols=COMPANY_SYMBOLS; if(kind==='overview') symbols=['IBIT','FBTC','MSTR','MARA','TSLA','BTC'];
    const quotes=[];
    for(const symbol of symbols){
      const [quote,profile]=await Promise.all([getQuote(token,symbol),getProfile(token,symbol)]);
      let extra={};
      if(ETF_SYMBOLS.includes(symbol)){
        try{const holdings=await getETFHoldings(token,symbol); extra={aum:holdings?.totalAssets??null,sharesOutstanding:holdings?.sharesOutstanding??null,type:'ETF'};}catch{extra={type:'ETF'};}
      } else {extra={type:'Companhia aberta'};}
      quotes.push({symbol,name:profile?.name??profile?.ticker??symbol,price:quote.price,changePct:quote.changePct,...extra});
    }
    res.setHeader('Cache-Control','s-maxage=300, stale-while-revalidate=600');
    return res.status(200).json({ok:true,quotes});
  }catch(error){return res.status(500).json({ok:false,error:error.message,quotes:[]})}
}
