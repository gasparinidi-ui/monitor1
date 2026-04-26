function setCors(res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
}
export default async function handler(req,res){
  setCors(res);
  if(req.method==='OPTIONS') return res.status(204).end();
  const proto=(req.headers['x-forwarded-proto']||'https').split(',')[0];
  const host=req.headers['x-forwarded-host']||req.headers.host;
  const url=`${proto}://${host}/api/snapshot`;
  const r=await fetch(url,{headers:{'user-agent':'Manual Daily Refresh BTC Spot Monitor'},cache:'no-store'});
  const data=await r.json().catch(()=>null);
  res.setHeader('Cache-Control','no-store');
  return res.status(200).json({ok:r.ok,manualRefresh:true,target:'/api/snapshot',snapshot:data});
}
