import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, IChartApi, ISeriesApi, PriceLineOptions, LineStyle, CandlestickSeries, SeriesMarker, Time, LineSeries, HistogramSeries, createSeriesMarkers } from 'lightweight-charts';
import { Maximize2, Minimize2 } from 'lucide-react';
import { Candle, Zone, Signal } from '../types';

interface CandlestickChartProps {
  candles: Candle[];
  zones: Zone[];
  activeAssetColor?: string;
  activeAssetName?: string;
  signals?: Signal[];
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

export function CandlestickChart({ candles, zones, activeAssetColor = '#f43f5e', activeAssetName, signals = [] }: CandlestickChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const emaSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const markersPluginRef = useRef<any>(null);
  const priceLinesRef = useRef<any[]>([]);
  const pulseIntervalRef = useRef<any>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

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

  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Initialize Chart with a highly professional theme
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#a1a1aa', // zinc-400
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.03)', style: LineStyle.Dotted },
        horzLines: { color: 'rgba(255, 255, 255, 0.03)', style: LineStyle.Dotted },
      },
      crosshair: {
        mode: 1, // Normal mode
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
        fontSize: 18,
        fontFamily: 'JetBrains Mono, ui-monospace, monospace',
        color: 'rgba(255, 255, 255, 0.04)',
        text: '⚡ SMC QUANTUM PRO • MULTI-TF',
        horzAlign: 'center',
        vertAlign: 'center',
      },
    } as any);

    chartRef.current = chart;

    // Create Candlestick Series using ultra polished colors
    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#0ecb81', // classic Binance green
      downColor: '#f6465d', // classic Binance red
      borderVisible: false,
      wickUpColor: '#0ecb81',
      wickDownColor: '#f6465d',
    });

    seriesRef.current = candlestickSeries;

    // Create EMA Series
    const emaSeries = chart.addSeries(LineSeries, {
      color: '#3b82f6', // bright energetic blue
      lineWidth: 1,
      lineStyle: LineStyle.Solid,
      crosshairMarkerVisible: false,
      lastValueVisible: false,
      priceLineVisible: false,
    });
    emaSeriesRef.current = emaSeries;

    // Create Overlaid Volume Series (Histogram) at the bottom
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: {
        type: 'volume',
      },
      priceScaleId: 'volume_scale',
      lastValueVisible: false,
      priceLineVisible: false,
    });
    volumeSeriesRef.current = volumeSeries;

    // Position volume scale at the bottom 18% of the chart and hide its vertical y-axis scale
    chart.priceScale('volume_scale').applyOptions({
      visible: false,
      scaleMargins: {
        top: 0.82,
        bottom: 0,
      },
    });

    const resizeObserver = new ResizeObserver(() => {
      if (chartContainerRef.current) {
        const { clientWidth, clientHeight } = chartContainerRef.current;
        if (clientWidth > 0 && clientHeight > 0) {
          chart.applyOptions({ width: clientWidth, height: clientHeight });
        }
      }
    });

    resizeObserver.observe(chartContainerRef.current);

    // Initial size
    if (chartContainerRef.current) {
      const { clientWidth, clientHeight } = chartContainerRef.current;
      if (clientWidth > 0 && clientHeight > 0) {
        chart.applyOptions({ width: clientWidth, height: clientHeight });
      }
    }

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      markersPluginRef.current = null;
    };
  }, []);

  // Update Data and Zones when props change
  useEffect(() => {
    if (!seriesRef.current || !candles.length) return;

    if (pulseIntervalRef.current) {
      clearInterval(pulseIntervalRef.current);
      pulseIntervalRef.current = null;
    }

    // Make sure timestamps are in increasing order and no duplicates, and filter out invalid/corrupt candles
    const sortedCandles = [...candles]
      .filter(c => c && typeof c.close === 'number' && c.close > 0 && typeof c.timestamp === 'number')
      .sort((a, b) => a.timestamp - b.timestamp)
      .map(c => {
        return {
          time: Math.floor(c.timestamp / 1000) as any,
          open: typeof c.open === 'number' && c.open > 0 ? c.open : c.close,
          high: typeof c.high === 'number' && c.high > 0 ? c.high : c.close,
          low: typeof c.low === 'number' && c.low > 0 ? c.low : c.close,
          close: c.close,
          volume: typeof c.volume === 'number' && c.volume >= 0 ? c.volume : 0,
        };
      });

    // Remove duplicates based on time
    const uniqueCandles: any[] = [];
    const seenTimes = new Set();
    for (const c of sortedCandles) {
        if (!seenTimes.has(c.time)) {
            seenTimes.add(c.time);
            uniqueCandles.push(c);
        }
    }

    try {
        seriesRef.current.setData(uniqueCandles);
        
        // EMA 200 setup
        const emaData = calculateEMA(uniqueCandles, 200);
        emaSeriesRef.current.setData(emaData);

        // Volume Overlay setup
        if (volumeSeriesRef.current) {
          const volumeData = uniqueCandles.map(c => {
            const bullish = c.close >= c.open;
            return {
              time: c.time,
              value: c.volume || 10,
              color: bullish ? 'rgba(14, 203, 129, 0.28)' : 'rgba(246, 70, 93, 0.28)',
            };
          });
          volumeSeriesRef.current.setData(volumeData);
        }
    } catch (e) {
        console.warn("Could not set chart data", e);
    }

    // Add markers for Signals
    const markers: SeriesMarker<Time>[] = [];
    const usedTimes = new Set<number>();
    
    // Sort signals by time
    const sortedSignals = [...signals].sort((a, b) => a.timestamp - b.timestamp);
    
    // Create a set of valid candle times for quick lookup
    const validCandleTimes = sortedCandles.map(c => c.time as number);
    
    for (const sig of sortedSignals) {
      const tfMs = sig.timeframe === 'M15' ? 900000 : sig.timeframe === 'M5' ? 300000 : 60000;
      let sigTime = Math.floor((sig.expiryTimestamp - tfMs) / 1000);
      
      // Fallback: If the exact candle time isn't found (e.g. gap in data), snap to nearest
      if (!validCandleTimes.includes(sigTime) && validCandleTimes.length > 0) {
        let closest = validCandleTimes[0];
        let minDiff = Math.abs(closest - sigTime);
        for (const t of validCandleTimes) {
          const diff = Math.abs(t - sigTime);
          if (diff < minDiff) {
            minDiff = diff;
            closest = t;
          }
        }
        sigTime = closest;
      }
      
      // Lightweight charts only allows one marker per time
      if (usedTimes.has(sigTime)) continue;
      usedTimes.add(sigTime);
      
      let formattedPrice = sig.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 5 });
      let text = `${sig.type === 'CALL' ? 'CALL' : 'PUT'} @ ${formattedPrice}`;
      
      // Match signal with zone to get wins/losses count
      const matchingZone = zones.find(z => Math.abs(z.price - sig.price) / z.price < 0.001);
      
      if (sig.status === 'WIN') {
        text += ' (WIN)';
        if (matchingZone && matchingZone.wins > 0) {
          text += ` 🏆 ${matchingZone.wins}`;
        }
      } else if (sig.status === 'LOSS') {
        text += ' (LOSS)';
        if (matchingZone && matchingZone.losses > 0) {
          text += ` 💀 ${matchingZone.losses}`;
        }
      } else {
        text += ' (PENDING)';
      }

      let markerColor = sig.type === 'CALL' ? '#10b981' : '#f43f5e';

      markers.push({
        time: sigTime as any,
        position: sig.type === 'CALL' ? 'belowBar' : 'aboveBar',
        color: markerColor,
        shape: sig.type === 'CALL' ? 'arrowUp' : 'arrowDown',
        text: text,
      });
    }

    try {
      if (!markersPluginRef.current && seriesRef.current) {
        markersPluginRef.current = createSeriesMarkers(seriesRef.current, []);
      }
      if (markersPluginRef.current) {
        markersPluginRef.current.setMarkers(markers);
      }
    } catch (e) {
      console.warn("Could not set markers", e);
    }

    if (chartRef.current && activeAssetName) {
      chartRef.current.applyOptions({
        watermark: {
          text: `⚡ SMC QUANTUM PRO • ${activeAssetName.toUpperCase()}`,
        }
      });
    }

  }, [candles, signals, activeAssetName]);

  // Separate effect specifically for rendering zones and pulsing them
  useEffect(() => {
    if (!seriesRef.current) return;

    if (pulseIntervalRef.current) {
      clearInterval(pulseIntervalRef.current);
      pulseIntervalRef.current = null;
    }

    // Clear old price lines
    priceLinesRef.current.forEach(line => {
      try {
        seriesRef.current?.removePriceLine(line);
      } catch (e) {
        // Ignore if already removed
      }
    });
    priceLinesRef.current = [];

    // Add new zones as price lines
    zones.forEach(zone => {
      const isSupport = zone.type === 'SUPPORT';
      const baseColor = isSupport ? '14, 203, 129' : '246, 70, 93';
      const color = `rgba(${baseColor}, 0.4)`;
      
      const priceLineOptions: PriceLineOptions = {
        price: zone.price,
        color: color,
        lineWidth: zone.isOrderBlock ? 2 : 1,
        lineStyle: zone.isOrderBlock ? LineStyle.Solid : LineStyle.Dashed,
        axisLabelVisible: true,
        title: `${isSupport ? 'SUP' : 'RES'}${zone.isOrderBlock ? ' OB' : ''} $${zone.price.toLocaleString(undefined, { maximumFractionDigits: 1 })}`,
        lineVisible: true,
        axisLabelColor: color,
        axisLabelTextColor: '#ffffff',
      };

      try {
        const prLine = seriesRef.current?.createPriceLine(priceLineOptions);
        if (prLine) {
          priceLinesRef.current.push(prLine);
        }
      } catch (e) {
        console.warn("Could not create price line", e);
      }
    });

    // Start pulsing support and resistance zones smoothly (TradingView Style)
    let pulseAngle = 0;
    pulseIntervalRef.current = setInterval(() => {
      pulseAngle += 0.12;
      // Breathe between 0.18 and 0.52 for dynamic lines
      const alpha = 0.35 + Math.sin(pulseAngle) * 0.17;
      priceLinesRef.current.forEach((line, index) => {
        const zone = zones[index];
        if (!zone) return;
        const isSupport = zone.type === 'SUPPORT';
        const baseColor = isSupport ? '14, 203, 129' : '246, 70, 93';
        const lineColor = `rgba(${baseColor}, ${alpha})`;
        try {
          line.applyOptions({
            color: lineColor,
            axisLabelColor: `rgba(${baseColor}, ${alpha + 0.3})`,
          });
        } catch (e) {
          // Ignore disposed line errors
        }
      });
    }, 110);

    return () => {
      if (pulseIntervalRef.current) {
        clearInterval(pulseIntervalRef.current);
        pulseIntervalRef.current = null;
      }
    };
  }, [zones]);

  // When activeAssetColor changes, maybe we can tint the chart background slightly
  // or just let it go. We'll leave it transparent for pure appearance.

  return (
    <div 
      ref={containerRef}
      className={`relative h-full w-full rounded-2xl overflow-hidden ${isFullscreen ? 'bg-[#09090b]' : ''}`} 
      id="neural-candlestick-chart"
    >
      <div ref={chartContainerRef} className="absolute inset-0" />
      
      {/* Fullscreen Toggle Button */}
      <button 
        onClick={toggleFullscreen}
        className="absolute bottom-3 right-3 p-2 bg-black/60 hover:bg-black/80 backdrop-blur-md rounded-lg border border-white/10 text-zinc-400 hover:text-white transition-all z-20"
        title="Toggle Fullscreen"
      >
        {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
      </button>

      {/* Sincronizando overlay */}
      {candles.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950/70 rounded-2xl border border-white/5 space-y-3 z-20">
          <div className="h-8 w-8 border-4 border-rose-500/20 border-t-rose-500 rounded-full animate-spin" />
          <span className="text-xs font-black uppercase text-zinc-500 tracking-widest">
            Sincronizando feed da Binance (Aguarde até 1m se limitado)
          </span>
        </div>
      )}

      {candles.length > 0 && (
        <>
          {/* TradingView-Style Floating Legend Accent */}
          <div className="absolute top-3 left-3 flex items-center gap-2 bg-black/80 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10 pointer-events-none select-none shadow-xl z-10 transition-all">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_#10b981]" />
            <span className="text-[10px] font-black uppercase text-zinc-300 font-mono tracking-wider flex items-center gap-1.5">
              <span>{activeAssetName || 'CRYPTO'}</span>
              <span className="text-zinc-650">•</span>
              <span className="text-emerald-400 font-black">
                {candles && candles.length > 0 ? `$${candles[candles.length - 1].close.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : 'CONECTANDO...'}
              </span>
            </span>
          </div>

          {/* Active Zones overlay at top-right (TradingView Order Block Style) */}
          {zones && zones.length > 0 && (
            <div className="absolute top-3 right-3 hidden sm:flex flex-col gap-1.5 bg-black/80 backdrop-blur-md p-2.5 rounded-xl border border-white/10 pointer-events-none select-none shadow-xl z-10 w-44 transition-all max-h-[80%] overflow-y-auto">
              <span className="text-[8px] font-black text-zinc-500 uppercase tracking-widest pl-1 mb-0.5 block">Zonas Institucionais Ativas</span>
              {zones.map((z, idx) => {
                const isSupport = z.type === 'SUPPORT';
                return (
                  <div key={idx} className="flex items-center justify-between gap-3 text-[9px] font-mono pr-1 bg-white/[0.02] hover:bg-white/[0.04] p-1.5 rounded-lg border border-white/5">
                    <span className="flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${isSupport ? 'bg-emerald-500 animate-pulse shadow-[0_0_6px_#10b981]' : 'bg-rose-500 animate-pulse shadow-[0_0_6px_#f43f5e]'}`} />
                      <span className={isSupport ? 'text-emerald-400 font-bold' : 'text-rose-450 text-rose-400 font-bold'}>
                        {isSupport ? 'SUP' : 'RES'}{z.isOrderBlock ? ' OB' : ''}
                      </span>
                    </span>
                    <span className="text-zinc-200 font-bold">${z.price.toLocaleString(undefined, { minimumFractionDigits: 1 })}</span>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

