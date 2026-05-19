export async function applyBigHolderHistory(scope, rows, date=new Date().toISOString().slice(0,10)){
  return {
    rows:(rows||[]).map(r=>({
      ...r,
      currentDate:r.currentDate||date,
      previousBtc:r.previousBtc??null,
      previousDate:r.previousDate??null,
      thirdBtc:r.thirdBtc??null,
      thirdDate:r.thirdDate??null
    })),
    historyMeta:{persisted:false,provider:'memory-only',scope}
  };
}
