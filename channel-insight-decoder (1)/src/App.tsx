import React, { useState, useEffect, useRef, useMemo } from 'react';
import { TradingEngine } from './engine/tradingEngine';
import { Signal, Candle, AssetConfig, Timeframe } from './types';
import { SignalCard } from './components/SignalCard';
import { CandlestickChart } from './components/CandlestickChart';
import { RiskManager } from './components/RiskManager';
import { SorosSimulator } from './components/SorosSimulator';
import { AlertSettingsModal } from './components/AlertSettingsModal';
import { DailyReportsModal } from './components/DailyReportsModal';
import { NeuralMarketTelemetry } from './components/NeuralMarketTelemetry';
import { motion, AnimatePresence } from 'motion/react';
import {
  Bell, Shield, Zap, Activity, Target, Cpu, TrendingUp, TrendingDown,
  LineChart as ChartIcon, History, PieChart, Coins, Clock, BookOpen,
  Sparkles, Volume2, VolumeX, Calendar, Download, Filter, ChevronDown, CheckCircle2,
  LayoutGrid, Layers
} from 'lucide-react';
import { format } from 'date-fns';
import {
  calculateDailySimulation,
  generateReportText,
  downloadReportFile,
  getSPDateStr,
  DailySimulation
} from './utils/reportUtils';

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
  { symbol: 'ethusdt', name: 'Ethereum', color: '#627eea' },
  { symbol: 'xrpusdt', name: 'XRP', color: '#00aae4' }
];

const TIMEFRAMES: Timeframe[] = ['M1', 'M5', 'M15'];

// Helper to fetch or generate high fidelity historical candles
const fetchHistory = async (symbol: string, timeframe: Timeframe | 'M1'): Promise<Candle[]> => {
  const sym = symbol.toLowerCase();
  
  // 1. Always prioritize internal backend proxy (100% reliable on all mobile carriers & networks)
  try {
    const res = await fetch(`/api/engine/${sym}/${timeframe}`);
    if (res.ok) {
      const data = await res.json();
      if (data.candles && Array.isArray(data.candles) && data.candles.length > 0) {
        return data.candles;
      }
    }
  } catch (e) {
    // continue to direct fallbacks
  }

  const intervalMap: Record<Timeframe | 'M1', string> = { 'M1': '1m', 'M5': '5m', 'M15': '15m' };
  const kucoinIntervalMap: Record<Timeframe | 'M1', string> = { 'M1': '1min', 'M5': '5min', 'M15': '15min' };
  
  const interval = intervalMap[timeframe];
  const kucoinInterval = kucoinIntervalMap[timeframe];
  const formattedSymbol = symbol.toUpperCase();
  const kucoinSymbol = formattedSymbol.replace('USDT', '-USDT');

  const binanceEndpoints = [
    `https://api.binance.com/api/v3/klines?symbol=${formattedSymbol}&interval=${interval}&limit=500`,
    `https://api.binance.us/api/v3/klines?symbol=${formattedSymbol}&interval=${interval}&limit=500`,
    `https://data-api.binance.vision/api/v3/klines?symbol=${formattedSymbol}&interval=${interval}&limit=500`,
    `https://api1.binance.com/api/v3/klines?symbol=${formattedSymbol}&interval=${interval}&limit=500`,
  ];
  
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
      // try next
    }
  }

  // KuCoin Fallback
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
    // failure
  }

  return [];
};


export default function App() {
  const todayStr = getSPDateStr();
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [availableDates, setAvailableDates] = useState<string[]>([todayStr]);
  const [isDailyReportsModalOpen, setIsDailyReportsModalOpen] = useState<boolean>(false);
  const [viewScope, setViewScope] = useState<'asset' | 'all'>('all');
  const [resetDateMap, setResetDateMap] = useState<Record<string, number>>({});
  const isInitialLoad = useRef(true);

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
    return localStorage.getItem('sentinel_auto_recovery') === 'true';
  });
  const [alertSettings, setAlertSettings] = useState({
    telegramToken: '8819856103:AAF7qEa8rBBttiwza52Pj6-DSuCZSFC_1as',
    telegramChatId: '8561094480',
    webhookUrl: ''
  });

  // Day-filtered history (strict to selectedDate, no date mixing)
  const dayHistory = useMemo(() => {
    return history.filter(s => {
      const sDate = getSPDateStr(s.timestamp || s.expiryTimestamp);
      return sDate === selectedDate;
    });
  }, [history, selectedDate]);

  // Soros Simulation state derived strictly from the verified operations of that day
  const simulation: DailySimulation = useMemo(() => {
    const minTimestamp = resetDateMap[selectedDate] || 0;
    const eligibleSignals = dayHistory.filter(s => (s.timestamp || s.expiryTimestamp || 0) >= minTimestamp);
    return calculateDailySimulation(eligibleSignals, selectedDate);
  }, [dayHistory, selectedDate, resetDateMap]);

  const resetSimulation = () => {
    setResetDateMap(prev => ({
      ...prev,
      [selectedDate]: Date.now()
    }));
  };

  const sendManualTelegramReport = async (): Promise<{success: boolean, message: string}> => {
    try {
      if (!simulation.trades || simulation.trades.length === 0) {
        return { success: false, message: `Nenhuma operação em ${selectedDate}.` };
      }

      const reportText = generateReportText(simulation);
      const { alertSettings: currentAlerts } = stateRef.current;
      
      if (currentAlerts.telegramToken && currentAlerts.telegramChatId) {
        try {
          const res = await fetch(`/api/telegram/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: reportText })
          });
          
          if (!res.ok) {
            await navigator.clipboard.writeText(reportText).catch(() => {});
            return { success: false, message: "Erro no Telegram. Copiado!" };
          }
          return { success: true, message: "Relatório enviado com sucesso!" };
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

  const handleDownloadActiveReport = () => {
    const reportText = generateReportText(simulation);
    const cleanDate = selectedDate.replace(/\//g, '-');
    downloadReportFile(reportText, `Relatorio_SMC_${cleanDate}.txt`);
  };

  const [isInstallModalOpen, setIsInstallModalOpen] = useState(false);
  const [isAlertSettingsModalOpen, setIsAlertSettingsModalOpen] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<'soros' | 'risk'>('soros');
  const [activeMainTab, setActiveMainTab] = useState<'chart' | 'signals' | 'tools' | 'history' | 'all'>('chart');

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
  const syncCandles = async () => {
    const engine = engines.current.get(activeAsset);
    if (engine) {
      const c = engine.getCandles(activeTF);
      if (c && c.length > 0) {
        setActiveCandles([...c]);
      }
    }

    try {
      const res = await fetch(`/api/engine/${activeAsset}/${activeTF}`);
      if (res.ok) {
        const data = await res.json();
        if (data.candles && Array.isArray(data.candles) && data.candles.length > 0) {
          if (engine) {
            data.candles.forEach((candle: Candle) => engine.addCandle(activeTF, candle));
          }
          setActiveCandles(data.candles);
          if (data.currentPrice) {
            setCurrentPrices(prev => ({ ...prev, [activeAsset]: data.currentPrice }));
          }
        }
      }
    } catch (e) {
      // ignore
    }
  };

  useEffect(() => {
    syncCandles();
    const interval = setInterval(syncCandles, 2000);
    return () => clearInterval(interval);
  }, [activeAsset, activeTF]);

  // Enforce timeframe restrictions: DOGE is locked on M15, Bitcoin, Gold, ETH and XRP on M5 or M15
  useEffect(() => {
    if (activeAsset === 'dogeusdt') {
      if (activeTF !== 'M15') {
        setActiveTF('M15');
      }
    } else if (activeAsset === 'btcusdt' || activeAsset === 'paxgusdt' || activeAsset === 'ethusdt' || activeAsset === 'xrpusdt') {
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
    
    // Play resolved trade sound if sound is enabled
    const { isSoundEnabled: soundOn } = stateRef.current;
    if (soundOn) {
      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = signal.status === 'WIN' ? 'triangle' : 'sawtooth';
        osc.frequency.setValueAtTime(signal.status === 'WIN' ? 587.33 : 220, ctx.currentTime);
        if (signal.status === 'WIN') {
          osc.frequency.setValueAtTime(880, ctx.currentTime + 0.15);
        }
        gain.gain.setValueAtTime(0.18, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.45);
      } catch (err) {
        console.warn('Audio play blocked or unavailable', err);
      }
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

          if (data.availableDates && Array.isArray(data.availableDates) && data.availableDates.length > 0) {
            setAvailableDates(prev => {
              const combined = Array.from(new Set([...data.availableDates, ...prev]));
              return combined.sort((a, b) => {
                const [dA, mA, yA] = a.split('/').map(Number);
                const [dB, mB, yB] = b.split('/').map(Number);
                return new Date(yB, mB - 1, dB).getTime() - new Date(yA, mA - 1, dA).getTime();
              });
            });
          }
          
          setHistory(prev => {
            const newHistory = data.history || [];
            if (!isInitialLoad.current) {
              // Find newly resolved signals that are in newHistory but not in prev
              newHistory.forEach((hItem: Signal) => {
                if (!prev.some(p => p.id === hItem.id)) {
                  triggerResolvedNotification(hItem);
                }
              });
            } else {
              isInitialLoad.current = false;
            }
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
              const { alertSettings: currentAlerts, history: curHistory } = stateRef.current;
              const today = getSPDateStr();
              const reportSentDate = localStorage.getItem('sentinel_last_report_date');
              
              if (reportSentDate !== today && curHistory.length > 0) {
                 if (currentAlerts.telegramToken && currentAlerts.telegramChatId) {
                     const sim = calculateDailySimulation(curHistory, today);
                     if (sim.trades.length > 0) {
                         localStorage.setItem('sentinel_last_report_date', today);
                         const reportText = generateReportText(sim);
                         fetch(`/api/telegram/send`, {
                             method: 'POST',
                             headers: { 'Content-Type': 'application/json' },
                             body: JSON.stringify({ text: reportText })
                         }).catch(e => console.warn("TG auto send failed", e));
                     }
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
    const assetHistory = dayHistory.filter(s => s.asset.toUpperCase() === activeName);
    const total = assetHistory.length;
    const wins = assetHistory.filter(s => s.status === 'WIN').length;
    const losses = assetHistory.filter(s => s.status === 'LOSS').length;
    const rate = total > 0 ? (wins / total) * 100 : 0;

    // Timeframe breakdown
    const m5Trades = assetHistory.filter(s => s.timeframe === 'M5');
    const m5Wins = m5Trades.filter(s => s.status === 'WIN').length;
    const m5Losses = m5Trades.filter(s => s.status === 'LOSS').length;
    const m5Rate = m5Trades.length > 0 ? (m5Wins / m5Trades.length) * 100 : 0;

    const m15Trades = assetHistory.filter(s => s.timeframe === 'M15');
    const m15Wins = m15Trades.filter(s => s.status === 'WIN').length;
    const m15Losses = m15Trades.filter(s => s.status === 'LOSS').length;
    const m15Rate = m15Trades.length > 0 ? (m15Wins / m15Trades.length) * 100 : 0;

    // Strategy ranking
    const stratMap = new Map<string, { wins: number; losses: number; total: number; rate: number }>();
    assetHistory.forEach(s => {
      const stratName = s.strategy || 'SMC Standard';
      const cur = stratMap.get(stratName) || { wins: 0, losses: 0, total: 0, rate: 0 };
      if (s.status === 'WIN') cur.wins++;
      if (s.status === 'LOSS') cur.losses++;
      cur.total++;
      cur.rate = cur.total > 0 ? (cur.wins / cur.total) * 100 : 0;
      stratMap.set(stratName, cur);
    });

    const strats = Array.from(stratMap.entries()).map(([name, data]) => ({ name, ...data }));
    strats.sort((a, b) => b.rate - a.rate || b.wins - a.wins);

    const bestStrategy = strats.length > 0 ? strats[0] : null;
    const worstStrategy = strats.length > 1 ? strats[strats.length - 1] : null;

    return { 
      total, 
      wins, 
      losses, 
      rate,
      m5Wins,
      m5Losses,
      m5Total: m5Trades.length,
      m5Rate,
      m15Wins,
      m15Losses,
      m15Total: m15Trades.length,
      m15Rate,
      bestStrategy,
      worstStrategy
    };
  }, [dayHistory, currentAssetData]);

  const dayTotalStats = useMemo(() => {
    const total = dayHistory.length;
    const wins = dayHistory.filter(s => s.status === 'WIN').length;
    const losses = dayHistory.filter(s => s.status === 'LOSS').length;
    const rate = total > 0 ? (wins / total) * 100 : 0;
    const netProfit = +(simulation.balance - simulation.initialBalance).toFixed(2);
    return { total, wins, losses, rate, netProfit };
  }, [dayHistory, simulation]);

  const displayedActiveSignals = useMemo(() => {
    if (viewScope === 'all') return signals;
    return signals.filter(s => s.asset.toUpperCase() === currentAssetData?.name.toUpperCase());
  }, [signals, viewScope, currentAssetData]);

  const displayedResolvedSignals = useMemo(() => {
    if (viewScope === 'all') return dayHistory;
    return dayHistory.filter(s => s.asset.toUpperCase() === currentAssetData?.name.toUpperCase());
  }, [dayHistory, viewScope, currentAssetData]);

  return (
    <div className="min-h-screen bg-[#070707] text-zinc-100 font-sans p-2 sm:p-4 md:p-6 lg:p-8 pb-28 lg:pb-8 overflow-x-hidden selection:bg-rose-500/30">
      <div className="max-w-[1400px] mx-auto relative z-10">
        
        {/* Superior Navigator */}
        <header className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 sm:gap-6 mb-4 sm:mb-6">
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
                 onClick={() => setIsDailyReportsModalOpen(true)}
                 className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-3 py-2 sm:px-4 sm:py-3 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer shadow-md hover:text-rose-300"
                 title="Abrir histórico e baixar relatórios de todos os dias de operações"
              >
                 <Calendar size={13} />
                 <span>Relatórios</span>
              </button>

              <button
                 onClick={() => setIsAlertSettingsModalOpen(true)}
                 className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-3 py-2 sm:px-4 sm:py-3 rounded-xl bg-zinc-900/50 hover:bg-zinc-800 border border-white/5 hover:border-emerald-500/30 text-emerald-400 text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer shadow-md hover:text-emerald-300"
              >
                 <Bell size={13} />
                 <span>Alertas</span>
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

        {/* Section 1: Operations Date Navigator & Reports Bar */}
        {(() => {
          const renderDateNavigator = () => (
            <div className="bg-zinc-900/90 backdrop-blur-xl border border-white/10 rounded-2xl p-3 sm:p-4 mb-4 sm:mb-6 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                <div className="flex items-center gap-2">
                  <Calendar size={16} className="text-rose-500" />
                  <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400">
                    Dia de Operação:
                  </span>
                </div>

                {/* Date selector dropdown */}
                <div className="relative">
                  <select
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="bg-black/60 hover:bg-black/80 text-white font-mono text-xs font-bold py-1.5 px-3 pr-8 rounded-xl border border-white/10 focus:border-rose-500/50 outline-none appearance-none cursor-pointer transition-all"
                  >
                    {availableDates.map(date => (
                      <option key={date} value={date} className="bg-zinc-900 text-white">
                        {date === todayStr ? `🟢 Hoje (${date})` : `🗓️ ${date}`}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                </div>

                {/* If looking at past day, show 'Voltar para Hoje' button */}
                {selectedDate !== todayStr && (
                  <button
                    onClick={() => setSelectedDate(todayStr)}
                    className="px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 text-[9px] font-black uppercase tracking-wider transition-all flex items-center gap-1 cursor-pointer"
                  >
                    <CheckCircle2 size={11} />
                    Voltar para Hoje
                  </button>
                )}

                {/* Badge for Day's Total Operations */}
                <div className="flex items-center gap-2 px-3 py-1 rounded-xl bg-white/5 border border-white/5 text-[10px]">
                  <span className="text-zinc-400 font-medium">Sinais do dia:</span>
                  <span className="font-mono font-black text-white">{dayHistory.length}</span>
                  <span className="text-zinc-600">•</span>
                  <span className="text-zinc-400 font-medium">Assertividade:</span>
                  <span className="font-mono font-bold text-emerald-400">{dayTotalStats.rate.toFixed(1)}%</span>
                  <span className="text-zinc-600">•</span>
                  <span className="text-zinc-400 font-medium">Resultado:</span>
                  <span className={`font-mono font-bold ${dayTotalStats.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {dayTotalStats.netProfit >= 0 ? '+' : ''}${dayTotalStats.netProfit.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Report Actions */}
              <div className="flex items-center gap-2 w-full md:w-auto">
                <button
                  onClick={handleDownloadActiveReport}
                  disabled={dayHistory.length === 0}
                  className="flex-1 md:flex-initial flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase tracking-wider transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-sm"
                  title={`Baixar relatório de ${selectedDate} formatado em arquivo .txt`}
                >
                  <Download size={12} />
                  <span>Baixar Relatório ({selectedDate})</span>
                </button>

                <button
                  onClick={() => setIsDailyReportsModalOpen(true)}
                  className="flex-1 md:flex-initial flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-white/5 text-zinc-200 text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer shadow-sm"
                  title="Abrir histórico de todos os dias e baixar relatórios individuais ou consolidados"
                >
                  <Calendar size={12} className="text-rose-400" />
                  <span>Todos os Dias</span>
                </button>
              </div>
            </div>
          );

          {/* Section 2: Performance Header with Complete Metrics & Timeframe + Strategy Breakdown */}
          const renderPerformanceStats = () => (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2 sm:gap-3 mb-4 sm:mb-6">
              {/* Card 1: Assertividade */}
              <div className="bg-zinc-900/40 border border-white/5 p-3 sm:p-4 rounded-2xl flex flex-col justify-between backdrop-blur-sm">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[8px] sm:text-[9px] font-black text-zinc-500 uppercase tracking-wider">Assertividade</span>
                  <PieChart size={14} className="text-emerald-400" />
                </div>
                <span className="text-lg sm:text-xl font-black text-emerald-400 font-mono">{stats.rate.toFixed(1)}%</span>
                <span className="text-[8px] text-zinc-500 font-mono mt-0.5">{currentAssetData?.name}</span>
              </div>

              {/* Card 2: Trades Totais */}
              <div className="bg-zinc-900/40 border border-white/5 p-3 sm:p-4 rounded-2xl flex flex-col justify-between backdrop-blur-sm">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[8px] sm:text-[9px] font-black text-zinc-500 uppercase tracking-wider">Trades Totais</span>
                  <History size={14} className="text-blue-400" />
                </div>
                <span className="text-lg sm:text-xl font-black text-white font-mono">{stats.total} ops</span>
                <span className="text-[8px] text-zinc-500 font-mono mt-0.5">{selectedDate}</span>
              </div>

              {/* Card 3: Wins / Losses Reais */}
              <div className="bg-zinc-900/40 border border-white/5 p-3 sm:p-4 rounded-2xl flex flex-col justify-between backdrop-blur-sm">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[8px] sm:text-[9px] font-black text-zinc-500 uppercase tracking-wider">Placar Real</span>
                  <Zap size={14} className="text-amber-400" />
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-lg sm:text-xl font-black text-emerald-400 font-mono">{stats.wins}W</span>
                  <span className="text-zinc-600 font-bold">/</span>
                  <span className="text-base sm:text-lg font-black text-rose-400 font-mono">{stats.losses}L</span>
                </div>
                <span className="text-[8px] text-zinc-500 font-mono mt-0.5">Saldo Real</span>
              </div>

              {/* Card 4: Timeframe M5 */}
              <div className="bg-zinc-900/40 border border-white/5 p-3 sm:p-4 rounded-2xl flex flex-col justify-between backdrop-blur-sm">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[8px] sm:text-[9px] font-black text-zinc-500 uppercase tracking-wider">Timeframe M5</span>
                  <Clock size={14} className="text-purple-400" />
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-base sm:text-lg font-black text-white font-mono">{stats.m5Wins}W / {stats.m5Losses}L</span>
                </div>
                <span className="text-[8px] text-emerald-400 font-mono font-bold mt-0.5">{stats.m5Total > 0 ? `${stats.m5Rate.toFixed(0)}% assert.` : 'Sem ops M5'}</span>
              </div>

              {/* Card 5: Timeframe M15 */}
              <div className="bg-zinc-900/40 border border-white/5 p-3 sm:p-4 rounded-2xl flex flex-col justify-between backdrop-blur-sm">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[8px] sm:text-[9px] font-black text-zinc-500 uppercase tracking-wider">Timeframe M15</span>
                  <Clock size={14} className="text-indigo-400" />
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-base sm:text-lg font-black text-white font-mono">{stats.m15Wins}W / {stats.m15Losses}L</span>
                </div>
                <span className="text-[8px] text-emerald-400 font-mono font-bold mt-0.5">{stats.m15Total > 0 ? `${stats.m15Rate.toFixed(0)}% assert.` : 'Sem ops M15'}</span>
              </div>

              {/* Card 6: Estratégias (Melhor / Pior) */}
              <div className="bg-zinc-900/40 border border-white/5 p-3 sm:p-4 rounded-2xl flex flex-col justify-between backdrop-blur-sm col-span-2 md:col-span-1 xl:col-span-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[8px] sm:text-[9px] font-black text-zinc-500 uppercase tracking-wider">Melhor Estratégia</span>
                  <Sparkles size={14} className="text-amber-400" />
                </div>
                <div className="truncate">
                  <span className="text-xs sm:text-sm font-black text-white truncate block">
                    {stats.bestStrategy ? stats.bestStrategy.name.replace(' (Price & Volume)', '').replace(' (SMC)', '') : 'Analisando...'}
                  </span>
                </div>
                <span className="text-[8px] text-emerald-400 font-mono font-bold mt-0.5">
                  {stats.bestStrategy ? `${stats.bestStrategy.wins}W / ${stats.bestStrategy.losses}L (${stats.bestStrategy.rate.toFixed(0)}%)` : 'SMC Quantum'}
                </span>
              </div>
            </div>
          );

          {/* Section 3: High Impact Enlarged Neural Chart Card */}
          const renderChartSection = () => (
            <div className="bg-zinc-900/70 border border-white/10 rounded-[1.5rem] sm:rounded-[2.5rem] p-3 sm:p-6 shadow-2xl relative overflow-hidden flex flex-col gap-3">
              {/* Asset Selector Bar at Top of Chart */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="h-7 w-7 sm:h-9 sm:w-9 bg-zinc-800 rounded-xl flex items-center justify-center text-rose-500 flex-shrink-0">
                    <ChartIcon size={16} />
                  </div>
                  <div>
                    <h2 className="text-base sm:text-xl font-black text-white tracking-tighter uppercase leading-none">{currentAssetData?.name} Live Chart</h2>
                    <span className="text-[8px] sm:text-[9px] font-mono text-zinc-500">Real-time Candlesticks • Algoritmo SMC</span>
                  </div>
                </div>

                {/* Asset Pill Buttons */}
                <div className="flex gap-1 bg-black/60 p-1 rounded-xl border border-white/5 overflow-x-auto">
                  {ASSETS.map(asset => (
                    <button
                      key={asset.symbol}
                      onClick={() => setActiveAsset(asset.symbol)}
                      className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer ${
                        activeAsset === asset.symbol ? 'bg-white text-black shadow-lg font-bold' : 'text-zinc-400 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      <Coins size={11} style={{ color: activeAsset === asset.symbol ? 'black' : asset.color }} />
                      {asset.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Massive High Definition Chart Container */}
              <div 
                className="h-[520px] sm:h-[620px] md:h-[720px] w-full rounded-2xl overflow-hidden bg-[#09090b] border border-white/5 shadow-2xl relative"
                style={{ backgroundColor: '#09090b', height: '520px', minHeight: '520px', colorScheme: 'dark' }}
              >
                <CandlestickChart 
                  candles={currentCandles}
                  zones={currentZones}
                  activeAssetColor={currentAssetData?.color}
                  activeAssetName={currentAssetData?.name}
                  signals={[...signals, ...history].filter(s => s.asset.toUpperCase() === currentAssetData?.name.toUpperCase() && s.timeframe === activeTF)}
                  currentPrice={currentPrices[activeAsset]}
                  activeTF={activeTF}
                  onTimeframeChange={setActiveTF}
                  countdown={countdown}
                />
              </div>
            </div>
          );

          {/* Section 4: Neural Scanner */}
          const renderScannerSection = () => (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex items-center gap-3">
                  <div className="h-6 w-1 bg-rose-500 rounded-full" />
                  <div>
                    <h2 className="text-xl font-black text-white uppercase tracking-tighter">
                      Neural Scanner
                    </h2>
                    <span className="text-[10px] text-zinc-500 font-mono">
                      Operações de {selectedDate} ({dayHistory.length} total)
                    </span>
                  </div>
                </div>
                
                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                  {/* View scope: current asset vs all assets of day */}
                  <div className="flex gap-1 bg-zinc-950 p-1 rounded-2xl border border-white/5">
                    <button
                      onClick={() => setViewScope('asset')}
                      className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all ${
                        viewScope === 'asset' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-white'
                      }`}
                      title="Exibir apenas o ativo selecionado"
                    >
                      {currentAssetData?.name} ({dayHistory.filter(s => s.asset.toUpperCase() === currentAssetData?.name.toUpperCase()).length})
                    </button>
                    <button
                      onClick={() => setViewScope('all')}
                      className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all ${
                        viewScope === 'all' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-white'
                      }`}
                      title="Exibir todos os ativos do dia sem faltar nada"
                    >
                      Todos os Ativos ({dayHistory.length})
                    </button>
                  </div>

                  {/* Tab Selector */}
                  <div className="flex gap-1 bg-zinc-950 p-1 rounded-2xl border border-white/5">
                    <button
                      onClick={() => setSignalsTab('active')}
                      className={`px-3.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 ${
                        signalsTab === 'active' ? 'bg-rose-500 text-white shadow-lg' : 'text-zinc-500 hover:text-white'
                      }`}
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Ativos ({displayedActiveSignals.length})
                    </button>
                    <button
                      onClick={() => setSignalsTab('resolved')}
                      className={`px-3.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 ${
                        signalsTab === 'resolved' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-white'
                      }`}
                    >
                      Resolvidos ({displayedResolvedSignals.length})
                    </button>
                  </div>
                </div>
              </div>

              <AnimatePresence mode="popLayout">
                {signalsTab === 'active' ? (
                  displayedActiveSignals.length === 0 ? (
                    <motion.div 
                      key="empty-active"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="h-80 bg-zinc-900/10 border-2 border-dashed border-white/5 rounded-[2.5rem] flex flex-col items-center justify-center p-8 text-center w-full"
                    >
                      <div className="relative mb-6">
                        <Activity size={50} className="text-rose-500/20" />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <Cpu size={20} className="text-rose-500/50 animate-pulse" />
                        </div>
                      </div>
                      <h3 className="text-base font-black text-zinc-400 mb-1.5 uppercase">Aguardando gatilho institucional</h3>
                      <p className="text-xs text-zinc-600 max-w-xs font-medium">O motor neural está processando fluxos de liquidez e rejeição de pavio em {activeTF}...</p>
                    </motion.div>
                  ) : (
                    <div key="active-signals-grid" className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
                      {displayedActiveSignals.map((signal, idx) => (
                        <SignalCard key={`${signal.id}-${idx}`} signal={signal} />
                      ))}
                    </div>
                  )
                ) : (
                  displayedResolvedSignals.length === 0 ? (
                    <motion.div 
                      key="empty-resolved"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="h-80 bg-zinc-900/10 border-2 border-dashed border-white/5 rounded-[2.5rem] flex flex-col items-center justify-center p-8 text-center w-full"
                    >
                      <PieChart size={50} className="text-rose-500/20 mb-4" />
                      <h3 className="text-base font-black text-zinc-400 mb-1.5 uppercase">Nenhuma Operação em {selectedDate}</h3>
                      <p className="text-xs text-zinc-600 max-w-xs font-medium">Nenhum sinal encerrado registrado para esta data ({viewScope === 'all' ? 'todos os ativos' : currentAssetData?.name}).</p>
                    </motion.div>
                  ) : (
                    <div key="resolved-signals-grid" className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
                      {displayedResolvedSignals.map((signal, idx) => (
                        <SignalCard key={`${signal.id}-${idx}`} signal={signal} />
                      ))}
                    </div>
                  )
                )}
              </AnimatePresence>
            </div>
          );

          {/* Section 5: Institutional Tools (Soros Simulator & Risk Manager) */}
          const renderToolsSection = () => (
            <div className="space-y-6">
              {/* Sidebar Tabs */}
              <div className="flex bg-zinc-950 p-1 rounded-2xl border border-white/5 w-full">
                <button
                  onClick={() => setSidebarTab('soros')}
                  className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
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
                  className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
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
                      onDownloadReport={handleDownloadActiveReport}
                      onOpenDailyReports={() => setIsDailyReportsModalOpen(true)}
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
            </div>
          );

          {/* Section 6: Protocol History Tracker */}
          const renderHistorySection = () => (
            <div className="bg-zinc-900/80 backdrop-blur-3xl border border-white/10 rounded-[2.5rem] p-5 sm:p-8 shadow-[0_40px_100px_-20px_rgba(0,0,0,0.5)]">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-base sm:text-lg font-black text-white uppercase tracking-tighter flex items-center gap-2.5">
                    <History size={18} className="text-rose-500" />
                    Protocol History
                  </h3>
                  <span className="text-[10px] font-mono text-zinc-500">
                    Dia: {selectedDate} ({dayHistory.length} ops)
                  </span>
                </div>
                <button 
                  onClick={() => setIsDailyReportsModalOpen(true)}
                  className="text-[10px] font-black text-rose-400 hover:text-rose-300 uppercase transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <Download size={11} />
                  Relatórios
                </button>
              </div>

              <div className="space-y-2.5 max-h-[480px] overflow-y-auto pr-1.5 custom-scrollbar">
                {dayHistory.map((item, i) => (
                  <motion.div 
                    key={item.id || i}
                    initial={{ opacity: 0, x: 15 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="p-3.5 bg-black/40 rounded-2xl border border-white/5 flex items-center justify-between hover:bg-black/60 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`h-9 w-9 rounded-xl flex items-center justify-center font-black text-xs ${item.status === 'WIN' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-500 border border-rose-500/20'}`}>
                        {item.status === 'WIN' ? 'W' : 'L'}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-mono font-bold text-zinc-400">{item.asset}</span>
                          <span className="text-[9px] font-mono text-zinc-600">• {item.timeframe}</span>
                          {typeof item.metrics?.wickSize === 'number' && (
                            <span className="text-[8px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1 py-0.2 rounded font-mono font-bold" title="Tamanho do pavio de confirmação institucional">
                              🕯️ {item.metrics.wickSize.toFixed(1)}%
                            </span>
                          )}
                        </div>
                        <span className="text-xs font-black text-white uppercase">{item.type} @ {item.price.toLocaleString()}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className={`text-[10px] font-black block ${item.status === 'WIN' ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {item.status === 'WIN' ? 'WIN (+87%)' : 'LOSS (-100%)'}
                      </span>
                      <span className="text-[9px] text-zinc-600 font-mono">
                        {new Date(item.timestamp || item.expiryTimestamp).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </motion.div>
                ))}
                {dayHistory.length === 0 && (
                  <div className="text-center py-10 opacity-40">
                    <PieChart size={40} className="mx-auto mb-3 text-zinc-600" />
                    <span className="text-[10px] uppercase font-black tracking-widest text-zinc-400 block">Nenhuma operação em {selectedDate}</span>
                    <span className="text-[9px] text-zinc-600 block mt-1">Os sinais finalizados de hoje aparecerão aqui em tempo real.</span>
                  </div>
                )}
              </div>
            </div>
          );

          {/* Section 7: Neural Matrix Stats / Zonas Institucionais */}
          const renderInstitutionalZonesSection = () => (
            <div className="bg-gradient-to-br from-rose-500/10 to-transparent border border-white/5 rounded-[2.5rem] p-5 sm:p-8">
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
          );

          {/* Conditional Views rendering based on activeMainTab */}
          if (activeMainTab === 'chart') {
            return (
              <div className="space-y-4 sm:space-y-6">
                {renderPerformanceStats()}
                {renderChartSection()}

                {/* Live Neural Market Telemetry & Combination Matrix HUD */}
                <NeuralMarketTelemetry 
                  activeAsset={activeAsset}
                  activeTF={activeTF}
                  currentPrice={currentPrices[activeAsset]}
                  assets={ASSETS}
                />
                
                {/* Quick Banner if Active Signals exist in background */}
                {displayedActiveSignals.length > 0 && (
                  <div 
                    onClick={() => setActiveMainTab('signals')}
                    className="p-3.5 sm:p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between gap-3 cursor-pointer hover:bg-emerald-500/15 transition-all shadow-lg"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="relative flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                      </span>
                      <span className="text-xs font-black text-white uppercase tracking-wider">
                        {displayedActiveSignals.length} sinal{displayedActiveSignals.length > 1 ? 'is' : ''} em andamento no scanner
                      </span>
                    </div>
                    <span className="text-[10px] font-black uppercase text-emerald-400 flex items-center gap-1">
                      Ver no Scanner →
                    </span>
                  </div>
                )}
              </div>
            );
          }

          if (activeMainTab === 'signals') {
            return (
              <div className="space-y-4 sm:space-y-6">
                {renderDateNavigator()}
                {renderScannerSection()}
              </div>
            );
          }

          if (activeMainTab === 'tools') {
            return (
              <div className="space-y-4 sm:space-y-6 max-w-2xl mx-auto">
                {renderToolsSection()}
              </div>
            );
          }

          if (activeMainTab === 'history') {
            return (
              <div className="space-y-4 sm:space-y-6">
                {renderDateNavigator()}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
                  {renderHistorySection()}
                  {renderInstitutionalZonesSection()}
                </div>
              </div>
            );
          }

          {/* Fallback & 'all' (Desktop Complete View) */}
          return (
            <div className="space-y-6 sm:space-y-8">
              {renderDateNavigator()}
              {renderPerformanceStats()}

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Neural Chart, Telemetry & Scanner on the Left */}
                <div className="lg:col-span-8 space-y-6 sm:space-y-8">
                  {renderChartSection()}
                  <NeuralMarketTelemetry 
                    activeAsset={activeAsset}
                    activeTF={activeTF}
                    currentPrice={currentPrices[activeAsset]}
                    assets={ASSETS}
                  />
                  {renderScannerSection()}
                </div>

                {/* Institutional Tools, History & Zones on the Right */}
                <div className="lg:col-span-4 space-y-6">
                  {renderToolsSection()}
                  {renderHistorySection()}
                  {renderInstitutionalZonesSection()}
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Universal Fixed Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-zinc-950/95 backdrop-blur-2xl border-t border-white/10 px-3 py-2 shadow-[0_-10px_30px_rgba(0,0,0,0.8)] pb-[max(0.6rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-around gap-2 max-w-xl mx-auto">
          <button
            onClick={() => setActiveMainTab('chart')}
            className={`flex flex-col items-center justify-center flex-1 py-1 px-2 rounded-xl transition-all cursor-pointer ${
              activeMainTab === 'chart' ? 'text-rose-400 font-bold bg-white/5' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <ChartIcon size={20} className={activeMainTab === 'chart' ? 'scale-110 drop-shadow-[0_0_8px_rgba(244,63,94,0.5)]' : ''} />
            <span className="text-[10px] font-black uppercase tracking-tight mt-0.5">Gráfico</span>
          </button>

          <button
            onClick={() => setActiveMainTab('signals')}
            className={`flex flex-col items-center justify-center flex-1 py-1 px-2 rounded-xl transition-all cursor-pointer relative ${
              activeMainTab === 'signals' ? 'text-rose-400 font-bold bg-white/5' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <div className="relative">
              <Target size={20} className={activeMainTab === 'signals' ? 'scale-110 drop-shadow-[0_0_8px_rgba(244,63,94,0.5)]' : ''} />
              {displayedActiveSignals.length > 0 && (
                <span className="absolute -top-1 -right-2 h-4 min-w-4 px-1 rounded-full bg-emerald-400 text-black text-[9px] font-black flex items-center justify-center animate-pulse">
                  {displayedActiveSignals.length}
                </span>
              )}
            </div>
            <span className="text-[10px] font-black uppercase tracking-tight mt-0.5">Sinais</span>
          </button>

          <button
            onClick={() => setActiveMainTab('tools')}
            className={`flex flex-col items-center justify-center flex-1 py-1 px-2 rounded-xl transition-all cursor-pointer ${
              activeMainTab === 'tools' ? 'text-rose-400 font-bold bg-white/5' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Coins size={20} className={activeMainTab === 'tools' ? 'scale-110 drop-shadow-[0_0_8px_rgba(244,63,94,0.5)]' : ''} />
            <span className="text-[10px] font-black uppercase tracking-tight mt-0.5">Área Trader</span>
          </button>

          <button
            onClick={() => setActiveMainTab('history')}
            className={`flex flex-col items-center justify-center flex-1 py-1 px-2 rounded-xl transition-all cursor-pointer ${
              activeMainTab === 'history' ? 'text-rose-400 font-bold bg-white/5' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <History size={20} className={activeMainTab === 'history' ? 'scale-110 drop-shadow-[0_0_8px_rgba(244,63,94,0.5)]' : ''} />
            <span className="text-[10px] font-black uppercase tracking-tight mt-0.5">Histórico</span>
          </button>
        </div>
      </nav>

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

      <DailyReportsModal
        isOpen={isDailyReportsModalOpen}
        onClose={() => setIsDailyReportsModalOpen(false)}
        allSignals={history}
        availableDates={availableDates}
        selectedDate={selectedDate}
        onSelectDate={(d) => {
          setSelectedDate(d);
          setIsDailyReportsModalOpen(false);
        }}
        onSendTelegram={async (text) => {
          const { alertSettings: currentAlerts } = stateRef.current;
          if (currentAlerts.telegramToken && currentAlerts.telegramChatId) {
            try {
              const res = await fetch(`/api/telegram/send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text })
              });
              if (!res.ok) {
                await navigator.clipboard.writeText(text).catch(() => {});
                return { success: false, message: 'Falha no bot. Copiado para área de transferência.' };
              }
              return { success: true, message: 'Relatório enviado ao Telegram com sucesso!' };
            } catch (e) {
              await navigator.clipboard.writeText(text).catch(() => {});
              return { success: false, message: 'Erro de conexão. Copiado!' };
            }
          } else {
            await navigator.clipboard.writeText(text).catch(() => {});
            return { success: true, message: 'Copiado para área de transferência!' };
          }
        }}
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
