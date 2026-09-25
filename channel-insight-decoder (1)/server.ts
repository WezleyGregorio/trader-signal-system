import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { WebSocket } from "ws";
import { TradingEngine } from "./src/engine/tradingEngine";
import { Signal, Candle, AssetConfig, Timeframe } from "./src/types";
import { calculateDailySimulation, generateReportText, getSPDateStr } from "./src/utils/reportUtils";
import fs from "fs";

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

app.use(express.json());

// Server State
const ASSETS: AssetConfig[] = [
  { symbol: 'btcusdt', name: 'Bitcoin', color: '#f7931a' },
  { symbol: 'ethusdt', name: 'Ethereum', color: '#627eea' },
  { symbol: 'xrpusdt', name: 'XRP', color: '#00aae4' }
];
const TIMEFRAMES: Timeframe[] = ['M1', 'M5', 'M15'];

const engines = new Map<string, TradingEngine>();
const currentPrices: Record<string, number> = {};
let activeSignals: Signal[] = [];
let history: Signal[] = [];
let telegramConfig = {
  token: process.env.TELEGRAM_TOKEN || '8819856103:AAF7qEa8rBBttiwza52Pj6-DSuCZSFC_1as',
  chatId: process.env.TELEGRAM_CHAT_ID || '8561094480',
  webhookUrl: process.env.WEBHOOK_URL || ''
};

// Initialize Engines
ASSETS.forEach(asset => {
  engines.set(asset.symbol, new TradingEngine(asset.name.toUpperCase()));
});

// Load state from file if exists (for persistence across restarts)
const STATE_FILE = path.join(process.cwd(), 'data', 'state.json');
try {
  if (fs.existsSync(STATE_FILE)) {
    const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    if (data.history) history = data.history;
    if (data.activeSignals) activeSignals = data.activeSignals;
    if (data.telegramConfig) telegramConfig = data.telegramConfig;
  }
} catch (e) {
  console.warn("Could not load state from file:", e);
}

const saveState = () => {
  try {
    if (!fs.existsSync(path.join(process.cwd(), 'data'))) {
      fs.mkdirSync(path.join(process.cwd(), 'data'));
    }
    fs.writeFileSync(STATE_FILE, JSON.stringify({
      history: history.slice(0, 5000), // preserve historical operations across days
      activeSignals,
      telegramConfig
    }));
  } catch (e) {
    console.warn("Could not save state:", e);
  }
};

const sendTelegramMessage = async (text: string) => {
  if (telegramConfig.token && telegramConfig.chatId) {
    try {
      await fetch(`https://api.telegram.org/bot${telegramConfig.token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: telegramConfig.chatId,
          text,
          parse_mode: 'Markdown'
        })
      });
    } catch (e) {
      console.error("Telegram error:", e);
    }
  }
};

const sendWebhook = async (payload: any) => {
  if (telegramConfig.webhookUrl) {
    try {
      await fetch(telegramConfig.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (e) {
      console.error("Webhook error:", e);
    }
  }
};

const triggerNewSignalNotification = (signal: Signal) => {
  const text = `🚨 *NOVO SINAL CAPTURADO* 🚨\n\n` +
    `*Ativo:* ${signal.asset}\n` +
    `*Ação:* ${signal.type === 'CALL' ? '🟢 COMPRA (CALL)' : '🔴 VENDA (PUT)'}\n` +
    `*Preço Alvo:* $${signal.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}\n` +
    `*Timeframe:* ${signal.timeframe}\n` +
    `*Estratégia:* ${signal.strategy}\n` +
    `*Expiração:* ${new Date(signal.expiryTimestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}\n\n` +
    `📈 _Confirmação de Pavio: ${signal.metrics?.wickSize?.toFixed(1) || 0}% | SMC Quantum v4.0_`;
  sendTelegramMessage(text);
  sendWebhook(signal);
};

const triggerResolvedNotification = (signal: Signal) => {
  const isWin = signal.status === 'WIN';
  const resultIcon = isWin ? '✅ VITÓRIA (WIN)' : '❌ DERROTA (LOSS)';
  const winIndicator = isWin ? '🟢' : '🔴';

  const text = `🔔 *SINAL FINALIZADO - RESULTADO* 🔔\n\n` +
    `*Ativo:* ${signal.asset}\n` +
    `*Ação:* ${signal.type === 'CALL' ? 'COMPRA (CALL) 🟢' : 'VENDA (PUT) 🔴'}\n` +
    `*Timeframe:* ${signal.timeframe}\n` +
    `*Taxa de Entrada:* $${signal.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}\n` +
    `*Taxa de Fechamento:* $${signal.resultPrice?.toLocaleString(undefined, { minimumFractionDigits: 2 }) || 'N/A'}\n\n` +
    `${winIndicator} *Resultado:* *${resultIcon}*\n\n` +
    `📈 _SMC Quantum v4.0 Auto-Tracker_`;
  sendTelegramMessage(text);
  sendWebhook(signal);
};

// Fetch initial historical data
const fetchHistory = async (symbol: string, timeframe: Timeframe | 'M1') => {
  const intervalMap: Record<Timeframe | 'M1', string> = { 'M1': '1m', 'M5': '5m', 'M15': '15m' };
  const kucoinIntervalMap: Record<Timeframe | 'M1', string> = { 'M1': '1min', 'M5': '5min', 'M15': '15min' };
  
  const interval = intervalMap[timeframe];
  const kucoinInterval = kucoinIntervalMap[timeframe];
  
  const formattedSymbol = symbol.toUpperCase(); // e.g. BTCUSDT
  const kucoinSymbol = formattedSymbol.replace('USDT', '-USDT'); // e.g. BTC-USDT

  // Primary: Binance endpoints, Fallback: KuCoin
  const binanceEndpoints = [
    `https://api.binance.com/api/v3/klines?symbol=${formattedSymbol}&interval=${interval}&limit=200`,
    `https://api.binance.us/api/v3/klines?symbol=${formattedSymbol}&interval=${interval}&limit=200`,
    `https://data-api.binance.vision/api/v3/klines?symbol=${formattedSymbol}&interval=${interval}&limit=200`,
    `https://api1.binance.com/api/v3/klines?symbol=${formattedSymbol}&interval=${interval}&limit=200`,
  ];

  for (const url of binanceEndpoints) {
    try {
      const response = await fetch(url);
      if (!response.ok) continue;
      const data = await response.json();
      return data.map((d: any[]) => ({
        timestamp: Number(d[0]),
        open: parseFloat(d[1]),
        high: parseFloat(d[2]),
        low: parseFloat(d[3]),
        close: parseFloat(d[4]),
        volume: parseFloat(d[5]),
      }));
    } catch (e) {
      continue;
    }
  }
  
  // KuCoin Fallback
  console.warn(`Falling back to KuCoin for ${symbol} ${timeframe}`);
  try {
    const kucoinUrl = `https://api.kucoin.com/api/v1/market/candles?type=${kucoinInterval}&symbol=${kucoinSymbol}`;
    const response = await fetch(kucoinUrl);
    if (response.ok) {
      const json = await response.json();
      if (json.code === "200000" && json.data) {
        // KuCoin returns data in desc order (newest first). Binance is asc (oldest first).
        // KuCoin format: [time, open, close, high, low, volume, amount] (time in SECONDS)
        const data = json.data.reverse().slice(-200); // reverse to asc, take last 200
        return data.map((d: any[]) => ({
          timestamp: Number(d[0]) * 1000,
          open: parseFloat(d[1]),
          close: parseFloat(d[2]),
          high: parseFloat(d[3]),
          low: parseFloat(d[4]),
          volume: parseFloat(d[5])
        }));
      }
    }
  } catch (e) {
     console.error(`KuCoin fallback failed for ${symbol}`, e);
  }

  console.error(`Error fetching history for ${symbol} ${timeframe}`);
  return [];
};

const initData = async () => {
  for (const asset of ASSETS) {
    const engine = engines.get(asset.symbol);
    if (!engine) continue;
    
    // M1
    const m1Klines = await fetchHistory(asset.symbol, 'M1');
    m1Klines.forEach(c => engine.addCandle('M1', c));
    
    for (const tf of TIMEFRAMES) {
      const klines = await fetchHistory(asset.symbol, tf);
      klines.forEach(c => engine.addCandle(tf, c));
      
      if (tf === 'M5' && klines.length > 0) {
        currentPrices[asset.symbol] = klines[klines.length - 1].close;
      }
    }
  }
  startBinanceWS();
};

const recentEmittedSignals = new Set<string>();

let wsEndpointIndex = 0;
const wsEndpoints = [
  'wss://data-stream.binance.vision:9443',
  'wss://stream.binance.com:9443',
  'wss://stream.binance.us:9443'
];

const startBinanceWS = () => {
  const streams = ASSETS.flatMap(asset => 
    ['5m', '15m', '1m'].map(tfLower => `${asset.symbol}@kline_${tfLower}`)
  ).join('/');

  const url = `${wsEndpoints[wsEndpointIndex]}/stream?streams=${streams}`;
  const ws = new WebSocket(url);

  ws.on('open', () => console.log('Binance WS Connected'));
  
  ws.on('message', (dataStr) => {
    try {
      const payload = JSON.parse(dataStr.toString());
      const data = payload.data || payload;
      const k = data.k;
      if (!k) return;

      const symbol = k.s.toLowerCase();
      const interval = k.i;
      const tfMap: Record<string, Timeframe | 'M1'> = { '1m': 'M1', '5m': 'M5', '15m': 'M15' };
      const tf = tfMap[interval];
      if (!tf) return;

      const price = parseFloat(k.c);
      const isClosed = k.x;
      currentPrices[symbol] = price;

      const engine = engines.get(symbol);
      if (!engine) return;

      const candle: Candle = {
        timestamp: k.t,
        open: parseFloat(k.o),
        high: parseFloat(k.h),
        low: parseFloat(k.l),
        close: price,
        volume: parseFloat(k.v)
      };

      engine.addCandle(tf, candle);

      if (tf !== 'M1') {
        if (!isClosed) {
          const signal = engine.checkSignals(tf as Timeframe);
          if (signal) {
            let blockSignal = false;
            const tfMs = tf === 'M5' ? 300000 : 900000;

            if (symbol === 'dogeusdt') {
              blockSignal = true;
            }

            if (tf === 'M5') {
              if (symbol !== 'btcusdt' && symbol !== 'paxgusdt' && symbol !== 'xrpusdt' && symbol !== 'ethusdt') {
                blockSignal = true;
              } else {
                const nowBR = new Date(new Date().toLocaleString("en-US", {timeZone: "America/Sao_Paulo"}));
                const totalMins = nowBR.getHours() * 60 + nowBR.getMinutes();
                if (totalMins < 60 || totalMins >= 870) {
                  blockSignal = true;
                }
              }
            }

            if (tf === 'M15') {
              const elapsedM15 = Date.now() % 900000;
              if (elapsedM15 <= 600000) {
                const hasM5Recent = activeSignals.some(s => s.asset === signal.asset && s.timeframe === 'M5' && s.type === signal.type && Math.abs(Date.now() - s.timestamp) < 600000) || history.some(s => s.asset === signal.asset && s.timeframe === 'M5' && s.type === signal.type && Math.abs(Date.now() - s.timestamp) < 600000);
                if (hasM5Recent) blockSignal = true;
              }
            }

            const isDuplicate = (s: Signal) => s.id === signal.id || (s.asset === signal.asset && s.timeframe === signal.timeframe && s.type === signal.type && Math.abs(s.timestamp - signal.timestamp) < (tfMs * 2.5));

            if (activeSignals.some(isDuplicate) || history.some(isDuplicate)) {
              blockSignal = true;
            }

            const signalKey = `${signal.asset}-${signal.timeframe}-${signal.type}-${Math.floor(signal.timestamp / 60000)}`;
            if (recentEmittedSignals.has(signalKey)) blockSignal = true;

            if (!blockSignal) {
              recentEmittedSignals.add(signalKey);
              if (recentEmittedSignals.size > 200) {
                recentEmittedSignals.delete(recentEmittedSignals.keys().next().value!);
              }
              
              triggerNewSignalNotification(signal);
              activeSignals.unshift(signal);
              if (activeSignals.length > 100) activeSignals.pop();
              saveState();
            }
          }
        } else {
          // Resolve signals for this tf and symbol on candle close
          let hasChanges = false;
          activeSignals = activeSignals.map(s => {
            const assetSymbol = ASSETS.find(a => a.name.toUpperCase() === s.asset)?.symbol;
            if (s.status === 'PENDING' && assetSymbol?.toUpperCase() === k.s.toUpperCase() && s.timeframe === tf && s.expiryTimestamp <= k.t) {
              const win = s.type === 'CALL' ? price > s.price : price < s.price;
              const result: Signal = { ...s, status: win ? 'WIN' : 'LOSS', resultPrice: price };
              triggerResolvedNotification(result);
              
              if (!history.some(h => h.id === result.id || (h.asset === result.asset && h.timestamp === result.timestamp && h.timeframe === result.timeframe && h.type === result.type))) {
                history.unshift(result);
                if (history.length > 5000) history.pop();
              }
              hasChanges = true;
              return null as any;
            }
            return s;
          }).filter(Boolean);
          
          if (hasChanges) saveState();
        }
      }

    } catch (e) {
      console.error("WS message error", e);
    }
  });

  ws.on('close', () => {
    console.log('Binance WS closed, reconnecting in 3s...');
    setTimeout(startBinanceWS, 3000);
  });
  
  ws.on('error', (e) => {
    console.error('Binance WS error', e);
    wsEndpointIndex = (wsEndpointIndex + 1) % wsEndpoints.length;
    ws.close();
  });
};

// Start the engine
initData();

// Interval to resolve signals that expire (fallback)
setInterval(() => {
  const now = Date.now();
  let hasChanges = false;
  activeSignals = activeSignals.map(s => {
    if (s.status === 'PENDING' && s.expiryTimestamp <= now) {
      const assetSymbol = ASSETS.find(a => a.name.toUpperCase() === s.asset)?.symbol;
      const currentPrice = assetSymbol ? currentPrices[assetSymbol] : null;
      if (currentPrice) {
        const win = s.type === 'CALL' ? currentPrice > s.price : currentPrice < s.price;
        const result: Signal = { ...s, status: win ? 'WIN' : 'LOSS', resultPrice: currentPrice };
        triggerResolvedNotification(result);
        
        if (!history.some(h => h.id === result.id || (h.asset === result.asset && h.timestamp === result.timestamp && h.timeframe === result.timeframe && h.type === result.type))) {
          history.unshift(result);
          if (history.length > 5000) history.pop();
        }
        hasChanges = true;
        return null as any;
      }
    }
    return s;
  }).filter(Boolean);
  if (hasChanges) saveState();
}, 1000);

// API Endpoints for the React App
app.get('/api/state', (req, res) => {
  const availableDates = Array.from(
    new Set(
      history.map(h => getSPDateStr(h.timestamp || h.expiryTimestamp))
    )
  ).sort((a, b) => {
    const [dA, mA, yA] = a.split('/').map(Number);
    const [dB, mB, yB] = b.split('/').map(Number);
    return new Date(yB, mB - 1, dB).getTime() - new Date(yA, mA - 1, dA).getTime();
  });

  res.json({
    activeSignals,
    history,
    currentPrices,
    availableDates
  });
});

app.get('/api/reports/download', (req, res) => {
  const targetDate = (req.query.date as string) || getSPDateStr();
  const sim = calculateDailySimulation(history, targetDate);
  const text = generateReportText(sim);
  const cleanDate = targetDate.replace(/\//g, '-');
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="Relatorio_SMC_${cleanDate}.txt"`);
  res.send(text);
});

app.get('/api/reports/all', (req, res) => {
  const availableDates = Array.from(
    new Set(
      history.map(h => getSPDateStr(h.timestamp || h.expiryTimestamp))
    )
  ).sort((a, b) => {
    const [dA, mA, yA] = a.split('/').map(Number);
    const [dB, mB, yB] = b.split('/').map(Number);
    return new Date(yB, mB - 1, dB).getTime() - new Date(yA, mA - 1, dA).getTime();
  });

  let combined = `====================================================\n`;
  combined += `  HISTÓRICO CONSOLIDADO DE OPERAÇÕES - SMC QUANTUM  \n`;
  combined += `  Gerado em: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}\n`;
  combined += `====================================================\n\n`;

  for (const dt of availableDates) {
    const sim = calculateDailySimulation(history, dt);
    combined += generateReportText(sim);
    combined += `\n\n====================================================\n\n`;
  }

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="Relatorio_SMC_Consolidado_Todos_Os_Dias.txt"`);
  res.send(combined);
});

app.post('/api/config/telegram', (req, res) => {
  const { token, chatId, webhookUrl } = req.body;
  if (typeof token === 'string') telegramConfig.token = token;
  if (typeof chatId === 'string') telegramConfig.chatId = chatId;
  if (typeof webhookUrl === 'string') telegramConfig.webhookUrl = webhookUrl;
  saveState();
  res.json({ success: true });
});

app.post('/api/telegram/send', async (req, res) => {
  const { text, token, chatId } = req.body;
  
  const botToken = token || telegramConfig.token;
  const botChatId = chatId || telegramConfig.chatId;

  if (!botToken || !botChatId) {
    return res.status(400).json({ error: 'Config missing' });
  }
  
  try {
    const MAX_LEN = 4000;
    
    const sendChunk = async (chunk: string) => {
      const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: botChatId, text: chunk, parse_mode: 'Markdown' })
      });
      if (!tgRes.ok) {
        const errText = await tgRes.text();
        throw new Error(errText);
      }
    };

    if (text.length <= MAX_LEN) {
      await sendChunk(text);
    } else {
      const lines = text.split('\n');
      let currentChunk = '';
      
      for (const line of lines) {
        if (currentChunk.length + line.length + 1 > MAX_LEN) {
          await sendChunk(currentChunk);
          currentChunk = line + '\n';
        } else {
          currentChunk += line + '\n';
        }
      }
      if (currentChunk.trim().length > 0) {
        await sendChunk(currentChunk);
      }
    }
    
    res.json({ success: true });
  } catch (e) {
     console.error("TG API Error:", e);
     res.status(500).json({ error: String(e) });
  }
});

app.get('/api/config/telegram', (req, res) => {
  res.json(telegramConfig);
});

app.get('/api/engine/:symbol/:timeframe', async (req, res) => {
  const { symbol, timeframe } = req.params;
  const sym = symbol.toLowerCase();
  const tf = timeframe.toUpperCase() as Timeframe;
  let engine = engines.get(sym);
  
  if (!engine) {
    const matchedAsset = ASSETS.find(a => a.symbol === sym);
    if (matchedAsset) {
      engine = new TradingEngine(matchedAsset.name.toUpperCase());
      engines.set(sym, engine);
    } else {
      return res.status(404).json({ error: 'Engine not found' });
    }
  }

  let candles = engine.getCandles(tf);
  if (!candles || candles.length === 0) {
    try {
      const fetched = await fetchHistory(sym, tf);
      if (fetched && fetched.length > 0) {
        fetched.forEach(c => engine!.addCandle(tf, c));
        candles = engine.getCandles(tf);
      }
    } catch (e) {
      console.warn("On-demand history fetch error", e);
    }
  }
  
  res.json({
    candles: candles || [],
    zones: engine.getZones(tf) || [],
    currentPrice: currentPrices[sym] || (candles && candles.length > 0 ? candles[candles.length - 1].close : null)
  });
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { 
        middlewareMode: true,
        hmr: false,
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
