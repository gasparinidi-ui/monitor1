# BTC Spot Monitor - Surge + Vercel

Projeto pronto para:
- Frontend estatico no Surge
- Backend proxy/agregador na Vercel
- Dados via Finnhub, Farside, CoinGecko e BTCFunk

## Arquitetura

### Frontend (Surge)

Arquivos estaticos:
- `index.html`
- `etfs.html`
- `corporates.html`
- `market.html`
- `onchain.html`
- `settings.html`
- `assets/styles.css`
- `assets/app.js`
- `data/*.json`

### Backend (Vercel)

Funcoes serverless:
- `/api/snapshot`
- `/api/update-daily`
- `/api/farside-btc`
- `/api/finnhub-batch`
- `/api/public-companies`
- `/api/btc-price`
- `/api/onchain-dormant`

## Fontes usadas

- BTC spot: CoinGecko simple price API.
- ETFs spot: Farside, via scraping da tabela publica.
- Companhias abertas com BTC: CoinGecko Bitcoin Treasury Companies.
- Cotacoes de ETFs/acoes: Finnhub, com `FINNHUB_API_KEY`.
- On-chain: BTCFunk HODL Waves, sem chave paga.

Quando CoinGecko Companies nao puder ser lido ao vivo, `/api/public-companies` retorna `ok:false`, `stale:true`, `sourceMode:"fallback_seed"` e um aviso. Nesse caso, os dados de companhias devem ser tratados como base local antiga, nao como leitura atualizada.

## Configuracao

1. Publique a pasta `vercel_fullstack` na Vercel.
2. Defina `FINNHUB_API_KEY` no ambiente da Vercel.
3. Opcional: configure `KV_REST_API_URL` e `KV_REST_API_TOKEN` para historico persistente global.
4. Para frontend no mesmo dominio da Vercel, mantenha `data/app-config.json` com `apiBaseUrl` vazio.
5. Para frontend no Surge, use o pacote `surge_frontend` e mantenha `apiBaseUrl` apontando para a URL da Vercel.

## Snapshot diario

Endpoint principal: `/api/snapshot`

Cron em `vercel.json`: `0 11 * * *` UTC

Cache padrao: 24 horas no CDN da Vercel com `stale-while-revalidate`.

Refresh manual: `/api/update-daily`

O refresh manual chama `/api/snapshot?refresh=1`, que usa `Cache-Control: no-store` e propaga um parametro unico aos endpoints internos para evitar reaproveitar a versao cacheada do snapshot.

## Validacao apos publicar

```txt
https://SEU-PROJETO.vercel.app/api/snapshot
https://SEU-PROJETO.vercel.app/api/update-daily
https://SEU-PROJETO.vercel.app/api/public-companies
https://SEU-PROJETO.vercel.app/api/onchain-dormant
```

## Limitacoes praticas

- Scrapers de Farside e CoinGecko dependem da estrutura HTML publica desses sites.
- Fallbacks existem para manter a interface utilizavel, mas agora sao marcados como `stale`.
- Alguns campos de AUM/shares via Finnhub podem nao vir para todos os tickers ou planos.
- Para decisoes financeiras, confirme eventos relevantes em IR, SEC ou fonte primaria da companhia.
