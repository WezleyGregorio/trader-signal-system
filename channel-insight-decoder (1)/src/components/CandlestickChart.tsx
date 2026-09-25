import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { 
  createChart, 
  ColorType, 
  IChartApi, 
  ISeriesApi, 
  LineStyle, 
  CandlestickSeries, 
  LineSeries, 
  HistogramSeries 
} from 'lightweight-charts';
import { 
  Maximize2, 
  Minimize2, 
  ChevronDown, 
  ChevronUp, 
  Clock, 
  TrendingUp, 
  TrendingDown,
  Sparkles
} from 'lucide-react';
import { Candle, Zone, Signal, Timeframe } from '../types';

interface CandlestickChartProps {
  candles: Candle[];
  zones: Zone[];
  activeAssetColor?: string;
  activeAssetName?: string;
  signals?: Signal[];
  currentPrice?: number;
  activeTF?: Timeframe;
  onTimeframeChange?: (tf: Timeframe) => void;
  countdown?: string;
}

function calculateEMA(data: any[], period: number) {
  if (!data || data.length === 0) return [];
  const k = 2 / (period + 1);
  let ema = data[0].close;
  const result = [];
  for (let i = 0; i < data.length; i++) {
    ema = (data[i].close - ema) * k + ema;
    result.push({ time: data[i].time, value: ema });
  }
  return result;
}

export function formatPriceBR(price: number): string {
  if (typeof price !== 'number' || isNaN(price)) return '0,00';
  if (price < 1) {
    return price.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 5 });
  }
  if (price < 10) {
    return price.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  }
  return price.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function CandlestickChart({ 
  candles, 
  zones, 
  activeAssetColor = '#f43f5e', 
  activeAssetName, 
  signals = [],
  currentPrice,
  activeTF,
  onTimeframeChange,
  countdown
}: CandlestickChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const emaSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  
  const priceLinesRef = useRef<any[]>([]);
  const activeSignalPriceLineRef = useRef<any>(null);
  
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isHudCollapsed, setIsHudCollapsed] = useState(false);
  const [nowTimestamp, setNowTimestamp] = useState<number>(Date.now());
  const hasFittedRef = useRef<string | null>(null);

  // Keep references for event callbacks
  const latestDataRef = useRef({ candles, signals, activeTF, currentPrice });
  useEffect(() => {
    latestDataRef.current = { candles, signals, activeTF, currentPrice };
  });

  // Track active pending signal for the live HUD
  const activeSignal = useMemo(() => {
    return signals.find(s => s.status === 'PENDING') || null;
  }, [signals]);

  // Update clock ticker every second for countdown and live HUD
  useEffect(() => {
    const timer = setInterval(() => {
      setNowTimestamp(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(err => {
        console.warn(`Error attempting to enable fullscreen: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Draw High-Precision Luminous Overlays directly on candle at exact price & time
  const drawLuminousOverlays = useCallback(() => {
    const canvas = overlayCanvasRef.current;
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!canvas || !chart || !series) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = chartContainerRef.current?.getBoundingClientRect();
    const width = rect?.width || canvas.clientWidth || 300;
    const height = rect?.height || canvas.clientHeight || 500;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const { candles: curCandles, signals: curSignals, activeTF: curTF } = latestDataRef.current;
    if (!curCandles || curCandles.length === 0 || !curSignals || curSignals.length === 0) {
      ctx.restore();
      return;
    }

    const timeScale = chart.timeScale();
    const tfSec = curTF === 'M15' ? 900 : curTF === 'M5' ? 300 : 60;
    const candleTimes = curCandles.map(c => Math.floor(c.timestamp / 1000)).sort((a, b) => a - b);
    const lastCandleTime = candleTimes[candleTimes.length - 1];

    curSignals.forEach(sig => {
      if (!sig || typeof sig.price !== 'number' || isNaN(sig.price)) return;

      // Find candle timestamp
      let candSec: number | null = null;
      if (typeof sig.candleTimestamp === 'number' && sig.candleTimestamp > 0) {
        candSec = Math.floor(sig.candleTimestamp / 1000);
      } else if (sig.id) {
        const match = sig.id.match(/-(\d{10,13})-/);
        if (match) candSec = Math.floor(Number(match[1]) / 1000);
      }
      if (!candSec && typeof sig.timestamp === 'number') {
        candSec = Math.floor(sig.timestamp / 1000);
      }
      if (!candSec && typeof sig.expiryTimestamp === 'number') {
        candSec = Math.floor(sig.expiryTimestamp / 1000) - tfSec;
      }

      let targetTime: number | null = null;
      if (sig.status === 'PENDING') {
        targetTime = lastCandleTime;
      } else if (candSec !== null) {
        const tfAlignedSec = Math.floor(candSec / tfSec) * tfSec;
        if (candleTimes.includes(candSec)) {
          targetTime = candSec;
        } else if (candleTimes.includes(tfAlignedSec)) {
          targetTime = tfAlignedSec;
        } else {
          let minDiff = Infinity;
          for (const ct of candleTimes) {
            const diff = Math.abs(ct - candSec);
            if (diff < minDiff && diff <= tfSec * 1.5) {
              minDiff = diff;
              targetTime = ct;
            }
          }
        }
      }

      if (targetTime === null) return;

      const x = timeScale.timeToCoordinate(targetTime as any);
      const y = series.priceToCoordinate(sig.price);

      if (x === null || y === null || isNaN(x) || isNaN(y) || x < -80 || x > width + 80 || y < -50 || y > height + 50) {
        return;
      }

      const isCall = sig.type === 'CALL';
      const isWin = sig.status === 'WIN';
      const isLoss = sig.status === 'LOSS';
      const isPending = sig.status === 'PENDING';

      const neonColor = isCall ? '#00ff88' : '#ff0055';
      const glowColor = isCall ? 'rgba(0, 255, 136, 0.45)' : 'rgba(255, 0, 85, 0.45)';
      const solidColor = isCall ? '#10b981' : '#f43f5e';

      // 1. TRAÇO LUMINOUS NO LUGAR REAL DO CANDLE (Horizontal Glowing Laser across the candle)
      const lineLeft = x - 28;
      const lineRight = x + 38;

      // Outer Neon Glow
      ctx.beginPath();
      ctx.moveTo(lineLeft, y);
      ctx.lineTo(lineRight, y);
      ctx.lineWidth = 5;
      ctx.strokeStyle = glowColor;
      ctx.lineCap = 'round';
      ctx.stroke();

      // Sharp Core Neon
      ctx.beginPath();
      ctx.moveTo(lineLeft, y);
      ctx.lineTo(lineRight, y);
      ctx.lineWidth = 2;
      ctx.strokeStyle = neonColor;
      ctx.lineCap = 'round';
      ctx.stroke();

      // White Center Hot Laser
      ctx.beginPath();
      ctx.moveTo(lineLeft + 6, y);
      ctx.lineTo(lineRight - 6, y);
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      // 2. PONTO DE IMPACTO REAL (Exact Touch Dot on Candle)
      ctx.beginPath();
      ctx.arc(x, y, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = neonColor;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();

      // 3. SETA LUMINOSA (Nem acima nem abaixo, cravada no candle apontando para o ponto exato da entrada)
      const arrowX = x - 18;
      const arrowY = isCall ? y + 14 : y - 14;
      const arrowTargetY = isCall ? y + 2 : y - 2;

      ctx.beginPath();
      ctx.moveTo(arrowX, arrowY);
      ctx.lineTo(arrowX, arrowTargetY);
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = neonColor;
      ctx.stroke();

      // Arrow Head pointing right at the entry price
      ctx.beginPath();
      if (isCall) {
        ctx.moveTo(arrowX - 4, arrowTargetY + 5);
        ctx.lineTo(arrowX, arrowTargetY);
        ctx.lineTo(arrowX + 4, arrowTargetY + 5);
      } else {
        ctx.moveTo(arrowX - 4, arrowTargetY - 5);
        ctx.lineTo(arrowX, arrowTargetY);
        ctx.lineTo(arrowX + 4, arrowTargetY - 5);
      }
      ctx.fillStyle = neonColor;
      ctx.fill();

      // 4. ETIQUETA / BADGE LUMINOSA COM PREÇO E RESULTADO
      const badgeText = `${sig.type} $${formatPriceBR(sig.price)} ${isWin ? '✅ WIN' : isLoss ? '❌ LOSS' : '⚡ AO VIVO'}`;
      ctx.font = 'bold 9px JetBrains Mono, monospace';
      const textWidth = ctx.measureText(badgeText).width;
      const badgeX = x + 10;
      const badgeY = y - 10;
      const badgeW = textWidth + 10;
      const badgeH = 18;

      // Dark glass container with neon border
      ctx.fillStyle = 'rgba(9, 9, 11, 0.90)';
      ctx.strokeStyle = isWin ? 'rgba(16, 185, 129, 0.8)' : isLoss ? 'rgba(244, 63, 94, 0.8)' : neonColor;
      ctx.lineWidth = 1.2;

      // Rounded rectangle
      ctx.beginPath();
      ctx.roundRect(badgeX, badgeY - 9, badgeW, badgeH, 4);
      ctx.fill();
      ctx.stroke();

      // Badge Text
      ctx.fillStyle = isWin ? '#34d399' : isLoss ? '#fb7185' : '#ffffff';
      ctx.fillText(badgeText, badgeX + 5, badgeY + 3);
    });

    ctx.restore();
  }, []);

  // Initialize Chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const rect = chartContainerRef.current.getBoundingClientRect();
    const initialWidth = Math.max(300, rect.width || chartContainerRef.current.clientWidth || window.innerWidth - 32);
    const initialHeight = Math.max(480, rect.height || chartContainerRef.current.clientHeight || 520);

    const chart = createChart(chartContainerRef.current, {
      width: initialWidth,
      height: initialHeight,
      autoSize: false,
      layout: {
        background: { type: ColorType.Solid, color: '#09090b' },
        textColor: '#a1a1aa',
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.03)', style: LineStyle.Dotted },
        horzLines: { color: 'rgba(255, 255, 255, 0.03)', style: LineStyle.Dotted },
      },
      crosshair: {
        mode: 1,
        vertLine: {
          color: 'rgba(255, 255, 255, 0.25)',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: '#18181b',
        },
        horzLine: {
          color: 'rgba(255, 255, 255, 0.25)',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: '#18181b',
        },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        barSpacing: 8,
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
        scaleMargins: {
          top: 0.10,
          bottom: 0.10,
        },
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
      watermark: {
        visible: true,
        fontSize: 16,
        fontFamily: 'JetBrains Mono, ui-monospace, monospace',
        color: 'rgba(255, 255, 255, 0.03)',
        text: '⚡ SMC QUANTUM PRO • MULTI-TF',
        horzAlign: 'center',
        vertAlign: 'center',
      },
    } as any);

    chartRef.current = chart;

    // Create Candlestick Series
    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#0ecb81',
      downColor: '#f6465d',
      borderVisible: false,
      wickUpColor: '#0ecb81',
      wickDownColor: '#f6465d',
    });
    seriesRef.current = candlestickSeries;

    // Create EMA Series
    const emaSeries = chart.addSeries(LineSeries, {
      color: '#3b82f6',
      lineWidth: 1,
      lineStyle: LineStyle.Solid,
      crosshairMarkerVisible: false,
      lastValueVisible: false,
      priceLineVisible: false,
    });
    emaSeriesRef.current = emaSeries;

    // Create Volume Series (Histogram) at the bottom
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: {
        type: 'volume',
      },
      priceScaleId: 'volume_scale',
      lastValueVisible: false,
      priceLineVisible: false,
    });
    volumeSeriesRef.current = volumeSeries;

    chart.priceScale('volume_scale').applyOptions({
      visible: false,
      scaleMargins: {
        top: 0.88,
        bottom: 0,
      },
    });

    // Subscribe to chart zoom, scroll and range change to synchronize luminous overlays instantly
    chart.timeScale().subscribeVisibleLogicalRangeChange(() => {
      drawLuminousOverlays();
    });
    chart.timeScale().subscribeVisibleTimeRangeChange(() => {
      drawLuminousOverlays();
    });

    const updateDimensions = () => {
      if (chartContainerRef.current && chartRef.current) {
        const rect = chartContainerRef.current.getBoundingClientRect();
        const w = Math.max(300, rect.width || chartContainerRef.current.clientWidth || window.innerWidth - 32);
        const h = Math.max(480, rect.height || chartContainerRef.current.clientHeight || 520);
        chartRef.current.applyOptions({ width: w, height: h });
        drawLuminousOverlays();
      }
    };

    const resizeObserver = new ResizeObserver(() => {
      updateDimensions();
    });

    resizeObserver.observe(chartContainerRef.current);
    window.addEventListener('resize', updateDimensions);
    window.addEventListener('orientationchange', updateDimensions);

    const t1 = setTimeout(updateDimensions, 50);
    const t2 = setTimeout(updateDimensions, 250);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener('resize', updateDimensions);
      window.removeEventListener('orientationchange', updateDimensions);
      resizeObserver.disconnect();
      chart.remove();
    };
  }, [drawLuminousOverlays]);

  // Update Data when props change
  useEffect(() => {
    if (!seriesRef.current || !candles || !candles.length) return;

    // Clean and sort candles
    const sortedCandles = [...candles]
      .filter(c => c && typeof c.close === 'number' && c.close > 0 && typeof c.timestamp === 'number')
      .sort((a, b) => a.timestamp - b.timestamp)
      .map(c => ({
        time: Math.floor(c.timestamp / 1000) as any,
        open: typeof c.open === 'number' && c.open > 0 ? c.open : c.close,
        high: typeof c.high === 'number' && c.high > 0 ? c.high : c.close,
        low: typeof c.low === 'number' && c.low > 0 ? c.low : c.close,
        close: c.close,
        volume: typeof c.volume === 'number' && c.volume >= 0 ? c.volume : 0,
      }));

    // Deduplicate candles
    const uniqueCandles: any[] = [];
    const seenTimes = new Set();
    for (const c of sortedCandles) {
      if (!seenTimes.has(c.time)) {
        seenTimes.add(c.time);
        uniqueCandles.push(c);
      }
    }

    if (uniqueCandles.length === 0) return;

    try {
      seriesRef.current.setData(uniqueCandles);
      
      // EMA 200
      const emaData = calculateEMA(uniqueCandles, 200);
      emaSeriesRef.current?.setData(emaData);

      // Volume Overlay
      if (volumeSeriesRef.current) {
        const volumeData = uniqueCandles.map(c => ({
          time: c.time,
          value: c.volume || 10,
          color: c.close >= c.open ? 'rgba(14, 203, 129, 0.28)' : 'rgba(246, 70, 93, 0.28)',
        }));
        volumeSeriesRef.current.setData(volumeData);
      }

      // Auto-fit content on initial data load for this asset
      if (hasFittedRef.current !== activeAssetName && uniqueCandles.length > 0) {
        hasFittedRef.current = activeAssetName || 'DEFAULT';
        chartRef.current?.timeScale().fitContent();
      }

      // Redraw custom luminous overlays on candle at exact price level
      drawLuminousOverlays();
    } catch (e) {
      console.warn("Could not set chart data", e);
    }

    if (chartRef.current && activeAssetName) {
      chartRef.current.applyOptions({
        watermark: {
          text: `⚡ SMC QUANTUM PRO • ${activeAssetName.toUpperCase()}`,
        }
      });
    }
  }, [candles, signals, activeAssetName, currentPrice, activeTF, drawLuminousOverlays]);

  // Zone Price Lines and Active Entry Line (Native Luminous Price Lines)
  useEffect(() => {
    if (!seriesRef.current) return;

    // Clear old zone price lines
    priceLinesRef.current.forEach(line => {
      try {
        seriesRef.current?.removePriceLine(line);
      } catch (e) {
        // Ignore
      }
    });
    priceLinesRef.current = [];

    // Clear old active signal price line
    if (activeSignalPriceLineRef.current) {
      try {
        seriesRef.current?.removePriceLine(activeSignalPriceLineRef.current);
      } catch (e) {
        // Ignore
      }
      activeSignalPriceLineRef.current = null;
    }

    // 1. Render Institutional Luminous Zone Price Lines
    zones.forEach(zone => {
      try {
        const isSupport = zone.type === 'SUPPORT';
        const isOB = !!zone.isOrderBlock;
        
        const neonColor = isOB 
          ? 'rgba(245, 158, 11, 0.85)' 
          : (isSupport ? 'rgba(16, 185, 129, 0.75)' : 'rgba(244, 63, 94, 0.75)');

        const line = seriesRef.current?.createPriceLine({
          price: zone.price,
          color: neonColor,
          lineWidth: isOB ? 2 : 1,
          lineStyle: isOB ? LineStyle.Solid : LineStyle.Dashed,
          axisLabelVisible: true,
          title: isOB 
            ? `⚡ OB ${isSupport ? 'SUP' : 'RES'} (${zone.strength || zone.hits}x)` 
            : `📍 ${isSupport ? 'SUP' : 'RES'} (${zone.strength || zone.hits}x)`,
        });
        if (line) priceLinesRef.current.push(line);
      } catch (e) {
        // Ignore
      }
    });

    // 2. Render Active Entry Luminous Price Line (Native High-Visibility Traço Luminous)
    if (activeSignal) {
      try {
        const isCall = activeSignal.type === 'CALL';
        const luminousColor = isCall ? '#00ff88' : '#ff0055';
        
        const activeLine = seriesRef.current?.createPriceLine({
          price: activeSignal.price,
          color: luminousColor,
          lineWidth: 2,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          title: `🎯 ${activeSignal.type} ${activeSignal.timeframe} @ $${formatPriceBR(activeSignal.price)}`,
        });
        activeSignalPriceLineRef.current = activeLine;
      } catch (e) {
        // Ignore
      }
    }

    drawLuminousOverlays();
  }, [zones, activeSignal, drawLuminousOverlays]);

  // Compute live HUD metrics for the active pending signal
  const hudData = useMemo(() => {
    if (!activeSignal) return null;

    const isCall = activeSignal.type === 'CALL';
    const latestCandle = candles && candles.length > 0 ? candles[candles.length - 1] : null;
    const curPrice = currentPrice || (latestCandle ? latestCandle.close : activeSignal.price);
    
    const diff = curPrice - activeSignal.price;
    const isWinning = isCall ? diff > 0 : diff < 0;
    const diffPercent = activeSignal.price > 0 ? Math.abs((diff / activeSignal.price) * 100) : 0;
    
    const tfMs = activeSignal.timeframe === 'M15' ? 900000 : activeSignal.timeframe === 'M5' ? 300000 : 60000;
    const remainingMs = Math.max(0, activeSignal.expiryTimestamp - nowTimestamp);
    const totalDurationMs = activeSignal.expiryTimestamp - activeSignal.timestamp;
    const validDuration = totalDurationMs > 0 ? totalDurationMs : tfMs;
    const progressPercent = Math.min(100, Math.max(0, ((validDuration - remainingMs) / validDuration) * 100));
    
    const remSec = Math.floor(remainingMs / 1000);
    const m = Math.floor(remSec / 60);
    const s = remSec % 60;
    const countdownStr = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;

    return {
      isCall,
      curPrice,
      diff,
      diffPercent,
      isWinning,
      countdownStr,
      progressPercent,
      remainingMs,
    };
  }, [activeSignal, currentPrice, candles, nowTimestamp]);

  return (
    <div 
      ref={containerRef}
      className="relative w-full h-full rounded-2xl overflow-hidden bg-[#09090b] border border-white/5 shadow-2xl" 
      id="neural-candlestick-chart"
      style={{ width: '100%', height: '100%', minHeight: '480px', backgroundColor: '#09090b', colorScheme: 'dark' }}
    >
      {/* Lightweight-Charts Core Container */}
      <div 
        ref={chartContainerRef} 
        className="w-full h-full relative bg-[#09090b]" 
        style={{ width: '100%', height: '100%', minHeight: '480px', backgroundColor: '#09090b', colorScheme: 'dark' }}
      />

      {/* Synchronized Precision Luminous Overlay Canvas */}
      <canvas 
        ref={overlayCanvasRef}
        className="absolute inset-0 pointer-events-none z-10"
        style={{ width: '100%', height: '100%' }}
      />

      {/* Fullscreen Toggle Button */}
      <button 
        onClick={toggleFullscreen}
        className="absolute bottom-3 right-3 p-2 bg-black/60 hover:bg-black/80 backdrop-blur-md rounded-lg border border-white/10 text-zinc-400 hover:text-white transition-all z-20 cursor-pointer"
        title="Alternar Tela Cheia"
      >
        {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
      </button>

      {/* Loading Overlay */}
      {candles.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950/80 rounded-2xl border border-white/5 space-y-3 z-20">
          <div className="h-8 w-8 border-4 border-rose-500/20 border-t-rose-500 rounded-full animate-spin" />
          <span className="text-xs font-black uppercase text-zinc-400 tracking-widest font-mono">
            Carregando velas institucionais...
          </span>
        </div>
      )}

      {candles.length > 0 && (
        <>
          {/* Floating Legend Accent & Timeframe Switcher at Top of Chart */}
          <div className="absolute top-3 left-3 right-3 sm:right-auto flex flex-wrap items-center justify-between sm:justify-start gap-2 z-20 pointer-events-auto">
            <div className="flex items-center gap-2 bg-black/85 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10 select-none shadow-xl">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_#10b981]" />
              <span className="text-[10px] font-black uppercase text-zinc-300 font-mono tracking-wider flex items-center gap-1.5">
                <span>{activeAssetName || 'CRYPTO'}</span>
                <span className="text-zinc-600">•</span>
                <span className="text-emerald-400 font-black">
                  {candles && candles.length > 0 ? `$${formatPriceBR(candles[candles.length - 1].close)}` : 'CONECTANDO...'}
                </span>
              </span>
            </div>

            {/* Timeframe Controls directly inside the top of the chart */}
            {onTimeframeChange && (
              <div className="flex items-center gap-1 bg-black/85 backdrop-blur-md p-1 rounded-xl border border-white/10 shadow-xl">
                {(['M5', 'M15'] as Timeframe[]).map(tf => (
                  <button
                    key={tf}
                    onClick={() => onTimeframeChange(tf)}
                    className={`px-3 py-1 rounded-lg text-[9px] font-mono font-black transition-all cursor-pointer ${
                      activeTF === tf 
                        ? 'bg-rose-500 text-white shadow-md font-bold' 
                        : 'text-zinc-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {tf}
                  </button>
                ))}
                {countdown && (
                  <span className="text-[9px] font-mono font-bold text-rose-400 px-2 py-0.5 bg-rose-500/10 rounded-md border border-rose-500/20 flex items-center gap-1">
                    <Clock size={10} className="animate-pulse" />
                    <span>{countdown}</span>
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Active Signal Floating Live HUD */}
          {activeSignal && hudData && (
            <div className="absolute top-14 left-3 z-20 pointer-events-auto transition-all duration-300 max-w-[280px] sm:max-w-xs">
              <div className={`backdrop-blur-xl border rounded-2xl shadow-2xl overflow-hidden transition-all duration-300 ${
                hudData.isWinning 
                  ? 'bg-zinc-950/90 border-emerald-500/40 shadow-emerald-950/30' 
                  : 'bg-zinc-950/90 border-rose-500/40 shadow-rose-950/30'
              }`}>
                {/* HUD Header Bar */}
                <div className="px-3 py-2 bg-white/[0.03] border-b border-white/5 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="relative flex h-2 w-2">
                      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${hudData.isCall ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                      <span className={`relative inline-flex rounded-full h-2 w-2 ${hudData.isCall ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                    </span>
                    <span className="text-[9px] font-black uppercase tracking-wider text-zinc-200">
                      🎯 ENTRADA AO VIVO
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className={`px-1.5 py-0.5 rounded text-[8px] font-mono font-black ${
                      hudData.isCall ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                    }`}>
                      {activeSignal.type} {activeSignal.timeframe}
                    </span>
                    <button 
                      onClick={() => setIsHudCollapsed(!isHudCollapsed)}
                      className="text-zinc-400 hover:text-white p-0.5 rounded hover:bg-white/10 transition-colors cursor-pointer"
                      title={isHudCollapsed ? "Expandir HUD" : "Recolher HUD"}
                    >
                      {isHudCollapsed ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
                    </button>
                  </div>
                </div>

                {/* HUD Body */}
                {!isHudCollapsed && (
                  <div className="p-3 space-y-2.5">
                    <div className="flex items-center justify-between text-xs">
                      <div>
                        <span className="text-[8px] uppercase tracking-wider text-zinc-500 font-mono block">Taxa de Entrada</span>
                        <span className="font-mono font-black text-white">${formatPriceBR(activeSignal.price)}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[8px] uppercase tracking-wider text-zinc-500 font-mono block">Taxa Atual</span>
                        <span className={`font-mono font-black ${hudData.isWinning ? 'text-emerald-400' : 'text-rose-400'}`}>
                          ${formatPriceBR(hudData.curPrice)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-white/5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] text-zinc-400 font-mono">Status:</span>
                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded font-mono ${
                          hudData.isWinning ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                        }`}>
                          {hudData.isWinning ? '🟢 VENCENDO' : '🔴 PERDENDO'} ({hudData.diffPercent.toFixed(2)}%)
                        </span>
                      </div>
                      <div className="text-right font-mono text-[9px] font-bold text-amber-400 flex items-center gap-1">
                        <Clock size={10} />
                        <span>{hudData.countdownStr}</span>
                      </div>
                    </div>

                    {/* Progress Bar for Expiration */}
                    <div className="w-full bg-zinc-900 rounded-full h-1 overflow-hidden">
                      <div 
                        className={`h-full transition-all duration-300 ${hudData.isWinning ? 'bg-emerald-500' : 'bg-rose-500'}`}
                        style={{ width: `${hudData.progressPercent}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
