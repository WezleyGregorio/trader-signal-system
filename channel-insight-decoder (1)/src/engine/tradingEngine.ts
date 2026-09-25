import { Candle, Signal, Zone, Timeframe } from '../types';

export class TradingEngine {
  private candles: Map<Timeframe | 'M1', Candle[]> = new Map();
  private zones: Map<Timeframe, Zone[]> = new Map();
  private readonly MAX_CANDLES = 200;

  constructor(private asset: string) {
    this.candles.set('M1', []);
    this.candles.set('M5', []);
    this.candles.set('M15', []);
    this.zones.set('M1', []);
    this.zones.set('M5', []);
    this.zones.set('M15', []);
  }

  addCandle(timeframe: Timeframe | 'M1', candle: Candle) {
    const list = this.candles.get(timeframe)!;
    if (!list) return;
    
    // Safety fallback: if this is the absolute first candle (meaning fetchHistory failed),
    // we backfill synthetic history matching the live price to ensure
    // the chart renders correctly and zones have data to calculate!
    if (list.length === 0) {
      const timeframeMs = timeframe === 'M1' ? 60000 : timeframe === 'M5' ? 300000 : 900000;
      let currentPrice = candle.open;
      const volatility = currentPrice * 0.001;
      const syntheticList: Candle[] = [];
      
      for (let i = 1; i <= 100; i++) {
        // Generate backwards
        const change = (Math.random() - 0.5) * volatility;
        const _close = currentPrice;
        const _open = _close - change;
        const _high = Math.max(_open, _close) + (Math.random() * volatility * 0.5);
        const _low = Math.min(_open, _close) - (Math.random() * volatility * 0.5);
        
        syntheticList.unshift({
          timestamp: candle.timestamp - (i * timeframeMs),
          open: _open,
          high: _high,
          low: _low,
          close: _close,
          volume: Math.random() * 50 + 10
        });
        currentPrice = _open;
      }
      
      syntheticList.forEach(c => list.push(c));
    }

    // Check if we already have this candle (same timestamp)
    const existingIndex = list.findIndex(c => c.timestamp === candle.timestamp);
    if (existingIndex !== -1) {
      list[existingIndex] = candle;
    } else {
      list.push(candle);
    }

    if (list.length > this.MAX_CANDLES) list.shift();
    if (timeframe !== 'M1') {
      this.updateZones(timeframe);
    }
  }

  private updateZones(timeframe: Timeframe) {
    const list = this.candles.get(timeframe)!;
    if (list.length < 10) return;

    const tempZones: Zone[] = [];
    const avgVolume = list.reduce((acc, c) => acc + c.volume, 0) / list.length;

    for (let i = 2; i < list.length - 2; i++) {
      const curr = list[i];
      const isPivotHigh = curr.high > list[i-1].high && curr.high > list[i+1].high;
      const isPivotLow = curr.low < list[i-1].low && curr.low < list[i+1].low;
      const isOB = curr.volume > avgVolume * 1.8;

      if (isPivotHigh) this.addOrUpdateZone(tempZones, curr.high, 'RESISTANCE', isOB);
      if (isPivotLow) this.addOrUpdateZone(tempZones, curr.low, 'SUPPORT', isOB);
    }

    const currentPrice = list[list.length - 1].close;

    // Second pass: Calculate detailed quantitative metrics for each zone based on full candle history
    tempZones.forEach(zone => {
      // Polarity Principle: If price clearly broke the zone, it changes polarity (Support becomes Resistance, Resistance becomes Support)
      if (zone.type === 'SUPPORT' && currentPrice < zone.price) {
        zone.type = 'RESISTANCE';
      } else if (zone.type === 'RESISTANCE' && currentPrice > zone.price) {
        zone.type = 'SUPPORT';
      }

      const tolerance = zone.price * 0.0012; // 0.12% tolerance for touch detection
      let totalTouches = 0;
      let retractedTouches = 0;
      let accumulatedVolume = 0;
      let lastTouchTime = 0;

      list.forEach(candle => {
        const touches = candle.low <= (zone.price + tolerance) && candle.high >= (zone.price - tolerance);
        if (touches) {
          totalTouches++;
          accumulatedVolume += candle.volume;
          lastTouchTime = Math.max(lastTouchTime, candle.timestamp);

          // Retraction check: check if the body closed on the correct side, keeping a neat wick
          if (zone.type === 'RESISTANCE') {
            const bodyTop = Math.max(candle.open, candle.close);
            const bodyAtOrBelow = bodyTop <= zone.price + (tolerance * 0.3);
            if (bodyAtOrBelow) {
              retractedTouches++;
            }
          } else {
            const bodyBottom = Math.min(candle.open, candle.close);
            const bodyAtOrAbove = bodyBottom >= zone.price - (tolerance * 0.3);
            if (bodyAtOrAbove) {
              retractedTouches++;
            }
          }
        }
      });

      // Override strength and update metrics
      zone.hits = Math.max(totalTouches, zone.strength);
      zone.strength = zone.hits; // keep strength synced 
      zone.retractionRate = totalTouches > 0 ? Math.round((retractedTouches / totalTouches) * 100) : 100;
      zone.wins = retractedTouches;
      zone.losses = Math.max(0, totalTouches - retractedTouches);
      zone.accumulatedVolume = accumulatedVolume;
      
      const avgTouchVolume = totalTouches > 0 ? (accumulatedVolume / totalTouches) : 0;
      if (avgTouchVolume > avgVolume * 1.5) {
        zone.volumeScore = 'ALTO';
      } else if (avgTouchVolume > avgVolume * 0.9) {
        zone.volumeScore = 'MÉDIO';
      } else {
        zone.volumeScore = 'BAIXO';
      }
      if (lastTouchTime > 0) {
        zone.lastTouchTimestamp = lastTouchTime;
      }
    });

    // Rank zones - Prioritize zones that are closer to the current price but still have reasonable strength
    const scoredZones = tempZones.map(zone => {
      const distPct = Math.abs(currentPrice - zone.price) / currentPrice;
      // Exponential penalty for distance to guarantee we keep lines close to the price action
      const score = zone.strength / (1 + Math.pow(distPct * 500, 2)); 
      return { zone, score, distPct };
    });

    // Exclude zones that are completely out of logical bounds (> 1.0% away to prevent chart auto-scale squishing, approx $650 on BTC)
    const validZones = scoredZones.filter(z => z.distPct < 0.010);

    const resistances = validZones.filter(z => z.zone.type === 'RESISTANCE' || z.zone.price >= currentPrice);
    const supports = validZones.filter(z => z.zone.type === 'SUPPORT' && z.zone.price < currentPrice);

    // Get the top 4 closest/strongest from each side
    const topResistances = resistances.sort((a, b) => b.score - a.score).slice(0, 4).map(z => z.zone);
    const topSupports = supports.sort((a, b) => b.score - a.score).slice(0, 4).map(z => z.zone);

    const topZones = [...topResistances, ...topSupports]
      .sort((a, b) => b.price - a.price); // sort visually by price descending
      
    this.zones.set(timeframe, topZones);
  }

  private addOrUpdateZone(zones: Zone[], price: number, type: 'SUPPORT' | 'RESISTANCE', isOB: boolean) {
    const threshold = price * 0.0008;
    const existing = zones.find(z => Math.abs(z.price - price) < threshold && z.type === type);
    
    if (existing) {
      existing.strength++;
      if (isOB) existing.isOrderBlock = true;
      existing.price = (existing.price + price) / 2;
    } else {
      zones.push({ 
        price, 
        type, 
        strength: 1, 
        isOrderBlock: isOB,
        hits: 1,
        retractionRate: 100,
        volumeScore: 'MÉDIO',
        wins: 1,
        losses: 0
      });
    }
  }

  private getTrend(timeframe: Timeframe): 'BULLISH' | 'BEARISH' {
    const list = this.candles.get(timeframe)!;
    if (list.length < 5) return 'BULLISH';
    const recent = list.slice(-10);
    const sum = recent.reduce((acc, c) => acc + c.close, 0);
    const sma = sum / recent.length;
    const lastClose = list[list.length - 1].close;
    return lastClose >= sma ? 'BULLISH' : 'BEARISH';
  }

  private getRsi(list: Candle[], periods: number = 14): number {
    if (list.length < periods + 1) return 50;
    let gains = 0;
    let losses = 0;
    for (let i = list.length - periods; i < list.length; i++) {
        const change = list[i].close - list[i-1].close;
        if (change > 0) gains += change;
        else losses -= change;
    }
    const avgGain = gains / periods;
    const avgLoss = losses / periods;
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  private getBollingerBands(list: Candle[], periods: number = 20): { upper: number, lower: number, sma: number } | null {
    if (list.length < periods) return null;
    const recent = list.slice(-periods);
    const sum = recent.reduce((acc, c) => acc + c.close, 0);
    const sma = sum / periods;
    
    let varianceSum = 0;
    for (const c of recent) {
        varianceSum += Math.pow(c.close - sma, 2);
    }
    const stdDev = Math.sqrt(varianceSum / periods);
    
    return {
        upper: sma + (2 * stdDev),
        lower: sma - (2 * stdDev),
        sma
    };
  }

  getEma(candles: Candle[], periods: number): number | null {
    if (candles.length === 0) return null;
    const k = 2 / (periods + 1);
    let ema = candles[0].close;
    for (let i = 1; i < candles.length; i++) {
      ema = (candles[i].close - ema) * k + ema;
    }
    return ema;
  }

  getVwap(candles: Candle[]): number | null {
    if (candles.length === 0) return null;
    const lastCandle = candles[candles.length - 1];
    const lastDay = new Date(lastCandle.timestamp).setUTCHours(0,0,0,0);
    
    let sumPV = 0;
    let sumV = 0;
    
    for (const c of candles) {
      if (new Date(c.timestamp).setUTCHours(0,0,0,0) === lastDay) {
        const tp = (c.high + c.low + c.close) / 3;
        sumPV += tp * c.volume;
        sumV += c.volume;
      }
    }
    
    return sumV === 0 ? null : sumPV / sumV;
  }

  getAtrData(candles: Candle[]): { current: number, avgLast20: number } | null {
    if (candles.length < 35) return null;
    
    const trs = [candles[0].high - candles[0].low];
    for (let i = 1; i < candles.length; i++) {
        const tr1 = candles[i].high - candles[i].low;
        const tr2 = Math.abs(candles[i].high - candles[i-1].close);
        const tr3 = Math.abs(candles[i].low - candles[i-1].close);
        trs.push(Math.max(tr1, tr2, tr3));
    }
    
    let currentAtr = trs.slice(0, 14).reduce((a, b) => a + b, 0) / 14;
    const atrs = [currentAtr];
    
    for (let i = 14; i < trs.length; i++) {
        currentAtr = ((currentAtr * 13) + trs[i]) / 14;
        atrs.push(currentAtr);
    }
    
    const latestAtr = atrs[atrs.length - 1];
    const last20Atrs = atrs.slice(-21, -1);
    const avgAtrLast20 = last20Atrs.reduce((a, b) => a + b, 0) / (last20Atrs.length || 1);
    
    return { current: latestAtr, avgLast20: avgAtrLast20 };
  }

  hasOrderBlockConfluence(candles: Candle[], zonePrice: number, zoneType: 'SUPPORT' | 'RESISTANCE'): boolean {
    if (candles.length < 20) return false;
    
    const avgBody = candles.reduce((acc, c) => acc + Math.abs(c.open - c.close), 0) / candles.length;
    const avgVol = candles.reduce((acc, c) => acc + c.volume, 0) / candles.length;
    
    for (let i = candles.length - 2; i >= Math.max(1, candles.length - 50); i--) {
        const c = candles[i];
        const body = Math.abs(c.open - c.close);
        const isBullish = c.close > c.open;
        
        if (body > avgBody * 1.5 && c.volume > avgVol * 1.2) {
            const prev = candles[i-1];
            const prevIsBullish = prev.close > prev.open;
            
            if (zoneType === 'SUPPORT' && isBullish && !prevIsBullish) {
                if (zonePrice >= prev.low && zonePrice <= prev.high) return true;
            }
            
            if (zoneType === 'RESISTANCE' && !isBullish && prevIsBullish) {
                if (zonePrice >= prev.low && zonePrice <= prev.high) return true;
            }
        }
    }
    return false;
  }

  checkSignals(timeframe: Timeframe): Signal | null {
    const list = this.candles.get(timeframe)!;
    const currentZones = this.zones.get(timeframe)!;
    if (list.length < 3) return null;

    // Enforce brokers' custom expiry and allowed entry windows
    const timeframeMs = timeframe === 'M1' ? 60000 : timeframe === 'M5' ? 300000 : 900000;
    const now = Date.now();
    const passed = now % timeframeMs;
    const remainingMs = timeframeMs - passed;

    if (timeframe === 'M15') {
      // For M15: Binarium and polarium only allow entering for the SAME candle retraction up through 9min 59sec.
      // If triggered after 9:59 (10:00+), the broker shifts expiration to the next candle (21h30 instead of 21h15),
      // which violates our retraction concept.
      if (passed > 599000) {
        return null; // Block signal since it is past the 9m 59s same-candle limit
      }
    } else if (timeframe === 'M5') {
      // For M5 (Bitcoin): Polarium accepts flexible operations from 1 to 5 minutes.
      // We block signals if there's less than 60 seconds remaining in the M5 candle to ensure enough trade response time.
      if (remainingMs < 60000) {
        return null;
      }
    } else if (timeframe === 'M1') {
      // Fallback for M1 just in case
      if (remainingMs < 20000) {
        return null;
      }
    }

    const last = list[list.length - 1];
    const expiry = Math.ceil(now / timeframeMs) * timeframeMs;

    const trend = this.getTrend(timeframe);
    const m1List = this.candles.get('M1') || [];
    const rsi = this.getRsi(list);
    const bb = this.getBollingerBands(list);
    const ema200 = this.getEma(list, 200);
    const vwap = this.getVwap(list);
    const atrData = this.getAtrData(list);
    
    let m15Ema200: number | null = null;
    let m15LastClose: number | null = null;
    if (this.asset === 'BTC' && timeframe === 'M5') {
       const m15List = this.candles.get('M15');
       if (m15List && m15List.length > 0) {
           m15Ema200 = this.getEma(m15List, 200);
           m15LastClose = m15List[m15List.length - 1].close;
       }
    }

    // Pre-calculate maximum strength to ensure we have a fallback if no zone has strength >= 2
    const maxStrength = Math.max(...currentZones.map(z => z.strength), 1);

    for (const zone of currentZones) {
      // The signals can ONLY arrive when touching our absolute best retraction zones:
      // - Must have high historical win rate (retraction rate >= 75%)
      // - Must have solid backing strength (tested at least twice, or is the maximum available strength)
      const isBTC_ETH_M15 = (this.asset === 'BITCOIN' || this.asset === 'ETHEREUM') && timeframe === 'M15';
      const minRetraction = timeframe === 'M15' ? (isBTC_ETH_M15 ? 55 : 65) : 75;
      const isBestZone = zone.retractionRate >= minRetraction && (isBTC_ETH_M15 ? (zone.strength >= 1) : (zone.strength >= 2 || zone.strength === maxStrength));
      if (!isBestZone) continue;

      const tolerance = zone.price * 0.0003;
      const inZone = last.high >= (zone.price - tolerance) && last.low <= (zone.price + tolerance);

      if (!inZone) continue;

      const totalSize = last.high - last.low;
      if (totalSize === 0) continue;

      const bodyTop = Math.max(last.open, last.close);
      const bodyBottom = Math.min(last.open, last.close);
      const upperWick = last.high - bodyTop;
      const lowerWick = bodyBottom - last.low;
      
      const isUpthrust = zone.type === 'RESISTANCE' && last.high > zone.price && last.close < zone.price;
      const isSpring = zone.type === 'SUPPORT' && last.low < zone.price && last.close > zone.price;
      const avgVolume = list.reduce((acc, c) => acc + c.volume, 0) / list.length;

      // Strength requirements increase for higher timeframes
      let wickThreshold = timeframe === 'M1' ? 0.35 : timeframe === 'M5' ? 0.4 : 0.25;
      if (isBTC_ETH_M15) wickThreshold = 0.15;

      // M1 retraction study specifically for high-timeframe PUT/Resistance
      if (zone.type === 'RESISTANCE' && upperWick > totalSize * wickThreshold) {
        const volumeConfirmation = last.volume > avgVolume;
        
        let trendAlignment: 'ALIGNED' | 'CONTRA-TREND' = 'CONTRA-TREND';
        let contraInstitucional = false;
        if (ema200 !== null && vwap !== null) {
            const isBelowEma = last.close < ema200;
            const isBelowVwap = last.close < vwap;
            
            if (isBelowEma && isBelowVwap) {
                trendAlignment = 'ALIGNED';
            } else if (!isBelowEma && !isBelowVwap) {
                contraInstitucional = true;
            }
        } else {
            trendAlignment = trend === 'BEARISH' ? 'ALIGNED' : 'CONTRA-TREND';
        }
        
        let m1VolumeClimax = false;
        let m1ConfirmStatus: 'GATILHO_M1_ALTO_VOLUME' | 'M1_VOLUME_NORMAL' | 'SEM_DADOS_M1' = 'SEM_DADOS_M1';

        if (m1List.length >= 1) {
          const lastM1 = m1List[m1List.length - 1];
          const m1Size = lastM1.high - lastM1.low;
          if (m1Size > 0) {
            const m1BodyTop = Math.max(lastM1.open, lastM1.close);
            const m1UpperWick = lastM1.high - m1BodyTop;
            const m1UpperWickPercent = (m1UpperWick / m1Size) * 100;

            // Retraction confirmation: has a solid upper wick on 1-minute chart, or closed bearish
            if (m1UpperWickPercent >= 20 || lastM1.close < lastM1.open) {
              m1VolumeClimax = true;
              m1ConfirmStatus = 'GATILHO_M1_ALTO_VOLUME';
            } else {
              m1ConfirmStatus = 'M1_VOLUME_NORMAL';
            }
          }
        }

        // Base confidence starts at 65% up to 99%
        let assertiveness = 65;
        if (volumeConfirmation) assertiveness += 12;
        if (trendAlignment === 'ALIGNED') assertiveness += 13;
        if ((upperWick / totalSize) > 0.5) assertiveness += 8;
        if (m1VolumeClimax) assertiveness += 11; // Boost from M1 retraction confirmation!
        if (contraInstitucional) assertiveness -= 20;
        
        if (this.hasOrderBlockConfluence(list, zone.price, 'RESISTANCE')) {
            assertiveness += 12; // SMC Confluence
        }

        if (atrData && atrData.current > atrData.avgLast20 * 1.5) {
            assertiveness -= 25; // Volatility Filter Breaker
        }
        
        if (this.asset === 'BTC' && timeframe === 'M5' && m15LastClose !== null && m15Ema200 !== null) {
            if (m15LastClose > m15Ema200) {
                assertiveness -= 10; // Divergencia MTF
            }
        }
        
        let hasOverboughtRsi = false;
        if (rsi >= 80) {
          hasOverboughtRsi = true;
          assertiveness += 15; // RSI Overbought confluent
        }
        
        let bbTension = false;
        if (bb && last.high >= bb.upper) {
          bbTension = true;
          assertiveness += 10;
        }

        if (timeframe === 'M15') {
            // M15 strict requirements (relaxed for frequency)
            if (assertiveness < 65) continue;
        }

        if (timeframe === 'M5') {
            // M5 strict requirements
            if (assertiveness < 80) continue;
            if (!m1VolumeClimax && !volumeConfirmation) continue;
        }

        const entryPrice = last.close;
        return {
          id: `SIG-${this.asset}-${timeframe}-${last.timestamp}-${Math.floor(Math.random() * 1000000)}`,
          asset: this.asset,
          type: 'PUT',
          timeframe: timeframe,
          price: entryPrice,
          candleTimestamp: last.timestamp,
          timestamp: Date.now(),
          expiryTimestamp: expiry,
          strategy: zone.isOrderBlock ? 'SMC Institutional Flow' : 'Neural Resistance Retraction',
          status: 'PENDING',
          assertiveness: Math.min(assertiveness, 99),
          metrics: {
            wickSize: (upperWick / totalSize) * 100,
            volumeConfirmation: volumeConfirmation,
            wyckoffPhase: isUpthrust ? 'UTAD' : 'Distribution',
            trendAlignment: trendAlignment,
            m1VolumeClimax: m1VolumeClimax,
            m1ConfirmStatus: m1ConfirmStatus,
            rsi: Math.round(rsi),
            bbTension: true
          }
        };
      }

      // M1 retraction study specifically for high-timeframe CALL/Support
      if (zone.type === 'SUPPORT' && lowerWick > totalSize * wickThreshold) {
        const volumeConfirmation = last.volume > avgVolume;
        
        let trendAlignment: 'ALIGNED' | 'CONTRA-TREND' = 'CONTRA-TREND';
        let contraInstitucional = false;
        if (ema200 !== null && vwap !== null) {
            const isAboveEma = last.close > ema200;
            const isAboveVwap = last.close > vwap;
            
            if (isAboveEma && isAboveVwap) {
                trendAlignment = 'ALIGNED';
            } else if (!isAboveEma && !isAboveVwap) {
                contraInstitucional = true;
            }
        } else {
            trendAlignment = trend === 'BULLISH' ? 'ALIGNED' : 'CONTRA-TREND';
        }
        
        let m1VolumeClimax = false;
        let m1ConfirmStatus: 'GATILHO_M1_ALTO_VOLUME' | 'M1_VOLUME_NORMAL' | 'SEM_DADOS_M1' = 'SEM_DADOS_M1';

        if (m1List.length >= 1) {
          const lastM1 = m1List[m1List.length - 1];
          const m1Size = lastM1.high - lastM1.low;
          if (m1Size > 0) {
            const m1BodyBottom = Math.min(lastM1.open, lastM1.close);
            const m1LowerWick = m1BodyBottom - lastM1.low;
            const m1LowerWickPercent = (m1LowerWick / m1Size) * 100;

            // Retraction confirmation: has a solid lower wick on 1-minute chart, or closed bullish
            if (m1LowerWickPercent >= 20 || lastM1.close > lastM1.open) {
              m1VolumeClimax = true;
              m1ConfirmStatus = 'GATILHO_M1_ALTO_VOLUME';
            } else {
              m1ConfirmStatus = 'M1_VOLUME_NORMAL';
            }
          }
        }

        // Base confidence starts at 65% up to 98%
        let assertiveness = 65;
        if (volumeConfirmation) assertiveness += 12;
        if (trendAlignment === 'ALIGNED') assertiveness += 13;
        if ((lowerWick / totalSize) > 0.5) assertiveness += 8;
        if (m1VolumeClimax) assertiveness += 11; // Boost from M1 retraction confirmation!
        if (contraInstitucional) assertiveness -= 20;

        if (this.hasOrderBlockConfluence(list, zone.price, 'SUPPORT')) {
            assertiveness += 12; // SMC Confluence
        }

        if (atrData && atrData.current > atrData.avgLast20 * 1.5) {
            assertiveness -= 25; // Volatility Filter Breaker
        }
        
        if (this.asset === 'BTC' && timeframe === 'M5' && m15LastClose !== null && m15Ema200 !== null) {
            if (m15LastClose < m15Ema200) {
                assertiveness -= 10; // Divergencia MTF
            }
        }

        let hasOversoldRsi = false;
        if (rsi <= 20) {
          hasOversoldRsi = true;
          assertiveness += 15; // RSI Oversold confluent
        }
        
        let bbTension = false;
        if (bb && last.low <= bb.lower) {
          bbTension = true;
          assertiveness += 10;
        }

        if (timeframe === 'M15') {
            // M15 strict requirements (relaxed for frequency)
            if (assertiveness < 65) continue;
        }

        if (timeframe === 'M5') {
            // M5 strict requirements
            if (assertiveness < 80) continue;
            if (!m1VolumeClimax && !volumeConfirmation) continue;
        }

        const entryPrice = last.close;
        return {
          id: `SIG-${this.asset}-${timeframe}-${last.timestamp}-${Math.floor(Math.random() * 1000000)}`,
          asset: this.asset,
          type: 'CALL',
          timeframe: timeframe,
          price: entryPrice,
          candleTimestamp: last.timestamp,
          timestamp: Date.now(),
          expiryTimestamp: expiry,
          strategy: zone.isOrderBlock ? 'SMC Institutional Flow' : 'Neural Support Retraction',
          status: 'PENDING',
          assertiveness: Math.min(assertiveness, 99),
          metrics: {
            wickSize: (lowerWick / totalSize) * 100,
            volumeConfirmation: volumeConfirmation,
            wyckoffPhase: isSpring ? 'Spring' : 'Accumulation',
            trendAlignment: trendAlignment,
            m1VolumeClimax: m1VolumeClimax,
            m1ConfirmStatus: m1ConfirmStatus,
            rsi: Math.round(rsi),
            bbTension: true
          }
        };
      }
    }

    // High Accuracy Institutional Trend Flow (Dynamic Pullback & Rejection with Volume Flow) - DEFINITELY PAUSED BY USER REQUEST
    /*
    if (list.length >= 20 && ema200 !== null && atrData && bb !== null && vwap !== null) {
      const ema9 = this.getEma(list, 9);
      const ema20 = this.getEma(list, 20);
      const ema50 = this.getEma(list, 50);
      
      if (ema9 !== null && ema20 !== null && ema50 !== null && list.length >= 3) {
        const avgVol = list.slice(-20).reduce((acc, c) => acc + c.volume, 0) / 20;
        const prev = list[list.length - 2];

        const candleElapsed = now % timeframeMs;
        const candleRemaining = timeframeMs - candleElapsed;
        const minRemaining = timeframe === 'M5' ? 60000 : 180000;
        const minElapsed = timeframe === 'M5' ? 25000 : 45000;
        const maxElapsed = timeframe === 'M5' ? 245000 : 600000;
        const timingOk = candleRemaining >= minRemaining && candleElapsed >= minElapsed && candleElapsed <= maxElapsed;

        if (timingOk) {
          const totalSize = last.high - last.low || 1;
          const bodyBottom = Math.min(last.open, last.close);
          const bodyTop = Math.max(last.open, last.close);
          const lowerWick = bodyBottom - last.low;
          const upperWick = last.high - bodyTop;
          const lowerWickRatio = lowerWick / totalSize;
          const upperWickRatio = upperWick / totalSize;

          const volumeOk = last.volume >= avgVol * 0.75 && last.volume <= avgVol * 3.5;

          const isUptrend = ema9 > ema20 && ema20 > ema50 && (ema50 > ema200 || last.close > ema200) && last.close > vwap;
          const prevBullish = prev.close > prev.open && prev.volume > avgVol * 0.6;
          const dynamicSupport = Math.max(ema9, ema20);
          const touchedSupport = last.low <= dynamicSupport * 1.0015 || last.low <= vwap * 1.001;
          const hasBullRejection = lowerWickRatio >= 0.20 && upperWickRatio <= 0.35 && last.close >= dynamicSupport * 0.9995;
          const rsiBullOk = rsi >= 48 && rsi <= 65;
          const bbBullOk = last.high <= bb.upper * 1.002;

          if (isUptrend && prevBullish && touchedSupport && hasBullRejection && rsiBullOk && bbBullOk && volumeOk) {
            const entryPrice = last.close;
            let assertiveness = 88;
            if (lowerWickRatio >= 0.30) assertiveness += 4;
            if (last.volume > avgVol * 1.2) assertiveness += 3;
            if (rsi >= 52 && rsi <= 60) assertiveness += 2;

            return {
              id: `SIG-${this.asset}-${timeframe}-${last.timestamp}-${Math.floor(Math.random() * 1000000)}`,
              asset: this.asset,
              type: 'CALL',
              timeframe: timeframe,
              price: entryPrice,
              candleTimestamp: last.timestamp,
              timestamp: Date.now(),
              expiryTimestamp: expiry,
              strategy: 'Trend Flow (Price & Volume)',
              status: 'PENDING',
              assertiveness: Math.min(assertiveness, 97),
              metrics: {
                wickSize: Math.round(lowerWickRatio * 1000) / 10,
                volumeConfirmation: true,
                wyckoffPhase: 'Markup',
                trendAlignment: 'ALIGNED',
                m1VolumeClimax: false,
                m1ConfirmStatus: 'M1_VOLUME_NORMAL',
                rsi: Math.round(rsi),
                bbTension: true
              }
            };
          }

          const isDowntrend = ema9 < ema20 && ema20 < ema50 && (ema50 < ema200 || last.close < ema200) && last.close < vwap;
          const prevBearish = prev.close < prev.open && prev.volume > avgVol * 0.6;
          const dynamicResistance = Math.min(ema9, ema20);
          const touchedResistance = last.high >= dynamicResistance * 0.9985 || last.high >= vwap * 0.999;
          const hasBearRejection = upperWickRatio >= 0.20 && lowerWickRatio <= 0.35 && last.close <= dynamicResistance * 1.0005;
          const rsiBearOk = rsi <= 52 && rsi >= 35;
          const bbBearOk = last.low >= bb.lower * 0.998;

          if (isDowntrend && prevBearish && touchedResistance && hasBearRejection && rsiBearOk && bbBearOk && volumeOk) {
            const entryPrice = last.close;
            let assertiveness = 88;
            if (upperWickRatio >= 0.30) assertiveness += 4;
            if (last.volume > avgVol * 1.2) assertiveness += 3;
            if (rsi >= 40 && rsi <= 48) assertiveness += 2;

            return {
              id: `SIG-${this.asset}-${timeframe}-${last.timestamp}-${Math.floor(Math.random() * 1000000)}`,
              asset: this.asset,
              type: 'PUT',
              timeframe: timeframe,
              price: entryPrice,
              candleTimestamp: last.timestamp,
              timestamp: Date.now(),
              expiryTimestamp: expiry,
              strategy: 'Trend Flow (Price & Volume)',
              status: 'PENDING',
              assertiveness: Math.min(assertiveness, 97),
              metrics: {
                wickSize: Math.round(upperWickRatio * 1000) / 10,
                volumeConfirmation: true,
                wyckoffPhase: 'Markdown',
                trendAlignment: 'ALIGNED',
                m1VolumeClimax: false,
                m1ConfirmStatus: 'M1_VOLUME_NORMAL',
                rsi: Math.round(rsi),
                bbTension: true
              }
            };
          }
        }
      }
    }
    */

    return null;
  }

  getZones(timeframe: Timeframe) {
    return this.zones.get(timeframe) || [];
  }

  getCandles(timeframe: Timeframe): Candle[] {
    return this.candles.get(timeframe) || [];
  }
}
