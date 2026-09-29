import React, { useState, useEffect, useRef, useMemo } from 'react';
import { TradingEngine } from './engine/tradingEngine';
import { Signal, Candle, AssetConfig, Timeframe } from './types';
import { SignalCard } from './components/SignalCard';
import { CandlestickChart } from './components/CandlestickChart';
import { RiskManager } from './components/RiskManager';
import { SorosSimulator } from './components/SorosSimulator';
import { TradingManualModal } from './components/TradingManual';
import { InstallModal } from './components/InstallModal';
import { AlertSettingsModal } from './components/AlertSettingsModal';
import NetworkBackground from './components/NetworkBackground';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, Shield, Zap, Activity, Target, Cpu, TrendingUp, TrendingDown, LineChart as ChartIcon, History, PieChart, Coins, Clock, BookOpen, Sparkles, Volume2, VolumeX } from 'lucide-react';
import { format } from 'date-fns';

const AnimatedPrice = ({ price }: { price: number }) => {
  const prevPriceRef = useRef(price);
  const [colorClass, setColorClass] = useState('text-white');

  useEffect(() => {
    if (price > prevPriceRef.current) {
      setColorClass('text-emerald-400 drop-shadow-[0_0_15px_rgba(52,211,153,0.8)] scale-[1.02]');
    } else if (price < prevPriceRef.current) {
      setColorClass('text-rose-400 drop-shadow-[0_0_15px_rgba(251,113,133,0.8)] scale-[0.98]');
    }
    prevPriceRef.current = price;

    const timer = setTimeout(() => {
      setColorClass('text-white scale-100 drop-shadow-none');
    }, 450);

    return () => clearTimeout(timer);
  }, [price]);

  return (
    <span className={`text-2xl sm:text-4xl font-mono font-black tabular-nums tracking-tighter inline-block transition-all duration-300 ${colorClass}`}>
      ${(price || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
    </span>
  );
};

const ASSETS: AssetConfig[] = [
  { symbol: 'btcusdt', name: 'Bitcoin', color: '#f7931a' },
  { symbol: 'solusdt', name: 'Solana', color: '#14f195' },
  { symbol: 'bnbusdt', name: 'Binance Coin', color: '#f3ba2f' },
  { symbol: 'dogeusdt', name: 'Dogecoin', color: '#c2a633' },
  { symbol: 'xrpusdt', name: 'XRP', color: '#23292f' },
  { symbol: 'ethusdt', name: 'Ethereum', color: '#627eea' }
];

const TIMEFRAMES: Timeframe[] = ['M1', 'M5', 'M15'];

// Helper to fetch or generate high fidelity historical candles
const fetchHistory = async (symbol: string, timeframe: Timeframe | 'M1', retryCount = 0): Promise<Candle[]> => {
  const intervalMap: Record<Timeframe | 'M1', string> = { 'M1': '1m', 'M5': '5m', 'M15': '15m' };
  const kucoinIntervalMap: Record<Timeframe | 'M1', string> = { 'M1': '1min', 'M5': '5min', 'M15': '15min' };
  
  const interval = intervalMap[timeframe];
  const kucoinInterval = kucoinIntervalMap[timeframe];
  const formattedSymbol = symbol.toUpperCase();
  const kucoinSymbol = formattedSymbol.replace('USDT', '-USDT');

  const binanceEndpoints = [
    `https://api.binance.com/api/v3/klines?symbol=${formattedSymbol}&interval=${interval}&limit=200`,
    `https://api.binance.us/api/v3/klines?symbol=${formattedSymbol}&interval=${interval}&limit=200`,
    `https://data-api.binance.vision/api/v3/klines?symbol=${formattedSymbol}&interval=${interval}&limit=200`,
    `https://api1.binance.com/api/v3/klines?symbol=${formattedSymbol}&interval=${interval}&limit=200`,
  ];
  
  let lastError;
  for (const url of binanceEndpoints) {
    try {
      const response = await fetch(url);
      if (!response.ok) continue;
      const rawData = await response.json();
      return rawData.map((d: any[]) => ({
        timestamp: Number(d[0]),
        open: parseFloat(d[1]),
        high: parseFloat(d[2]),
        low: parseFloat(d[3]),
        close: parseFloat(d[4]),
        volume: parseFloat(d[5]),
      }));
    } catch (error) {
      lastError = error;
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
        const data = json.data.reverse().slice(-200);
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
  } catch (error) {
    lastError = error;
  }

  console.warn(`Could not load real klines for ${symbol} ${timeframe} from any endpoint`, lastError);
  return []; // Return empty array so we don't pollute the engine with wildly incorrect synthetic prices
};


const generateReportText = (sim: any) => {
  const sortedTrades = [...sim.trades].sort((a: any, b: any) => {
    const [hA, mA] = a.time.split(':').map(Number);
    const [hB, mB] = b.time.split(':').map(Number);
    if (hA !== hB) return hA - hB;
    return mA - mB;
  });

  const netProfit = sim.balance - sim.initialBalance;
  const pSignGross = (profit: number) => profit > 0 ? '+' : (profit < 0 ? '-' : '');
  const profitSign = netProfit >= 0 ? '+' : '';
  const outcomeWord = netProfit >= 0 ? '🟢 LUCRO' : '🔴 PREJUÍZO';
  const winCount = sortedTrades.filter((t: any) => t.result === 'WIN').length;
  const lossCount = sortedTrades.filter((t: any) => t.result === 'LOSS').length;
  const winRate = sortedTrades.length > 0 ? ((winCount / sortedTrades.length) * 100).toFixed(1) : '0.0';

  const assetStats: Record<string, number> = {};
  const tfStats: Record<string, number> = {};
  const strategyStats: Record<string, number> = {};

  sortedTrades.forEach((t: any) => {
    const profit = t.profit || 0;
    assetStats[t.asset] = (assetStats[t.asset] || 0) + profit;
    tfStats[t.timeframe] = (tfStats[t.timeframe] || 0) + profit;
    const strat = t.strategy || 'SMC Support/Resistance';
    strategyStats[strat] = (strategyStats[strat] || 0) + profit;
  });

  const getRanked = (stats: Record<string, number>) => Object.entries(stats).sort((a, b) => b[1] - a[1]);
  
  const rankedAssets = getRanked(assetStats);
  const bestTf = getRanked(tfStats)[0];
  const bestStrategy = getRanked(strategyStats)[0];

  let reportText = `🏆 *RELATÓRIO DE PERFORMANCE INSTITUCIONAL* 🏆\n`;
  reportText += `━━━━━━━━━━━━━━━━━━━━━━\n`;
  reportText += `🗓 *Data:* ${sim.dateStr}\n`;
  reportText += `🏦 *Banca Inicial:* $ ${sim.initialBalance.toFixed(2)}\n`;
  reportText += `💵 *Banca Final:* $ ${sim.balance.toFixed(2)}\n`;
  reportText += `💰 *Resultado Líquido:* ${profitSign}$ ${Math.abs(netProfit).toFixed(2)} (${outcomeWord})\n`;
  reportText += `📊 *Assertividade:* ${winRate}% (${winCount}W - ${lossCount}L)\n`;
  reportText += `📈 *Qtd. Sinais do Dia:* ${sortedTrades.length}\n`;
  reportText += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;
  
  if (rankedAssets.length > 0) {
    reportText += `*🥇 DESEMPENHO DOS ATIVOS:*\n`;
    rankedAssets.forEach(([asset, profit], idx) => {
      let icon = '🔹';
      if (idx === 0) icon = '🏆';
      else if (idx === rankedAssets.length - 1 && profit < 0) icon = '🔻';
      
      reportText += `${icon} *${asset}:* ${pSignGross(profit)}$ ${Math.abs(profit).toFixed(2)}\n`;
    });
    
    if (bestTf) {
      reportText += `\n*⏱ Melhor Timeframe:* ${bestTf[0]} (${pSignGross(bestTf[1])}$ ${Math.abs(bestTf[1]).toFixed(2)})\n`;
    }
    if (bestStrategy) {
      reportText += `*🧠 Melhor Estratégia:* ${bestStrategy[0]} (${pSignGross(bestStrategy[1])}$ ${Math.abs(bestStrategy[1]).toFixed(2)})\n`;
    }
    reportText += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;
  }

  reportText += `*🎯 HISTÓRICO DE OPERAÇÕES:*\n\n`;
  
  sortedTrades.forEach((t: any, index: number) => {
    const ic = t.result === 'WIN' ? '✅ WIN ' : '❌ LOSS';
    const balanceAfterText = t.balanceAfter ? t.balanceAfter.toFixed(2) : (sim.initialBalance + (t.profit || 0)).toFixed(2);
    const handTag = (t.betAmount && t.betAmount > 3.5) ? 'Soro 1' : 'Base';
    const betInfo = t.betAmount ? ` (Entrada: $ ${t.betAmount.toFixed(2)} [${handTag}])` : '';
    reportText += `*#${(index + 1).toString().padStart(2, '0')}* | 🕒 ${t.time} | 🪙 *${t.asset}* (${t.timeframe})\n`;
    reportText += `   ↳ 🎯 Ordem: *${t.type}* | ${ic} | 💸 ${pSignGross(t.profit || 0)}$ ${Math.abs(t.profit || 0).toFixed(2)}${betInfo}\n`;
    reportText += `   ↳ 🧠 Estratégia: ${t.strategy || 'SMC Support/Resistance'}\n`;
    reportText += `   ↳ ⚖️ Saldo após ordem: $ ${balanceAfterText}\n\n`;
  });

  reportText += `━━━━━━━━━━━━━━━━━━━━━━\n`;
  reportText += `🤖 _SMC Quantum v4.0 Simulator_\n`;
  reportText += `🌐 _Gerenciamento e Risco Avançado_`;

  return reportText;
};

export default function App() {
  const [signals, setSignals] = useState<Signal[]>(() => {
    const saved = localStorage.getItem('active_signals');
    return saved ? JSON.parse(saved) : [];
  });
  const [history, setHistory] = useState<Signal[]>(() => {
    const saved = localStorage.getItem('trade_history');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [currentPrices, setCurrentPrices] = useState<Record<string, number>>({});
  const [activeAsset, setActiveAsset] = useState<string>('btcusdt');
  
  const getDefaultTimeframe = (): Timeframe => {
    const currentHour = new Date(new Date().toLocaleString("en-US", {timeZone: "America/Sao_Paulo"})).getHours();
    return currentHour >= 14 ? 'M15' : 'M5';
  };
  const [activeTF, setActiveTF] = useState<Timeframe>(getDefaultTimeframe());
  const [signalsTab, setSignalsTab] = useState<'active' | 'resolved'>('active');
  const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);
  const [infoModalTab, setInfoModalTab] = useState<'manual' | 'confluence'>('manual');
  const [status, setStatus] = useState<Record<string, string>>({});
  const [activeCandles, setActiveCandles] = useState<Candle[]>([]);
  const [countdown, setCountdown] = useState<string>('--:--');
  const [isSoundEnabled, setIsSoundEnabled] = useState(true);
  const [reconnectTrigger, setReconnectTrigger] = useState(0);
  const [isAutoRecoveryEnabled, setIsAutoRecoveryEnabled] = useState(() => {
    return localStorage.getItem('sentinel_auto_recovery') === 'true'; // Default to false if not set
  });
  const [alertSettings, setAlertSettings] = useState({
    telegramToken: '8819856103:AAF7qEa8rBBttiwza52Pj6-DSuCZSFC_1as',
    telegramChatId: '8561094480',
    webhookUrl: ''
  });

  const normalizeAssetKey = (raw: string): string => {
    const upper = (raw || '').toUpperCase().trim();
    if (upper.includes('BTC') || upper.includes('BITCOIN')) return 'BITCOIN';
    if (upper.includes('SOL')) return 'SOLANA';
    if (upper.includes('BNB') || upper.includes('BINANCE')) return 'BINANCE COIN';
    if (upper.includes('DOGE')) return 'DOGECOIN';
    if (upper.includes('XRP') || upper.includes('RIPPLE')) return 'XRP';
    if (upper.includes('ETH')) return 'ETHEREUM';
    return upper || 'BITCOIN';
  };

  const getInitialAssetSoros = () => ({
    'BITCOIN': { sorosLevel: 0, bet: 3.00 },
    'SOLANA': { sorosLevel: 0, bet: 3.00 },
    'BINANCE COIN': { sorosLevel: 0, bet: 3.00 },
    'DOGECOIN': { sorosLevel: 0, bet: 3.00 },
    'XRP': { sorosLevel: 0, bet: 3.00 },
    'ETHEREUM': { sorosLevel: 0, bet: 3.00 },
  });

  const calculateSimulatedTrades = (rawTrades: any[], todayStr: string) => {
    const baseBet = 3.00;
    const payout = 0.87;
    const initialBalance = 100.00;

    const assetSoros: Record<string, { sorosLevel: number; bet: number }> = getInitialAssetSoros();

    // Deduplicate trades by ID or composite key
    const uniqueTrades: any[] = [];
    const seenKeys = new Set<string>();

    for (const t of rawTrades || []) {
      const key = t.id || `${t.asset}-${t.timeframe}-${t.type}-${t.time || t.timestamp}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        uniqueTrades.push(t);
      }
    }

    // Filter only trades belonging to today
    const todayTrades = uniqueTrades.filter((t: any) => {
      if (t.date && t.date !== todayStr) return false;
      return true;
    });

    // Sort chronologically
    const sorted = [...todayTrades].sort((a, b) => {
      if (a.timestamp && b.timestamp) return a.timestamp - b.timestamp;
      const [hA = 0, mA = 0] = (a.time || '00:00').split(':').map(Number);
      const [hB = 0, mB = 0] = (b.time || '00:00').split(':').map(Number);
      if (hA !== hB) return hA - hB;
      return mA - mB;
    });

    let currentBalance = initialBalance;
    const processedTrades: any[] = [];

    for (const t of sorted) {
      const assetKey = normalizeAssetKey(t.asset);
      const currentAssetSoros = assetSoros[assetKey] || { sorosLevel: 0, bet: baseBet };
      const currentBetValue = currentAssetSoros.bet;
      const currentLevel = currentAssetSoros.sorosLevel;

      const isWin = (t.result || '').toUpperCase() === 'WIN';
      let profit = 0;
      let nextLevel = 0;
      let nextBet = baseBet;

      if (isWin) {
        profit = +(currentBetValue * payout).toFixed(2);
        currentBalance = +(currentBalance + profit).toFixed(2);

        // 1 Mão de Soro:
        // Base ($3.00) -> ganha -> Próxima é $3 + 87% ($5.61)
        // Soro 1 ($5.61) -> ganha -> Volta para Base ($3.00)
        if (currentLevel === 0) {
          nextLevel = 1;
          nextBet = +(baseBet + (baseBet * payout)).toFixed(2); // $5.61
        } else {
          nextLevel = 0;
          nextBet = baseBet; // $3.00
        }
      } else {
        profit = -currentBetValue;
        currentBalance = +(currentBalance + profit).toFixed(2);
        // Loss na base ou no soro -> reseta para Base ($3.00)
        nextLevel = 0;
        nextBet = baseBet;
      }

      assetSoros[assetKey] = {
        sorosLevel: nextLevel,
        bet: nextBet
      };

      processedTrades.push({
        ...t,
        date: todayStr,
        result: isWin ? 'WIN' : 'LOSS',
        betAmount: currentBetValue,
        profit: profit,
        balanceAfter: currentBalance
      });
    }

    const activeAssetKey = normalizeAssetKey(activeAsset);
    const activeAssetEntry = assetSoros[activeAssetKey] || { sorosLevel: 0, bet: baseBet };

    return {
      dateStr: todayStr,
      initialBalance: initialBalance,
      balance: currentBalance,
      bet: activeAssetEntry.bet,
      sorosLevel: activeAssetEntry.sorosLevel,
      assetSoros: assetSoros,
      trades: processedTrades
    };
  };

  const [simulation, setSimulation] = useState(() => {
    const today = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const saved = localStorage.getItem('sentinel_simulation');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.dateStr === today && Array.isArray(parsed.trades)) {
          const recalculated = calculateSimulatedTrades(parsed.trades, today);
          localStorage.setItem('sentinel_simulation', JSON.stringify(recalculated));
          return recalculated;
        }
      } catch (e) {
        console.error("Simulation initialization error", e);
      }
    }
    const fresh = {
      dateStr: today,
      initialBalance: 100,
      balance: 100,
      bet: 3.00,
      sorosLevel: 0,
      assetSoros: getInitialAssetSoros(),
      trades: []
    };
    localStorage.setItem('sentinel_simulation', JSON.stringify(fresh));
    return fresh;
  });

  const resetSimulation = () => {
    const today = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const fresh = {
      dateStr: today,
      initialBalance: 100,
      balance: 100,
      bet: 3.00,
      sorosLevel: 0,
      assetSoros: getInitialAssetSoros(),
      trades: []
    };
    localStorage.setItem('sentinel_simulation', JSON.stringify(fresh));
    setSimulation(fresh);
  };

  const sendManualTelegramReport = async (): Promise<{success: boolean, message: string}> => {
    try {
      const today = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      const saved = localStorage.getItem('sentinel_simulation');
      if (!saved) {
        return { success: false, message: "Nenhuma simulação para hoje." };
      }
      const sim = JSON.parse(saved);
      if (!sim || !sim.trades || sim.trades.length === 0) {
        return { success: false, message: "Faça pelo menos uma operação." };
      }

      const reportText = generateReportText(sim);

      const { alertSettings: currentAlerts } = stateRef.current;
      
      if (currentAlerts.telegramToken && currentAlerts.telegramChatId) {
        try {
          const res = await fetch(`/api/telegram/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: reportText })
          });
          
          if(!res.ok) {
            await navigator.clipboard.writeText(reportText).catch(() => {});
            return { success: false, message: "Erro no Telegram. Copiado!" };
          }
          return { success: true, message: "Sincronizado!" };
        } catch(e) {
          console.error("Error sending manual report", e);
          await navigator.clipboard.writeText(reportText).catch(() => {});
          return { success: false, message: "Erro de conexão. Copiado!" };
        }
      } else {
        await navigator.clipboard.writeText(reportText).catch(() => {});
        return { success: true, message: "Copiado para área de transferência!" };
      }
    } catch (e) {
      console.error("Error sending manual report", e);
      return { success: false, message: "Erro desconhecido." };
    }
  };

  const [isInstallModalOpen, setIsInstallModalOpen] = useState(false);
  const [isAlertSettingsModalOpen, setIsAlertSettingsModalOpen] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<'soros' | 'risk'>('soros');

  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBtn, setShowInstallBtn] = useState(false);

  useEffect(() => {
    const handleBeforeInstall = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallBtn(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    if (window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone) {
      setShowInstallBtn(false);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  const handleInstallApp = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log('App install outcome:', outcome);
    setDeferredPrompt(null);
    setShowInstallBtn(false);
  };

  const engines = useRef<Map<string, TradingEngine>>(new Map());
  const recentEmittedSignals = useRef<Set<string>>(new Set());
  const stateRef = useRef({ activeAsset, activeTF, isSoundEnabled, isAutoRecoveryEnabled, alertSettings, signals, history });

  // Keep the ref in sync with latest state
  useEffect(() => {
    stateRef.current = { activeAsset, activeTF, isSoundEnabled, isAutoRecoveryEnabled, alertSettings, signals, history };
  }, [activeAsset, activeTF, isSoundEnabled, isAutoRecoveryEnabled, alertSettings, signals, history]);

  // Initialize engines with static configs
  useEffect(() => {
    ASSETS.forEach(asset => {
      if (!engines.current.has(asset.symbol)) {
        engines.current.set(asset.symbol, new TradingEngine(asset.name.toUpperCase()));
      }
    });
  }, []);

  // Sync active candles state when switching active asset / timeframe
  const syncCandles = () => {
    const engine = engines.current.get(activeAsset);
    if (engine) {
      setActiveCandles([...engine.getCandles(activeTF)]);
    }
  };

  useEffect(() => {
    syncCandles();
  }, [activeAsset, activeTF]);

  // Enforce timeframe restrictions: SOL, BNB and DOGE are locked on M15, Bitcoin, ETH and XRP on M5 or M15
  useEffect(() => {
    if (activeAsset === 'solusdt' || activeAsset === 'bnbusdt' || activeAsset === 'dogeusdt') {
      if (activeTF !== 'M15') {
        setActiveTF('M15');
      }
    } else if (activeAsset === 'btcusdt' || activeAsset === 'ethusdt' || activeAsset === 'xrpusdt') {
      if (activeTF === 'M1') {
        setActiveTF('M5');
      }
    }
  }, [activeAsset, activeTF]);

  // Real-time calculation of remaining candle time based on active TF interval
  useEffect(() => {
    const updateCountdown = () => {
      const now = Date.now();
      let tfMs = activeTF === 'M15' ? 900000 : 300000;

      const passed = now % tfMs;
      const remainingMs = tfMs - passed;
      const remainingSecTotal = Math.floor(remainingMs / 1000);
      const minutes = Math.floor(remainingSecTotal / 60);
      const seconds = remainingSecTotal % 60;

      const formatted = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
      setCountdown(formatted);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [activeTF]);

  // Triggers integrated sound
  const triggerNotifications = (signal: Signal) => {
    const { isSoundEnabled: soundOn } = stateRef.current;
    // 1. Play browser sound
    if (soundOn) {
      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.setValueAtTime(1200, ctx.currentTime + 0.12);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.35);
      } catch (err) {
        console.warn('Audio Context initialization blocked or failed', err);
      }
    }
  };

  const sentResolvedAlerts = useRef<Set<string>>(new Set());

  const triggerResolvedNotification = (signal: Signal) => {
    const cacheKey = `${signal.id}-${signal.status}`;
    if (sentResolvedAlerts.current.has(cacheKey)) return;
    sentResolvedAlerts.current.add(cacheKey);
    
    // START SIMULATION PROCESS
    try {
      const today = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

      setSimulation((prev: any) => {
        const currentTrades = (prev && prev.dateStr === today ? prev.trades : []) || [];
        if (currentTrades.some((t: any) => t.id === signal.id)) {
          return prev;
        }

        const newTrade = {
          id: signal.id,
          time: new Date(signal.expiryTimestamp || signal.timestamp).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }),
          timestamp: signal.expiryTimestamp || signal.timestamp || Date.now(),
          date: today,
          asset: signal.asset,
          timeframe: signal.timeframe,
          type: signal.type,
          strategy: signal.strategy,
          result: signal.status,
        };

        const recalculated = calculateSimulatedTrades([...currentTrades, newTrade], today);
        localStorage.setItem('sentinel_simulation', JSON.stringify(recalculated));
        return recalculated;
      });
    } catch (e) {
      console.error("Simulation error", e);
    }
  };

  // Fetch or build historical cache to calculate static entry conditions instantly
  useEffect(() => {
    const initEnginesData = async () => {
      const promises = ASSETS.map(async (asset) => {
        const assetSymbol = asset.symbol;
        const tfData: Record<Timeframe, Candle[]> = { M1: [], M5: [], M15: [] };

        const engine = engines.current.get(assetSymbol);
        
        // Pull M1 history for background study / volume prediction
        try {
          const m1Klines = await fetchHistory(assetSymbol, 'M1');
          if (engine) {
            m1Klines.forEach(candle => engine.addCandle('M1', candle));
          }
        } catch (m1Err) {
          console.warn("Could not query historical M1 feed on boot", m1Err);
        }

        for (const tf of TIMEFRAMES) {
          try {
            const klines = await fetchHistory(assetSymbol, tf);
            tfData[tf] = klines;

            if (engine) {
              klines.forEach(candle => engine.addCandle(tf, candle));
            }
          } catch (tfErr) {
            console.warn(`Could not query historical ${tf} feed on boot`, tfErr);
          }
        }

        const m5Klines = tfData['M5'];
        if (m5Klines.length > 0) {
          const latestCandle = m5Klines[m5Klines.length - 1];
          setCurrentPrices(prev => ({ ...prev, [assetSymbol]: latestCandle.close }));
        }
      });

      try {
        await Promise.all(promises);
      } catch (err) {
        console.warn("Error during initialization of historical data:", err);
      }
      syncCandles();
    };

    initEnginesData();
  }, []); // Run ONLY once on mount!

  // Server State Sync
  useEffect(() => {
    const fetchState = async () => {
      try {
        const res = await fetch('/api/state');
        if (res.ok) {
          const data = await res.json();
          setSignals(data.activeSignals || []);
          
          setHistory(prev => {
            const newHistory = data.history || [];

            // Sync today's resolved signals into simulation
            setSimulation((prevSim: any) => {
              const today = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

              const todaySignals = newHistory.filter((s: Signal) => {
                const sDate = new Date(s.expiryTimestamp || s.timestamp).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
                return sDate === today && (s.status === 'WIN' || s.status === 'LOSS');
              });

              const existingTrades = (prevSim && prevSim.dateStr === today ? prevSim.trades : []) || [];
              const existingIds = new Set(existingTrades.map((t: any) => t.id));

              let hasNewTrades = false;
              const combinedTrades = [...existingTrades];

              for (const s of todaySignals) {
                if (!existingIds.has(s.id)) {
                  hasNewTrades = true;
                  combinedTrades.push({
                    id: s.id,
                    time: new Date(s.expiryTimestamp || s.timestamp).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }),
                    timestamp: s.expiryTimestamp || s.timestamp,
                    date: today,
                    asset: s.asset,
                    timeframe: s.timeframe,
                    type: s.type,
                    strategy: s.strategy,
                    result: s.status,
                  });
                }
              }

              // Also check if any existing trade was saved under old betAmount (e.g. not 3 or 5.61)
              const needsRecalc = hasNewTrades || existingTrades.some((t: any) => t.betAmount !== 3.00 && t.betAmount !== 5.61);

              if (needsRecalc) {
                const recalculated = calculateSimulatedTrades(combinedTrades, today);
                localStorage.setItem('sentinel_simulation', JSON.stringify(recalculated));
                return recalculated;
              }

              return prevSim;
            });

            // Trigger alerts for newly resolved signals
            newHistory.forEach((hItem: Signal) => {
              if (!prev.some(p => p.id === hItem.id)) {
                triggerResolvedNotification(hItem);
              }
            });
            return newHistory;
          });
        }
      } catch (e) {
        console.warn("Failed to fetch state from server", e);
      }
    };
    fetchState();
    const interval = setInterval(fetchState, 1500);
    return () => clearInterval(interval);
  }, []);

  // Watch for new signals to play sound
  const previousSignalsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    signals.forEach(s => {
      if (!previousSignalsRef.current.has(s.id)) {
        triggerNotifications(s);
        previousSignalsRef.current.add(s.id);
      }
    });
    // Cleanup old keys to prevent memory leak
    if (previousSignalsRef.current.size > 200) {
      previousSignalsRef.current.clear();
      signals.forEach(s => previousSignalsRef.current.add(s.id));
    }
  }, [signals]);

  // Fetch telegram config from server
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await fetch('/api/config/telegram');
        if (res.ok) {
          const data = await res.json();
          setAlertSettings(prev => ({ ...prev, telegramToken: data.token, telegramChatId: data.chatId, webhookUrl: data.webhookUrl || '' }));
        }
      } catch (e) { }
    };
    fetchConfig();
  }, []);

  // Update save telegram config to send to server
  const saveTelegramConfig = async (token: string, chatId: string, webhookUrl: string) => {
    try {
      await fetch('/api/config/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, chatId, webhookUrl })
      });
      setAlertSettings(prev => ({ ...prev, telegramToken: token, telegramChatId: chatId, webhookUrl }));
    } catch (e) {
      console.error("Failed to save config", e);
    }
  };

  // Daily Telegram Report Cron
  useEffect(() => {
    const reportInterval = setInterval(() => {
        // Obter hora atual no fuso de SP
        const nowBR = new Date(new Date().toLocaleString("en-US", {timeZone: "America/Sao_Paulo"}));
        
        // Check if it's 23:59:5X
        if (nowBR.getHours() === 23 && nowBR.getMinutes() === 59 && nowBR.getSeconds() >= 55) {
            try {
              const { alertSettings: currentAlerts } = stateRef.current;
              const today = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
              const simRaw = localStorage.getItem('sentinel_simulation');
              const sim = simRaw ? JSON.parse(simRaw) : null;
              
              const reportSentDate = localStorage.getItem('sentinel_last_report_date');
              
              if (sim && sim.dateStr === today && sim.trades.length > 0 && reportSentDate !== today) {
                 if (currentAlerts.telegramToken && currentAlerts.telegramChatId) {
                     localStorage.setItem('sentinel_last_report_date', today); // mark as sent
                     
                     const sortedTrades = [...sim.trades].sort((a, b) => {
                       const [hA, mA] = a.time.split(':').map(Number);
                       const [hB, mB] = b.time.split(':').map(Number);
                       if (hA !== hB) return hA - hB;
                       return mA - mB;
                     });

                     const reportText = generateReportText({ ...sim, trades: sortedTrades });

                     fetch(`/api/telegram/send`, {
                         method: 'POST',
                         headers: { 'Content-Type': 'application/json' },
                         body: JSON.stringify({ text: reportText })
                     });
                 }
              }
            } catch (e) {
                console.error("Cron error", e);
            }
        }
    }, 5000);
    return () => clearInterval(reportInterval);
  }, []);

  // Auto-recovery watcher
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isAutoRecoveryEnabled) {
      interval = setInterval(() => {
        setStatus(prev => {
          // Check if any asset is OFFLINE or ERROR
          const needsRecovery = Object.values(prev).some(s => s === 'OFFLINE' || s === 'ERROR');
          if (needsRecovery) {
             console.log("Auto-recovery: Connection was offline/error. Forcing soft reset...");
             setReconnectTrigger(t => t + 1);
          }
          return prev;
        });
      }, 30000); // Check every 30 seconds
    }
    return () => clearInterval(interval);
  }, [isAutoRecoveryEnabled]);

  // Main WebSocket logic
  useEffect(() => {
    let ws: WebSocket;
    let reconnectTimeout: ReturnType<typeof setTimeout>;

    let wsEndpointIndex = 0;
    const wsEndpoints = [
      'wss://data-stream.binance.vision:9443',
      'wss://stream.binance.com:9443',
      'wss://stream.binance.us:9443'
    ];

    const connect = () => {
      // Collect all asset klines under a single unified connection to prevent throttling
      const streams = ASSETS.flatMap(asset => 
        ['5m', '15m', '1m'].map(tfLower => `${asset.symbol}@kline_${tfLower}`)
      ).join('/');

      const url = `${wsEndpoints[wsEndpointIndex]}/stream?streams=${streams}`;

      ws = new WebSocket(url);

      ws.onopen = () => {
      ASSETS.forEach(asset => {
        setStatus(prev => ({ ...prev, [asset.symbol]: 'LIVE' }));
      });
    };
    
    ws.onmessage = (event) => {
      const payload = JSON.parse(event.data);
      // Under combined stream format, payload contains an inner 'data' field
      const data = payload.data || payload;
      const k = data.k;
      if (!k) return;

      const symbol = k.s.toLowerCase();
      
      const interval = k.i;
      const tfMap: Record<string, Timeframe | 'M1'> = {
        '1m': 'M1',
        '5m': 'M5',
        '15m': 'M15'
      };
      const tf = tfMap[interval];
      if (!tf) return;

      const price = parseFloat(k.c);
      const isClosed = k.x;

      // Update current price of the asset on every tick
      setCurrentPrices(prev => ({ ...prev, [symbol]: price }));

      const engine = engines.current.get(symbol);
      if (engine) {
        const candle: Candle = {
          timestamp: k.t,
          open: parseFloat(k.o),
          high: parseFloat(k.h),
          low: parseFloat(k.l),
          close: price,
          volume: parseFloat(k.v)
        };

        engine.addCandle(tf, candle);

        // Update active candles if they match the currently viewed asset & timeframe (using stateRef to avoid stale closures)
        const { activeAsset: curAsset, activeTF: curTF } = stateRef.current;
        if (symbol === curAsset && tf === curTF) {
          setActiveCandles([...engine.getCandles(tf)]);
        }
      }
    };

    ws.onerror = () => {
      ASSETS.forEach(asset => {
        setStatus(prev => ({ ...prev, [asset.symbol]: 'ERROR' }));
      });
      wsEndpointIndex = (wsEndpointIndex + 1) % wsEndpoints.length;
      ws.close();
    };

    ws.onclose = () => {
      ASSETS.forEach(asset => {
        setStatus(prev => ({ ...prev, [asset.symbol]: 'OFFLINE' }));
      });
      // Try to reconnect if dropped
      reconnectTimeout = setTimeout(connect, 3000);
    };
    };

    connect();

    return () => {
      clearTimeout(reconnectTimeout);
      if (ws) {
        ws.onclose = null; // Prevent reconnection trigger
        ws.close();
      }
    };
  }, [reconnectTrigger]);

  const currentAssetData = ASSETS.find(a => a.symbol === activeAsset);
  
  const currentCandles = useMemo(() => {
    return engines.current.get(activeAsset)?.getCandles(activeTF) || [];
  }, [activeAsset, activeTF, activeCandles]);

  const currentZones = useMemo(() => {
    return engines.current.get(activeAsset)?.getZones(activeTF) || [];
  }, [activeAsset, activeTF, activeCandles]);
  
  const stats = useMemo(() => {
    const activeName = currentAssetData?.name.toUpperCase() || '';
    const assetHistory = history.filter(s => s.asset.toUpperCase() === activeName);
    const total = assetHistory.length;
    const wins = assetHistory.filter(s => s.status === 'WIN').length;
    const losses = assetHistory.filter(s => s.status === 'LOSS').length;
    const rate = total > 0 ? (wins / total) * 100 : 0;
    return { total, wins, losses, rate };
  }, [history, currentAssetData]);

  return (
    <div className="min-h-screen bg-[#070707] text-zinc-100 font-sans p-2 sm:p-4 md:p-6 lg:p-8 overflow-x-hidden selection:bg-rose-500/30">
      <NetworkBackground symbol={activeAsset} />
      <div className="max-w-[1400px] mx-auto relative z-10">
        
        {/* Superior Navigator */}
        <header className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 sm:gap-6 mb-6 sm:mb-10">
          <div className="relative group w-full xl:w-auto">
            <div className="absolute -inset-4 bg-rose-500/10 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
            <div className="flex items-center gap-3 mb-2 sm:mb-4">
              <div className="h-8 w-8 sm:h-10 sm:w-10 bg-gradient-to-br from-rose-500 to-rose-700 rounded-xl sm:rounded-2xl flex items-center justify-center shadow-lg shadow-rose-500/20 flex-shrink-0">
                <Cpu className="text-white" size={20} />
              </div>
              <div>
                <span className="text-[8px] sm:text-[10px] font-black text-rose-500 uppercase tracking-[0.3em] mb-0.5 block">Quantum Neural V4.0</span>
                <h1 className="text-xl sm:text-3xl md:text-5xl font-black tracking-tighter text-white">
                  CRYPTO <span className="text-transparent bg-clip-text bg-gradient-to-r from-zinc-100 to-zinc-500">SENTINEL</span>
                </h1>
              </div>
            </div>
            
            <div className="flex gap-1.5 p-1 bg-zinc-900/50 backdrop-blur-md rounded-xl border border-white/5 overflow-x-auto w-full sm:w-auto scrollbar-none max-w-full">
              {ASSETS.map(asset => (
                <button
                  key={asset.symbol}
                  onClick={() => setActiveAsset(asset.symbol)}
                  className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg sm:rounded-xl text-[9px] sm:text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 flex-shrink-0 ${activeAsset === asset.symbol ? 'bg-white text-black shadow-xl' : 'text-zinc-500 hover:text-white'}`}
                >
                  <Coins size={12} style={{ color: activeAsset === asset.symbol ? 'black' : asset.color }} />
                  {asset.name}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full xl:w-auto">
            {/* Quick Actions in Header */}
            <div className="flex gap-1.5 w-full sm:w-auto">
              <button
                 onClick={() => setIsAlertSettingsModalOpen(true)}
                 className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-3 py-2 sm:px-4 sm:py-3 rounded-xl bg-zinc-900/50 hover:bg-zinc-800 border border-white/5 hover:border-emerald-500/30 text-emerald-400 text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer shadow-md hover:text-emerald-300"
              >
                 <Bell size={13} />
                 <span>Alertas</span>
              </button>

              <button
                 onClick={() => setIsInstallModalOpen(true)}
                 className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-3 py-2 sm:px-4 sm:py-3 rounded-xl bg-zinc-900/50 hover:bg-zinc-800 border border-white/5 hover:border-sky-500/30 text-sky-400 text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer shadow-md hover:text-sky-300"
              >
                 <Sparkles size={13} />
                 <span className="hidden sm:inline">Aplicativo</span>
                 <span className="sm:hidden">App</span>
              </button>

              <button
                 onClick={() => setIsSoundEnabled(!isSoundEnabled)}
                 className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-3 py-2 sm:px-4 sm:py-3 rounded-xl border transition-all cursor-pointer shadow-md ${
                   isSoundEnabled 
                     ? 'bg-zinc-900/50 hover:bg-zinc-800 border-white/5 text-amber-500 hover:text-amber-400 hover:border-amber-500/30' 
                     : 'bg-rose-500/10 hover:bg-rose-500/20 border-rose-500/30 text-rose-500 hover:text-rose-400 hover:border-rose-500/50'
                 }`}
              >
                 {isSoundEnabled ? <Volume2 size={13} /> : <VolumeX size={13} />}
                 <span className="text-[10px] font-black uppercase tracking-wider">
                   {isSoundEnabled ? "Som ON" : "Som OFF"}
                 </span>
              </button>
            </div>

            <div className="bg-zinc-900/80 backdrop-blur-xl p-4 sm:p-5.5 rounded-[1.5rem] sm:rounded-[2rem] border border-white/5 flex items-center justify-between xl:justify-start gap-4 sm:gap-6 shadow-2xl relative overflow-hidden group w-full sm:w-auto">
               <div className="absolute top-0 right-0 p-2 sm:p-4 opacity-5 group-hover:scale-110 transition-transform duration-500">
                  <Activity size={80} className="hidden sm:block" />
               </div>
               <div className="text-left sm:text-right">
                  <span className="text-[8px] sm:text-[10px] text-zinc-500 font-black uppercase tracking-widest mb-0.5 sm:mb-1 block">Live {currentAssetData?.name}</span>
                  <AnimatedPrice price={currentPrices[activeAsset] || 0} />
               </div>
               <div className="h-8 sm:h-10 w-px bg-white/10" />
               <div className="flex items-center gap-3 sm:gap-4">
                  <div className={`h-10 w-10 sm:h-12 sm:w-12 rounded-xl sm:rounded-2xl flex items-center justify-center transition-all ${status[activeAsset] === 'LIVE' ? 'bg-emerald-500/10 text-emerald-500 shadow-[inset_0_0_8px_rgba(16,185,129,0.1)]' : 'bg-rose-500/10 text-rose-500'}`}>
                    {status[activeAsset] === 'LIVE' ? <TrendingUp size={20} className="sm:size-7" /> : <Activity size={20} className="animate-spin sm:size-7" />}
                  </div>
                  <div className="text-left">
                     <span className="text-[8px] sm:text-[10px] text-zinc-500 font-black block uppercase">Status</span>
                     <span className={`text-[10px] sm:text-xs font-black uppercase ${status[activeAsset] === 'LIVE' ? 'text-emerald-400' : 'text-rose-400'}`}>{status[activeAsset] || 'OFFLINE'}</span>
                  </div>
               </div>
            </div>
          </div>
        </header>

        {/* Performance Header Specific to Current Asset */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4 mb-6 sm:mb-10">
           {[
             { label: 'Assertividade', val: `${stats.rate.toFixed(1)}%`, icon: PieChart, color: 'text-emerald-400' },
             { label: 'Trades Totais', val: stats.total, icon: History, color: 'text-blue-400' },
             { label: 'Wins Reais', val: stats.wins, icon: Zap, color: 'text-amber-400' },
             { label: 'Losses Reais', val: stats.losses, icon: TrendingDown, color: 'text-rose-400' }
           ].map((item, i) => (
             <div key={i} className="bg-zinc-900/30 border border-white/5 p-3 sm:p-5 rounded-[1.25rem] sm:rounded-[1.5rem] flex items-center gap-3 sm:gap-4 backdrop-blur-sm">
                <div className={`p-2.5 rounded-lg sm:rounded-xl bg-white/5 flex-shrink-0 ${item.color}`}>
                  <item.icon size={18} className="sm:size-5" />
                </div>
                <div>
                   <span className="text-[8px] sm:text-[9px] font-black text-zinc-500 uppercase tracking-widest block">{item.label}</span>
                   <span className="text-lg sm:text-xl font-black text-white">{item.val}</span>
                </div>
             </div>
           ))}
        </div>

        {/* Intelligence Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Neural Chart */}
          <div className="lg:col-span-8 space-y-8">
            <div className="bg-zinc-900/60 border border-white/10 rounded-[1.5rem] sm:rounded-[2.5rem] p-4 sm:p-8 shadow-2xl relative overflow-hidden">
               <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 sm:mb-8">
                  <div className="flex items-center gap-3">
                     <div className="h-8 w-8 sm:h-10 sm:w-10 bg-zinc-800 rounded-xl sm:rounded-2xl flex items-center justify-center text-rose-500 flex-shrink-0">
                        <ChartIcon size={16} className="sm:size-5" />
                     </div>
                     <div>
                        <h2 className="text-lg sm:text-2xl font-black text-white tracking-tighter uppercase leading-none">{currentAssetData?.name} Live Chart</h2>
                        <div className="flex flex-wrap items-center gap-2 mt-1 sm:mt-1.5">
                           <span className="text-[8px] sm:text-[10px] font-mono text-zinc-500">Real-time Candlesticks • Algoritmo SMC</span>
                           <span className="font-mono text-[9px] sm:text-[10px] font-bold text-rose-500 bg-rose-500/10 px-2 py-0.5 rounded-md flex items-center gap-1 border border-rose-500/10">
                              <Clock size={11} className="animate-pulse" />
                              ENCERRA EM ({activeTF}): <span className="text-white font-black font-mono">{countdown}</span>
                           </span>
                        </div>
                     </div>
                  </div>
                  <div className="flex flex-wrap gap-2 items-center w-full sm:w-auto">
                    {/* Timeframes */}
                    <div className="flex gap-1 bg-black/50 p-1 rounded-xl sm:rounded-2xl border border-white/5 w-full sm:w-auto">
                      {TIMEFRAMES.filter(tf => {
                        if (activeAsset === 'btcusdt' || activeAsset === 'ethusdt' || activeAsset === 'xrpusdt') {
                          return tf === 'M5' || tf === 'M15';
                        }
                        return tf === 'M15'; // Solana, BNB and Dogecoin only have M15 focus
                      }).map(tf => (
                        <button 
                          key={tf} 
                          onClick={() => setActiveTF(tf)}
                          className={`flex-1 sm:flex-initial px-4 py-1.5 rounded-lg sm:rounded-xl text-[9px] sm:text-[10px] font-black transition-all ${activeTF === tf ? 'bg-white text-black font-semibold' : 'text-zinc-500 hover:text-white'}`}
                        >
                          {tf}
                        </button>
                      ))}
                    </div>

                    {/* Operational Docs triggers */}
                    <div className="flex gap-0.5 bg-black/50 p-1 rounded-xl sm:rounded-2xl border border-white/5 w-full sm:w-auto">
                      <button 
                        onClick={() => {
                          setInfoModalTab('manual');
                          setIsInfoModalOpen(true);
                        }}
                        className="flex-1 sm:flex-initial px-3 py-1.5 rounded-lg sm:rounded-md text-[9px] sm:text-[10px] font-black text-zinc-400 hover:text-white flex items-center justify-center gap-1 cursor-pointer transition-all hover:bg-white/5"
                        id="btn-open-manual"
                      >
                        <BookOpen size={11} className="text-rose-500" />
                        <span>Manual</span>
                      </button>
                      <button 
                        onClick={() => {
                          setInfoModalTab('confluence');
                          setIsInfoModalOpen(true);
                        }}
                        className="flex-1 sm:flex-initial px-3 py-1.5 rounded-lg sm:rounded-md text-[9px] sm:text-[10px] font-black text-zinc-400 hover:text-white flex items-center justify-center gap-1 cursor-pointer transition-all hover:bg-white/5"
                        id="btn-open-confluence"
                      >
                        <Sparkles size={11} className="text-emerald-400 animate-pulse" />
                        <span>Confluência</span>
                      </button>
                    </div>
                  </div>
               </div>

                <div className="h-[250px] sm:h-[350px] md:h-[400px] w-full">
                  <CandlestickChart 
                    candles={currentCandles}
                    zones={currentZones}
                    activeAssetColor={currentAssetData?.color}
                    activeAssetName={currentAssetData?.name}
                    signals={[...signals, ...history].filter(s => s.asset.toUpperCase() === currentAssetData?.name.toUpperCase() && s.timeframe === activeTF)}
                  />
               </div>
            </div>

            {/* Live Signals Group with Active & Resolved Sinais */}
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex items-center gap-3">
                  <div className="h-6 w-1 bg-rose-500 rounded-full" />
                  <h2 className="text-xl font-black text-white uppercase tracking-tighter">
                    Neural Scanner
                  </h2>
                </div>
                
                {/* Tab Selector */}
                <div className="flex gap-1.5 bg-zinc-950 p-1 rounded-2xl border border-white/5 w-full sm:w-auto">
                  <button
                    onClick={() => setSignalsTab('active')}
                    className={`flex-1 sm:flex-initial px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 ${signalsTab === 'active' ? 'bg-rose-500 text-white shadow-lg' : 'text-zinc-500 hover:text-white'}`}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    🤖 Gatilhos Ativos ({signals.filter(s => s.asset === currentAssetData?.name.toUpperCase()).length})
                  </button>
                  <button
                    onClick={() => setSignalsTab('resolved')}
                    className={`flex-1 sm:flex-initial px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 ${signalsTab === 'resolved' ? 'bg-zinc-805 bg-zinc-800 text-white' : 'text-zinc-500 hover:text-white'}`}
                  >
                    📊 Resolvidos ({history.filter(s => s.asset === currentAssetData?.name.toUpperCase()).length})
                  </button>
                </div>
              </div>

              <AnimatePresence mode="popLayout">
                {signalsTab === 'active' ? (
                  signals.filter(s => s.asset === currentAssetData?.name.toUpperCase()).length === 0 ? (
                    <motion.div 
                      key="empty-active"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="h-96 bg-zinc-900/10 border-2 border-dashed border-white/5 rounded-[3rem] flex flex-col items-center justify-center p-12 text-center w-full"
                    >
                       <div className="relative mb-8">
                         <Activity size={60} className="text-rose-500/20" />
                         <div className="absolute inset-0 flex items-center justify-center">
                            <Cpu size={24} className="text-rose-500/50 animate-pulse" />
                         </div>
                       </div>
                       <h3 className="text-lg font-black text-zinc-400 mb-2 uppercase">Aguardando gatilho institucional</h3>
                       <p className="text-xs text-zinc-600 max-w-xs font-medium">O motor neural está processando fluxos de liquidez em {activeTF} para {currentAssetData?.name}...</p>
                    </motion.div>
                  ) : (
                    <div key="active-signals-grid" className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full">
                      {signals
                        .filter(s => s.asset === currentAssetData?.name.toUpperCase())
                        .map((signal, idx) => (
                          <SignalCard key={`${signal.id}-${idx}`} signal={signal} />
                      ))}
                    </div>
                  )
                ) : (
                  history.filter(s => s.asset === currentAssetData?.name.toUpperCase()).length === 0 ? (
                    <motion.div 
                      key="empty-resolved"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="h-96 bg-zinc-900/10 border-2 border-dashed border-white/5 rounded-[3rem] flex flex-col items-center justify-center p-12 text-center w-full"
                    >
                       <PieChart size={60} className="text-rose-500/20 mb-6" />
                       <h3 className="text-lg font-black text-zinc-400 mb-2 uppercase">Histórico Recente Vazio</h3>
                       <p className="text-xs text-zinc-600 max-w-xs font-medium">Nenhum sinal para o ativo {currentAssetData?.name} foi encerrado/resolvido nesta sessão ainda.</p>
                    </motion.div>
                  ) : (
                    <div key="resolved-signals-grid" className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full">
                      {history
                        .filter(s => s.asset === currentAssetData?.name.toUpperCase())
                        .map((signal, idx) => (
                          <SignalCard key={`${signal.id}-${idx}`} signal={signal} />
                      ))}
                    </div>
                  )
                )}
              </AnimatePresence>
            </div>
            
            <TradingManualModal 
              isOpen={isInfoModalOpen} 
              onClose={() => setIsInfoModalOpen(false)} 
              initialTab={infoModalTab}
            />
          </div>

          {/* Institutional Data Sidebar */}
          <div className="lg:col-span-4 space-y-6">
            
            {/* Sidebar Tabs */}
            <div className="flex bg-zinc-950 p-1 rounded-2xl border border-white/5 w-full">
              <button
                onClick={() => setSidebarTab('soros')}
                className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 ${
                  sidebarTab === 'soros' 
                    ? 'bg-emerald-500 text-white shadow-lg' 
                    : 'text-zinc-500 hover:text-white'
                }`}
              >
                <Coins size={12} className={sidebarTab === 'soros' ? 'animate-bounce' : ''} />
                <span>Simulador Soros</span>
              </button>
              <button
                onClick={() => setSidebarTab('risk')}
                className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 ${
                  sidebarTab === 'risk' 
                    ? 'bg-zinc-800 text-white' 
                    : 'text-zinc-500 hover:text-white'
                }`}
              >
                <span>Calculadora Risco</span>
              </button>
            </div>

            <AnimatePresence mode="wait">
              {sidebarTab === 'soros' ? (
                <motion.div
                  key="soros-sim"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  transition={{ duration: 0.2 }}
                >
                  <SorosSimulator 
                    simulation={simulation}
                    activeAsset={activeAsset}
                    onReset={resetSimulation}
                    onSendTestReport={sendManualTelegramReport}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="risk-mg"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  transition={{ duration: 0.2 }}
                >
                  <RiskManager />
                </motion.div>
              )}
            </AnimatePresence>
            
            {/* Real History Tracker */}
            <div className="bg-zinc-900/80 backdrop-blur-3xl border border-white/10 rounded-[2.5rem] p-8 shadow-[0_40px_100px_-20px_rgba(0,0,0,0.5)]">
               <div className="flex items-center justify-between mb-8">
                  <h3 className="text-lg font-black text-white uppercase tracking-tighter flex items-center gap-3">
                    <History size={20} className="text-rose-500" />
                    Protocol History
                  </h3>
                  <button onClick={() => setHistory([])} className="text-[10px] font-black text-rose-500/50 hover:text-rose-500 uppercase transition-colors">Clear</button>
               </div>

               <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                  {history.map((item, i) => (
                    <motion.div 
                      key={i}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="p-4 bg-black/40 rounded-2xl border border-white/5 flex items-center justify-between hover:bg-black/60 transition-colors"
                    >
                       <div className="flex items-center gap-4">
                          <div className={`h-10 w-10 rounded-xl flex items-center justify-center font-black text-xs ${item.status === 'WIN' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
                             {item.status === 'WIN' ? 'W' : 'L'}
                          </div>
                          <div>
                             <span className="text-[10px] font-mono text-zinc-500 block">{item.asset} • {item.timeframe}</span>
                             <span className="text-xs font-black text-white uppercase">{item.type} @ {item.price.toLocaleString()}</span>
                          </div>
                       </div>
                       <div className="text-right">
                          <span className={`text-[10px] font-black block ${item.status === 'WIN' ? 'text-emerald-500' : 'text-rose-500'}`}>
                            {item.status === 'WIN' ? '+100%' : '0%'}
                          </span>
                          <span className="text-[9px] text-zinc-700 font-mono">
                            {new Date(item.timestamp).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })}
                          </span>
                       </div>
                    </motion.div>
                  ))}
                  {history.length === 0 && (
                    <div className="text-center py-12 opacity-20">
                       <PieChart size={48} className="mx-auto mb-4" />
                       <span className="text-[10px] uppercase font-black tracking-widest">Nenhuma operação registrada</span>
                    </div>
                  )}
               </div>
            </div>



            {/* Neural Matrix Stats */}
            <div className="bg-gradient-to-br from-rose-500/10 to-transparent border border-white/5 rounded-[2.5rem] p-8">
               <h3 className="text-sm font-black text-zinc-400 mb-6 uppercase tracking-widest flex items-center gap-3">
                  <Cpu size={16} className="text-rose-500 animate-pulse" />
                  Zonas Institucionais
               </h3>
               <div className="space-y-4">
                  {engines.current.get(activeAsset)?.getZones(activeTF).map((zone, i) => (
                    <div key={i} className="p-4 bg-zinc-950/80 rounded-2xl border border-white/5 group hover:border-rose-500/30 transition-all flex flex-col gap-2.5">
                       <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                             <div className={`h-2.5 w-2.5 rounded-full ${zone.type === 'SUPPORT' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]'}`} />
                             <span className="text-xs font-mono font-bold text-white">${zone.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                          </div>
                          <div className="flex gap-1.5">
                             {zone.isOrderBlock && <span className="bg-amber-500/10 text-amber-500 text-[7px] font-black px-1.5 py-0.5 rounded tracking-normal">OB</span>}
                             <span className={`text-[7px] font-black px-1.5 py-0.5 rounded tracking-normal uppercase ${zone.type === 'SUPPORT' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                               {zone.type === 'SUPPORT' ? 'Suporte' : 'Resistência'}
                             </span>
                          </div>
                       </div>
                       
                       {/* Advanced breakdown metrics for touches and volume */}
                          <div className="flex flex-col gap-2 pt-2 border-t border-white/5">
                          <div className="grid grid-cols-4 gap-1.5 text-[9px] font-mono text-zinc-400">
                             <div>
                                <span className="text-zinc-600 block text-[7px] font-sans font-black uppercase">Toques (Hits)</span>
                                <span className="text-white font-bold">{zone.strength || zone.hits}x</span>
                             </div>
                             <div>
                                <span className="text-zinc-600 block text-[7px] font-sans font-black uppercase">Retração</span>
                                <span className="text-indigo-400 font-bold">{zone.retractionRate}%</span>
                             </div>
                             <div>
                                <span className="text-zinc-600 block text-[7px] font-sans font-black uppercase">Placar (W/L)</span>
                                <span className="font-bold">
                                   <span className="text-emerald-400">{zone.wins}W</span>
                                   <span className="text-zinc-500 mx-0.5">-</span>
                                   <span className="text-rose-400">{zone.losses}L</span>
                                </span>
                             </div>
                             <div className="text-right">
                                <span className="text-zinc-600 block text-[7px] font-sans font-black uppercase">Win Rate</span>
                                <span className={`font-bold ${zone.wins + zone.losses > 0 && (zone.wins / (zone.wins + zone.losses)) >= 0.5 ? 'text-emerald-400' : 'text-zinc-500'}`}>
                                   {zone.wins + zone.losses > 0 ? Math.round((zone.wins / (zone.wins + zone.losses)) * 100) + '%' : '0%'}
                                </span>
                             </div>
                          </div>

                          <div className="flex items-center justify-between text-[9px] font-mono pt-1">
                             <div className="flex items-center gap-1.5 text-zinc-500">
                                <Activity size={10} />
                                <span className="font-sans font-black uppercase text-[7px]">Volume Profile</span>
                             </div>
                             <div className="flex items-center gap-2">
                                <span className={`text-[8px] px-1.5 rounded font-black uppercase ${zone.volumeScore === 'ALTO' ? 'bg-emerald-500/10 text-emerald-400' : zone.volumeScore === 'MÉDIO' ? 'bg-amber-500/10 text-amber-400' : 'bg-zinc-800 text-zinc-400'}`}>
                                  Vol {zone.volumeScore}
                                </span>
                                <span className="text-white font-bold">
                                  {zone.accumulatedVolume ? (zone.accumulatedVolume > 1000000 ? (zone.accumulatedVolume / 1000000).toFixed(2) + 'M' : (zone.accumulatedVolume / 1000).toFixed(1) + 'k') : 'N/A'}
                                </span>
                             </div>
                          </div>
                          
                          {/* Visual Performance Bar */}
                          {zone.wins + zone.losses > 0 && (
                            <div className="w-full h-1.5 rounded-full bg-zinc-900 overflow-hidden flex">
                               <div 
                                 className="h-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] transition-all duration-500" 
                                 style={{ width: `${(zone.wins / (zone.wins + zone.losses)) * 100}%` }}
                               />
                               <div 
                                 className="h-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)] transition-all duration-500" 
                                 style={{ width: `${(zone.losses / (zone.wins + zone.losses)) * 100}%` }}
                               />
                            </div>
                          )}
                       </div>
                    </div>
                  ))}
                  {(!engines.current.get(activeAsset)?.getZones(activeTF) || engines.current.get(activeAsset)?.getZones(activeTF).length === 0) && (
                     <div className="text-center py-6 text-[10px] text-zinc-600 font-mono uppercase">
                        Aguardando leitura de mercado...
                     </div>
                  )}
               </div>
            </div>

          </div>
        </div>
      </div>

      <AlertSettingsModal
        isOpen={isAlertSettingsModalOpen}
        onClose={() => setIsAlertSettingsModalOpen(false)}
        isSoundEnabled={isSoundEnabled}
        onSoundToggle={setIsSoundEnabled}
        isAutoRecoveryEnabled={isAutoRecoveryEnabled}
        onAutoRecoveryToggle={(val) => {
          setIsAutoRecoveryEnabled(val);
          localStorage.setItem('sentinel_auto_recovery', val.toString());
        }}
        onSettingsChange={(settings) => saveTelegramConfig(settings.telegramToken, settings.telegramChatId, settings.webhookUrl)}
      />

      <InstallModal
        isOpen={isInstallModalOpen}
        onClose={() => setIsInstallModalOpen(false)}
        showInstallBtn={showInstallBtn}
        onInstall={handleInstallApp}
      />

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #27272a; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #3f3f46; }
      `}</style>
    </div>
  );
}
