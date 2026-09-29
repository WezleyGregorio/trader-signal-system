# 📄 Documento de Contexto Técnico: Motor de Sinais Institucional

## 1. Visão Geral e Stack
O sistema é um oráculo gerador de sinais preditivos para Opções Binárias focado em criptomoedas de alta liquidez (BTC, SOL, BNB, DOGE). Ele opera primariamente focando em retrações de velas (Wick Retractions) nas janelas de M5 e M15.

- **Linguagem Principal:** TypeScript (Node.js no backend para a máquina de estado e socket, React no frontend).
- **Arquitetura:** Monolito Full-Stack estruturado em Vite + Express (via `server.ts`). O backend gerencia o pipeline de dados em tempo real, as regras de negócio de trade e orquestra as notificações (Telegram). O front-end consome o estado atual via APIs HTTP e exibe os dashboards de zonas.

## 2. Lógica de Geração de Sinais
O sistema não busca apenas "tocar em suportes e resistências". Ele exige confluência baseada no conceito de Smart Money (Fluxo Institucional) acoplado a confirmações de Micro-Retração (M1).

**Indicadores e Cálculos:**
- **Zonas de Liquidez:** Mapeadas com base em picos de volume e histórico de repulsão de preços, exigindo pelo menos 75% de taxa de retração histórica no nível de preço.
- **VWAP Diária (Volume Weighted Average Price):** Calculada considerando o Preço Típico `(High + Low + Close) / 3` ponderado pelo volume, reiniciada diariamente em UTC 0.
- **EMA 200 (Exponential Moving Average):** Rastreador de macrotendência institucional.
- **RSI & Bollinger Bands:** Usados para confluência de sobrecompra/sobrevenda e tensão das bandas (+15% e +10% de boost na assertividade, respectivamente).

**Regras de Gatilho (CALL/PUT) e Assertividade:**
Os sinais iniciam com uma nota base de 65%. Para atingir a nota de corte (85% para M15, 80% para M5), o candle atual precisa acumular pontos de confluência:
- `+12%`: Pico de volume no timeframe atual maior que a média.
- `+13%` (Alinhamento Institucional): Concedido **exclusivamente** se houver alinhamento estrito.
  - Para CALL: Preço acima da EMA 200 E acima da VWAP.
  - Para PUT: Preço abaixo da EMA 200 E abaixo da VWAP.
- `-20%` (Hard Penalty Contra-Bancos): Aplicado se a operação tentar ir totalmente contra o fluxo, ou seja, CALL com preço abaixo da EMA/VWAP, ou PUT com preço acima. Isso bloqueia automaticamente a emissão da maioria dos sinais ruins.
- `+8%`: Pavio (Wick) representa mais de 50% do corpo total do candle.
- `+11%` (Gatilho M1): O timeframe M1 confirma uma exaustão de força no exato minuto de fechamento (e.g. Pavio superior forte no M1 para resistências).

**Safe Entry Windows (Travas de Tempo):**
- **M15:** Bloqueia entradas a partir de 9m59s de vida do candle, forçando as corretoras a respeitarem a retração para a mesma vela.
- **M5:** Exige pelo menos 60 segundos restantes antes do fechamento do candle para garantir tempo hábil de resposta humana e execução na corretora.

## 3. Fluxo de Dados (Pipeline)
1. **Ingestão (WebSocket/REST):** Ao iniciar, `server.ts` puxa o histórico (200 candles) via REST da Binance (`api.binance.com`). Em seguida, abre conexão via WebSocket (`wss://data-stream.binance.vision:9443/stream`) escutando as streams `kline_1m`, `kline_5m`, `kline_15m` para os ativos-alvo.
2. **Processamento (Tick by Tick):** A cada tick do WS (a cada segundo), a vela atual (`candle`) é injetada na classe do respectivo ativo.
3. **Avaliação (`checkSignals`):** O método central (`checkSignals`) audita o fechamento virtual. Se as condições forem atendidas e a assertividade for aprovada (≥ 80/85%), um objeto de Sinal (`PENDING`) é disparado.
4. **Despacho:** O sinal gerado é enfileirado na lista de sinais ativos, devolvido para a interface via polling de API e despachado imediatamente por um bot no Telegram via API POST local.
5. **Resolução:** Quando o timestamp da vela expira (candle close real via WS), o sistema afere o `close` vs `entryPrice` e resolve o sinal (WIN/LOSS), re-notificando o canal.

## 4. Estrutura do Código (Core)
- `/server.ts`: Ponto de entrada do backend. Hospeda a rotina de WebSocket da Binance, agrupa as instâncias de `TradingEngine` por ativo e cria as rotas Express (ex: `/api/signals`).
- `/src/engine/tradingEngine.ts`: **O coração da máquina**.
  - `addCandle()`: Mantém a estrutura de dados (arrays limitados).
  - `getZones()`: Vasculha as áreas de suporte/resistência ativas baseadas em matemática de retração passada.
  - `checkSignals()`: A máquina de regras descrita no Item 2, consolidando VWAP, EMA, Price Action e tempo limite, calculando pontuação e cuspindo os sinais aprovados.
  - `getEma()` e `getVwap()`: Rotinas matemáticas injetadas recentemente para o controle institucional.
- `/src/App.tsx`: A camada de interface, projetada num grid minimalista consumindo a API interna e demonstrando o painel de operações e Zonas Ativas.

## 5. Dependências e Infraestrutura
- **Node.js (tsx / esbuild):** Runtime de operação em nuvem persistente (Cloud Run).
- **Express & ws (WebSocket):** Framework para HTTP API local e consumo do socket reativo da Binance.
- **Binance Public APIs:** Fonte exclusiva de dados financeiros brutos.
- **Telegram Bot API:** Integração HTTP POST usada para envio direto dos alertas em tempo real.
- **Vite & React & Tailwind:** Montagem do cliente visual, unificada no mesmo build e rodando sob a mesma porta.
