const fs = require('fs');
const file = 'src/engine/tradingEngine.ts';
let code = fs.readFileSync(file, 'utf8');

const startTarget = "    // New Strategy: Price and Volume in favor of the trend (Trend Continuation)";
const endTarget = "    return null;\n  }\n\n  getZones(timeframe: Timeframe) {";

let startIndex = code.indexOf(startTarget);
let endIndex = code.indexOf("    return null;\n  }\n\n  getZones(timeframe: Timeframe) {");

if (startIndex !== -1 && endIndex !== -1) {
    const replacement = `    // New Strategy: Price and Volume in favor of the trend (Trend Continuation) - High Accuracy
    if (list.length >= 20 && ema200 !== null && atrData && bb !== null && vwap !== null) {
      const ema50 = this.getEma(list, 50);
      const ema20 = this.getEma(list, 20);
      
      if (ema50 !== null && ema20 !== null) {
        const avgVol = list.reduce((acc, c) => acc + c.volume, 0) / list.length;
        
        // Strict Trend Alignment (EMA 20 > EMA 50 > EMA 200)
        const isUptrend = ema20 > ema50 && ema50 > ema200 && last.close > vwap;
        const isDowntrend = ema20 < ema50 && ema50 < ema200 && last.close < vwap;

        const bodySize = Math.abs(last.close - last.open);
        const totalSize = last.high - last.low || 1;
        
        // Body needs to be very strong, but we must not pierce the outer bands to avoid mean reversion
        const isStrongBullish = last.close > last.open && (bodySize / totalSize) > 0.75 && last.close < bb.upper;
        const isStrongBearish = last.close < last.open && (bodySize / totalSize) > 0.75 && last.close > bb.lower;

        // Volume must be above average but avoid climax/exhaustion volume (> 3x)
        const hasGoodVolume = last.volume > avgVol * 1.3 && last.volume < avgVol * 3.0;
        
        // Breakout logic, should be decently sized but not extreme
        const isBreakout = bodySize > atrData.avgLast20 * 0.8;

        // Context check: previous candle should not be massive (to avoid buying at the end of an extended move)
        let prevCandleOk = true;
        if (list.length > 2) {
           const prev = list[list.length - 2];
           const prevBodySize = Math.abs(prev.close - prev.open);
           if (prevBodySize > atrData.avgLast20 * 1.5) {
               prevCandleOk = false;
           }
        }

        if (isUptrend && isStrongBullish && hasGoodVolume && isBreakout && prevCandleOk && rsi > 45 && rsi < 65) {
          let bbTension = 50;
          if (bb.upper !== bb.lower) {
             bbTension = Math.round(((last.close - bb.lower) / (bb.upper - bb.lower)) * 100);
          }
          return {
            id: \`SIG-\${this.asset}-\${timeframe}-\${last.timestamp}-\${Math.floor(Math.random() * 1000000)}\`,
            asset: this.asset,
            type: 'CALL',
            timeframe: timeframe,
            price: last.close,
            timestamp: Date.now(),
            expiryTimestamp: expiry,
            strategy: 'Trend Flow (Price & Volume)',
            status: 'PENDING',
            assertiveness: 92, // Increased assertiveness for stricter filter
            metrics: {
              wickSize: ((totalSize - bodySize) / totalSize) * 100,
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

        if (isDowntrend && isStrongBearish && hasGoodVolume && isBreakout && prevCandleOk && rsi < 55 && rsi > 35) {
          let bbTension = 50;
          if (bb.upper !== bb.lower) {
             bbTension = Math.round(((last.close - bb.lower) / (bb.upper - bb.lower)) * 100);
          }
          return {
            id: \`SIG-\${this.asset}-\${timeframe}-\${last.timestamp}-\${Math.floor(Math.random() * 1000000)}\`,
            asset: this.asset,
            type: 'PUT',
            timeframe: timeframe,
            price: last.close,
            timestamp: Date.now(),
            expiryTimestamp: expiry,
            strategy: 'Trend Flow (Price & Volume)',
            status: 'PENDING',
            assertiveness: 92, // Increased assertiveness for stricter filter
            metrics: {
              wickSize: ((totalSize - bodySize) / totalSize) * 100,
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

`;
    const newCode = code.substring(0, startIndex) + replacement + code.substring(endIndex);
    fs.writeFileSync(file, newCode);
    console.log("Successfully patched strategy logic.");
} else {
    console.log("Could not find bounds to patch.", startIndex, endIndex);
}
