# BTC Spot Monitor — Surge + Vercel

Projeto pronto para:
- **Frontend estático no Surge**
- **Backend proxy/agregador na Vercel**
- **Dados via Finnhub, Farside, BitcoinTreasuries e CoinGecko**

## Arquitetura

### Frontend (Surge)
Arquivos estáticos:
- `index.html`
- `etfs.html`
- `corporates.html`
- `market.html`
- `settings.html`
- `assets/styles.css`
- `assets/app.js`
- `data/*.json`

### Backend (Vercel)
Funções serverless:
- `/api/farside-btc`
- `/api/finnhub-batch`
- `/api/public-companies`
- `/api/btc-price`

## O que o site entrega

### Visão geral
- BTC spot
- fluxo ETF do dia
- número de companhias abertas no universo monitorado
- BTC corporativo agregado

### Gestoras / ETFs
- watchlist de emissores
- fluxo diário por emissor
- preço e variação
- AUM e shares quando disponíveis

### Companhias abertas
- watchlist de companhias
- breadth via BitcoinTreasuries
- preço e variação via Finnhub
- link para investor relations

### Mercado / confirmação
- painel resumido
- leitura operacional
- comparação rápida de ambiente spot institucional

## Configuração

1. Publique as funções `api/` na Vercel.
2. Defina `FINNHUB_API_KEY` no ambiente da Vercel.
3. Copie a URL da Vercel para `data/app-config.json`, no campo `apiBaseUrl`.
4. Publique esta pasta completa no Surge.

## Observações
- O frontend faz refresh automático com o intervalo definido em `data/app-config.json`.
- Os cards comparam o valor atual com o último refresh salvo no navegador do usuário.
- A watchlist de ETFs e companhias é editável nos JSONs da pasta `data/`.

## Limitações práticas
- O scraper da Farside depende da estrutura HTML pública do site.
- O breadth de companhias depende da estrutura do BitcoinTreasuries.
- Alguns campos de AUM/shares via Finnhub podem não vir para todos os tickers ou planos.
- Para máxima confiabilidade, confirme eventos relevantes de companhias em IR / SEC.

## Ajuste aplicado para Vercel
- Removido o campo inválido `runtime` do `vercel.json`.
- Adicionado `engines.node: 20.x` no `package.json`.
- Mantido `maxDuration` nas funções da pasta `api/`.

## Atualização diária automática

Esta versão usa um snapshot diário consolidado:

- Endpoint principal: `/api/snapshot`
- Endpoint manual de teste: `/api/update-daily`
- Cron configurado em `vercel.json`: `0 11 * * *` UTC
- Cache Vercel CDN: 24 horas + stale-while-revalidate

O frontend consulta primeiro `/api/snapshot`. Se o snapshot falhar, ele tenta usar as APIs individuais como fallback.

Para validar após publicar na Vercel, abra:

```txt
https://SEU-PROJETO.vercel.app/api/snapshot
https://SEU-PROJETO.vercel.app/api/update-daily
```


## Histórico diário de companhias

Este pacote inclui histórico persistente para companhias abertas com BTC em tesouraria. Para funcionar de forma global no Vercel, configure `KV_REST_API_URL` e `KV_REST_API_TOKEN` no projeto. Sem KV, o painel continua funcionando, mas a comparação histórica de companhias depende de histórico local/fallback.
