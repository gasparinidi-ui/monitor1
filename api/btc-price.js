export default async function handler(req,res){
  try{
    const url='https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd';
    const response=await fetch(url,{headers:{'user-agent':'Mozilla/5.0'}});
    const data=await response.json();
    res.setHeader('Cache-Control','s-maxage=60, stale-while-revalidate=120');
    return res.status(200).json({ok:true,price:data?.bitcoin?.usd??null});
  }catch(error){return res.status(500).json({ok:false,error:error.message,price:null})}
}
