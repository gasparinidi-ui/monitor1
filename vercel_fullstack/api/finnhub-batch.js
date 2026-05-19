const ETF_SYMBOLS=['IBIT','FBTC','BITB','ARKB','BTCO','EZBC','HODL','BTCW','BRRR','GBTC','BTC'];
const COMPANY_SYMBOLS=['MSTR','MARA','TSLA','COIN','HUT','RIOT','CLSK','SQ'];
function setCors(res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
}
async function getJson(url){
  const res=await fetch(url,{headers:{'user-agent':'Mozilla/5.0 BTC Spot Monitor'}});
  if(!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
async function getQuote(token,symbol){
  const url=`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${token}`;
  const data=await getJson(url);
  return {symbol,price:data.c??null,changePct:data.dp??null};
}
async function getProfile(token,symbol){
  const url=`https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${token}`;
  return getJson(url);
}
async function getETFHoldings(token,symbol){
  const url=`https://finnhub.io/api/v1/etfs/holdings?symbol=${encodeURIComponent(symbol)}&token=${token}`;
  return getJson(url);
}
export default async function handler(req,res){
  setCors(res);
  if(req.method==='OPTIONS') return res.status(204).end();
  const token=process.env.FINNHUB_API_KEY;
  if(!token){
    return res.status(200).json({ok:false,error:'FINNHUB_API_KEY não definida na Vercel.',quotes:[]});
  }
  try{
    const kind=req.query.kind||'overview';
    let symbols=ETF_SYMBOLS;
    if(kind==='companies') symbols=COMPANY_SYMBOLS;
    if(kind==='overview') symbols=['IBIT','FBTC','MSTR','MARA','TSLA','BTC'];
    const quotes=[];
    const errors=[];
    for(const symbol of symbols){
      try{
        const [quote,profile]=await Promise.allSettled([getQuote(token,symbol),getProfile(token,symbol)]);
        const q=quote.status==='fulfilled'?quote.value:{symbol,price:null,changePct:null};
        const p=profile.status==='fulfilled'?profile.value:{};
        let extra={};
        if(ETF_SYMBOLS.includes(symbol)){
          try{
            const holdings=await getETFHoldings(token,symbol);
            extra={aum:holdings?.totalAssets??null,sharesOutstanding:holdings?.sharesOutstanding??null,type:'ETF'};
          }catch{extra={type:'ETF',aum:null,sharesOutstanding:null};}
        } else {
          extra={type:'Companhia aberta'};
        }
        quotes.push({symbol,name:p?.name??p?.ticker??symbol,price:q.price,changePct:q.changePct,...extra});
      }catch(e){
        errors.push(`${symbol}: ${e.message}`);
        quotes.push({symbol,name:symbol,price:null,changePct:null,type:ETF_SYMBOLS.includes(symbol)?'ETF':'Companhia aberta'});
      }
    }
    res.setHeader('Cache-Control','s-maxage=300, stale-while-revalidate=600');
    return res.status(200).json({ok:errors.length===0,warning:errors.length?errors.join('; '):undefined,quotes});
  }catch(error){
    return res.status(200).json({ok:false,error:error.message,quotes:[]});
  }
}
