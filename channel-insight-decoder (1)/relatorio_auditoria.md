# 🤖 Manual de Operação e Relatório de Auditoria Técnica - SMC Quantum v4.0

Este documento serve como o manual definitivo do robô gerador de sinais, detalhando desde a arquitetura de ingestão de dados à emissão de sinais, incorporando os recentes avanços institucionais.

---

## 1. O Ciclo de Vida de um Sinal (Passo a Passo)

A jornada de um sinal começa no envio do preço bruto pela corretora e termina no seu Telegram:

1. **Ingestão de Dados (Tick-by-Tick):** O backend (`server.ts`) mantém uma conexão persistente e unificada via WebSocket escutando os fluxos (streams) de 1m, 5m e 15m para os ativos selecionados (BTC, SOL, BNB, DOGE). A cada 1 segundo (tick), a corretora empurra pacotes de variação de preços.
2. **Atualização do Motor (Trading Engine):** Cada pacote interceptado injeta o `high`, `low`, `close`, `open` e o volume do candle atual na estrutura de dados limitada do ativo correspondente, rodando na classe `TradingEngine`.
3. **Trigger de Avaliação:** Sempre que a vela atual pisca um novo preço (sem ter fechado ainda), a função `checkSignals` é disparada em tempo real, avaliando o ecossistema daquela vela (VWAP, EMA, Price Action e Zonas) no timeframe focado (M5 ou M15).
4. **Filtro de Retração (Zona Base):** O preço "toca" (dentro da margem de 0.03% de tolerância) em uma Zona de Liquidez histórica. Se essa zona for validada por uma alta taxa de repulsão no passado (ex: >= 75%), o motor continua a análise.
5. **Cálculo de Assertividade:** O motor consolida um Score baseado nos indicadores técnicos (detalhados abaixo) em tempo real. 
6. **Aprovação e Emissão:** Se a assertividade cruza a Nota de Corte daquele timeframe (80% para M5 ou 85% para M15) E não fere a Janela Segura de Tempo (Safe Entry Window), o sinal nasce com o status `PENDING`.
7. **Notificação Expressa:** Imediatamente, esse alerta é renderizado no Front-end (React) para as telas visuais, e enviado via HTTP POST direto ao bot no Telegram.
8. **Resolução (Win/Loss):** Quando o cronômetro oficial do candle zera (candle close real via WebSocket), o robô extrai o preço de fechamento final, compara com o preço da emissão do sinal, decreta `WIN` ou `LOSS` e notifica no Telegram a conclusão da operação.

---

## 2. Indicadores e Confluências

A máquina conta com os seguintes gatilhos nativos, descartando o viés do usuário:
- **Zonas de Liquidez Matemáticas:** O robô detecta resistências (topos) e suportes (fundos) em timeframes curtos que demonstraram defesa maciça de volume, garantindo a solidez do "toque".
- **EMA 200 (Macro):** Média Móvel Exponencial de 200 períodos. Exibe a tendência macro de longo prazo do ativo, identificando a maré principal.
- **VWAP (Institucional Diário):** (Volume Weighted Average Price) calcula o preço médio em que o ativo foi negociado no dia, levando em conta tanto o preço típico (High+Low+Close)/3 quanto o volume. Considerada o "preço justo" institucional.
- **Wick Threshold (Anatomia do Candle):** Analisa se o preço sofreu uma rejeição visceral (pavio maior que 50% do corpo total na ponta da zona atingida).
- **RSI (Índice de Força Relativa):** Procura exaustão por sobrevenda (<= 20) ou sobrecompra (>= 80).
- **Bollinger Bands:** Adiciona pressão na operação se o preço cruzar a banda superior/inferior.

---

## 3. O Cálculo Exato do Score (Assertividade)

Cada sinal não entra no mercado às cegas. Ele começa com uma nota base de **65%** e precisa acumular pontos suficientes no instante exato da aprovação.

- **Pontos Bônus (+):**
  - **+12%**: Volume da vela atual maior do que a média móvel de volumes recentes (Volume Confirmation).
  - **+13% (Alinhamento Institucional):** Ganho **APENAS** se a operação estiver favorável simultaneamente à VWAP e à EMA 200 (Para um CALL: preço > EMA 200 E preço > VWAP. Para PUT: preço < EMA 200 E preço < VWAP).
  - **+8% (Retração Violenta):** O pavio da rejeição já é maior que 50% do tamanho total do candle naquele instante.
  - **+11% (M1 Climax Confirm):** Gatilho cirúrgico olhando no microscópio. Analisa o último candle fechado de 1 Minuto. Se ele também tiver sido uma retração ou fechado na direção do sinal, ganhamos confiança microestrutural.
  - **+15% (Extremo RSI):** Candle tocando zona e o RSI acusa extremismo direcional (RSI <= 20 ou >= 80).
  - **+10% (Tensão BB):** Preço empurrando ativamente a fronteira das Bandas de Bollinger.

- **Penalidades Severas (-):**
  - **-20% (Hard Penalty Institucional):** Subtraída imediatamente se o sinal for **contra** a EMA e a VWAP ao mesmo tempo (Tentativa de interceptar a frente de um rolo compressor bancário). Na prática, esse desconto impossibilita a pontuação de atingir a nota de corte, cancelando sinais infundados (mesmo com RSI ou Bandas a favor).

- **Nota de Corte:** `85%` para timeframe de M15, `80%` para timeframe de M5.

---

## 4. Proteções de Tempo (Safe Entry Window)

Se um preço atinge a pontuação máxima aos "4 minutos e 58 segundos" de uma vela de M5, não daria tempo de um ser humano ler o Telegram, abrir a corretora e comprar para a MESMA vela (haveria erro de delay). 
Por isso o sistema de **Safe Entry Window** bloqueia a validação de sinais perto do fim da vela:
- **Para Sinais de M5:** A operação é invalidada se restar menos de **60 segundos** (60.000 ms) para o fim do candle. O sinal só é gerado no início da esticada do preço.
- **Para Sinais de M15:** A operação é invalidada se restar menos de **5 minutos** (300.000 ms). Corretoras frequentemente congelam ou recusam ordens de expiração se solicitadas perto do estouro, ou então abrem automaticamente para o PRÓXIMO candle (rompendo nossa estatística). O robô exige que o "toque" na zona de M15 ocorra nos primeiros 10 minutos de vida da vela.

---

## 5. Arquitetura de Fallback Triplo (Anti-Congelamento)

A API pública da Binance costuma punir IPs de servidores cloud (VPS) com erros silenciosos `451 - Unavailable For Legal Reasons` ou banimentos temporários de IP, congelando oráculos.

**Como o bot se blinda (Correções Aplicadas):**
1. **Histórico via KuCoin (O Resgate a Frio):** Quando o robô é iniciado e pede o passado de 200 candles (necessário para calcular a EMA 200, VWAP, Bollinger, etc), se a Binance derrubar o IP, a nossa ingestão falha graciosamente em "Catch" e altera o host acionando a `api.kucoin.com`. Os dados vêm invertidos e com timestamps crús da KuCoin; nosso algoritmo decifra, inverte, multiplica por 1000 e carrega a máquina. A vida segue.
2. **Rotatividade de WebSockets (O Motor a Quente):** Para captar variações (ticks ao vivo), nós declaramos 3 pontes independentes:
   - `wss://data-stream.binance.vision:9443` (Oficial, resiliente, à prova de sanções).
   - `wss://stream.binance.com:9443` (Primária global).
   - `wss://stream.binance.us:9443` (Rota EUA alternativa).
   Se qualquer ponta reportar falha de pacote (`ws.onerror`) ou ping pong falhar, o bot recusa a morrer: ele soma `index + 1`, troca de rede, descarta o soquete sujo, e tenta novamente na ponta secundária. O front-end React também foi programado para assumir exatamente a mesma rotatividade.
