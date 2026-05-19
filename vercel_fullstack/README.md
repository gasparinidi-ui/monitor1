# BTC Spot Monitor - Surge + Vercel

Projeto pronto para:
- Frontend estatico no Surge
- Backend proxy/agregador na Vercel
- Dados via CoinGecko, Farside, Finnhub, BTCFunk, BitInfoCharts e DefiLlama

## Backend Vercel

Endpoints principais:
- `/api/snapshot`
- `/api/update-daily`
- `/api/public-companies`
- `/api/farside-btc`
- `/api/finnhub-batch`
- `/api/btc-price`
- `/api/onchain-dormant`
- `/api/big-holders-summary`
- `/api/funds-btc`
- `/api/whale-address-distribution`
- `/api/exchange-reserves`

## Fontes

- Companhias abertas: CoinGecko Bitcoin Treasury Companies. O endpoint tenta usar a CoinGecko Public Treasury API quando `COINGECKO_API_KEY` estiver configurada; sem chave, usa a propria pagina/tabela publica da CoinGecko.
- Variacao de companhias: campo `Activity in Last 30d` da CoinGecko. O painel calcula `Anterior = Total Bitcoin - Activity`.
- ETFs spot: Farside, convertido para BTC com preco BTC/USD da CoinGecko.
- Cotacoes: Finnhub, com `FINNHUB_API_KEY`.
- On-chain: BTCFunk HODL Waves.
- Baleias: BitInfoCharts Rich List, como soma de enderecos, nao de entidades.
- Corretoras: DefiLlama CEX Transparency; quando necessario, converte reservas USD para BTC equivalente.

## Configuracao

1. Publique a pasta `vercel_fullstack` na Vercel.
2. Configure `FINNHUB_API_KEY` para cotacoes.
3. Opcional: configure `COINGECKO_API_KEY` para usar a CoinGecko Public Treasury API diretamente.
4. Opcional: configure `KV_REST_API_URL` e `KV_REST_API_TOKEN` para historico persistente global.
5. No Surge, mantenha `data/app-config.json` apontando para a URL da Vercel.

## Snapshot

Endpoint principal: `/api/snapshot`

Cron em `vercel.json`: `0 11 * * *` UTC

Refresh manual: `/api/update-daily`, que chama `/api/snapshot?refresh=1` e usa `Cache-Control: no-store`.

## Validacao

```txt
https://SEU-PROJETO.vercel.app/api/public-companies
https://SEU-PROJETO.vercel.app/api/snapshot
https://SEU-PROJETO.vercel.app/api/update-daily
```

## Observacoes

- Noticias podem indicar que houve mudanca, mas nao sao usadas como fonte operacional.
- Se CoinGecko falhar, o endpoint retorna `ok:false`, `stale:true` e `sourceMode:"fallback_seed"`.
- Para decisoes financeiras, confirme eventos relevantes nas fontes primarias da companhia, IR ou SEC.
