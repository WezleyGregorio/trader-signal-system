/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Signal } from '../types';

export interface SimulatedTrade {
  id: string;
  time: string;
  date: string;
  asset: string;
  timeframe: string;
  type: 'CALL' | 'PUT';
  strategy: string;
  result: 'WIN' | 'LOSS';
  betAmount: number;
  profit: number;
  balanceAfter: number;
  wickSize?: number;
  wickStatus?: string;
  entryPrice?: number;
  resultPrice?: number;
}

export interface AssetSorosState {
  sorosLevel: number; // 0 = Base ($3.00), 1 = Mão de Soro ($5.61)
  bet: number;
}

export interface DailySimulation {
  dateStr: string;
  initialBalance: number;
  balance: number;
  bet: number;
  sorosLevel: number;
  assetSoros: Record<string, AssetSorosState>;
  trades: SimulatedTrade[];
}

export const getSPDateStr = (timestampOrDate: number | string | Date = Date.now()): string => {
  const d = typeof timestampOrDate === 'number' || typeof timestampOrDate === 'string'
    ? new Date(timestampOrDate)
    : timestampOrDate;
  return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
};

export const getSPTimeStr = (timestampOrDate: number | string | Date = Date.now()): string => {
  const d = typeof timestampOrDate === 'number' || typeof timestampOrDate === 'string'
    ? new Date(timestampOrDate)
    : timestampOrDate;
  return d.toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit'
  });
};

export const normalizeAssetKey = (raw: string): string => {
  const upper = (raw || '').toUpperCase().trim();
  if (upper.includes('BTC') || upper.includes('BITCOIN')) return 'BITCOIN';
  if (upper.includes('GOLD') || upper.includes('PAXG') || upper.includes('OURO')) return 'GOLD';
  if (upper.includes('DOGE')) return 'DOGECOIN';
  if (upper.includes('XRP') || upper.includes('RIPPLE')) return 'XRP';
  if (upper.includes('ETH')) return 'ETHEREUM';
  if (upper.includes('SOL')) return 'SOLANA';
  if (upper.includes('BNB') || upper.includes('BINANCE')) return 'BINANCE COIN';
  return upper || 'BITCOIN';
};

export const getInitialAssetSoros = (): Record<string, AssetSorosState> => ({
  'BITCOIN': { sorosLevel: 0, bet: 3.00 },
  'GOLD': { sorosLevel: 0, bet: 3.00 },
  'DOGECOIN': { sorosLevel: 0, bet: 3.00 },
  'XRP': { sorosLevel: 0, bet: 3.00 },
  'ETHEREUM': { sorosLevel: 0, bet: 3.00 },
});

/**
 * Recalcula o simulador de Soros de forma 100% determinística e real
 * a partir dos sinais exclusivos daquela data.
 */
export const calculateDailySimulation = (
  signals: Signal[],
  targetDateStr: string,
  initialBalance: number = 100.00,
  baseBet: number = 3.00,
  payout: number = 0.87
): DailySimulation => {
  // Filtra estritamente os sinais da data no fuso de SP
  const daySignals = signals.filter(s => {
    const sDate = getSPDateStr(s.timestamp || s.expiryTimestamp);
    return sDate === targetDateStr && (s.status === 'WIN' || s.status === 'LOSS');
  });

  // Ordena cronologicamente por horário de expiração ou criação
  const sortedSignals = [...daySignals].sort((a, b) => {
    const tA = a.timestamp || a.expiryTimestamp || 0;
    const tB = b.timestamp || b.expiryTimestamp || 0;
    return tA - tB;
  });

  let balance = initialBalance;
  const assetSoros = getInitialAssetSoros();
  const trades: SimulatedTrade[] = [];

  for (const s of sortedSignals) {
    const assetKey = normalizeAssetKey(s.asset);
    const state = assetSoros[assetKey] || { sorosLevel: 0, bet: baseBet };
    const currentBet = state.bet || baseBet;
    const currentLevel = state.sorosLevel || 0;

    let profit = 0;
    let nextLevel = 0;
    let nextBet = baseBet;

    const isWin = s.status === 'WIN';
    const wickPct = typeof s.metrics?.wickSize === 'number' ? s.metrics.wickSize : null;
    let wickStatus = 'Pavio Normal';
    if (wickPct !== null) {
      if (isWin) {
        wickStatus = `${wickPct.toFixed(1)}% (Retração Confirmada)`;
      } else {
        wickStatus = `${wickPct.toFixed(1)}% (Rompimento)`;
      }
    }

    if (isWin) {
      profit = +(currentBet * payout).toFixed(2);
      balance = +(balance + profit).toFixed(2);

      // 1 Mão de Soro: 1ª entrada $3. Se WIN, próxima $3 + 87% ($5.61). Depois volta para $3.
      if (currentLevel === 0) {
        nextLevel = 1;
        nextBet = +(baseBet + (baseBet * payout)).toFixed(2);
      } else {
        nextLevel = 0;
        nextBet = baseBet;
      }
    } else {
      profit = -currentBet;
      balance = +(balance + profit).toFixed(2);
      // LOSS: Reseta imediatamente para mão base
      nextLevel = 0;
      nextBet = baseBet;
    }

    assetSoros[assetKey] = {
      sorosLevel: nextLevel,
      bet: nextBet
    };

    trades.push({
      id: s.id,
      time: getSPTimeStr(s.expiryTimestamp || s.timestamp),
      date: targetDateStr,
      asset: s.asset,
      timeframe: s.timeframe,
      type: s.type,
      strategy: s.strategy || 'SMC Institutional Flow',
      result: s.status as 'WIN' | 'LOSS',
      betAmount: currentBet,
      profit,
      balanceAfter: balance,
      wickSize: wickPct !== null ? wickPct : undefined,
      wickStatus,
      entryPrice: s.price,
      resultPrice: s.resultPrice
    });
  }

  return {
    dateStr: targetDateStr,
    initialBalance,
    balance,
    bet: baseBet,
    sorosLevel: 0,
    assetSoros,
    trades
  };
};

/**
 * Gera o texto do relatório de performance institucional formatado
 * com dados reais, sem mistura de datas, e com a confirmação do pavio.
 */
export const generateReportText = (sim: DailySimulation): string => {
  const sortedTrades = [...sim.trades].sort((a, b) => {
    const [hA, mA] = a.time.split(':').map(Number);
    const [hB, mB] = b.time.split(':').map(Number);
    if (hA !== hB) return hA - hB;
    return mA - mB;
  });

  const netProfit = sim.balance - sim.initialBalance;
  const pSignGross = (profit: number) => profit > 0 ? '+' : (profit < 0 ? '-' : '');
  const profitSign = netProfit >= 0 ? '+' : '';
  const outcomeWord = netProfit >= 0 ? '🟢 LUCRO' : '🔴 PREJUÍZO';
  const winCount = sortedTrades.filter(t => t.result === 'WIN').length;
  const lossCount = sortedTrades.filter(t => t.result === 'LOSS').length;
  const winRate = sortedTrades.length > 0 ? ((winCount / sortedTrades.length) * 100).toFixed(1) : '0.0';

  // Métricas de confirmação de pavio
  const tradesWithWick = sortedTrades.filter(t => typeof t.wickSize === 'number');
  const totalWick = tradesWithWick.reduce((acc, t) => acc + (t.wickSize || 0), 0);
  const avgWick = tradesWithWick.length > 0 ? (totalWick / tradesWithWick.length).toFixed(1) : '0.0';

  const winWickTrades = tradesWithWick.filter(t => t.result === 'WIN');
  const winWickAvg = winWickTrades.length > 0
    ? (winWickTrades.reduce((acc, t) => acc + (t.wickSize || 0), 0) / winWickTrades.length).toFixed(1)
    : '0.0';

  const lossWickTrades = tradesWithWick.filter(t => t.result === 'LOSS');
  const lossWickAvg = lossWickTrades.length > 0
    ? (lossWickTrades.reduce((acc, t) => acc + (t.wickSize || 0), 0) / lossWickTrades.length).toFixed(1)
    : '0.0';

  const assetStats: Record<string, number> = {};
  const tfStats: Record<string, number> = {};
  const strategyStats: Record<string, { profit: number, wins: number, total: number }> = {};

  sortedTrades.forEach(t => {
    const profit = t.profit || 0;
    assetStats[t.asset] = (assetStats[t.asset] || 0) + profit;
    tfStats[t.timeframe] = (tfStats[t.timeframe] || 0) + profit;

    const strat = t.strategy || 'SMC Support/Resistance';
    if (!strategyStats[strat]) {
      strategyStats[strat] = { profit: 0, wins: 0, total: 0 };
    }
    strategyStats[strat].profit += profit;
    strategyStats[strat].total += 1;
    if (t.result === 'WIN') strategyStats[strat].wins += 1;
  });

  const getRanked = (stats: Record<string, number>) => Object.entries(stats).sort((a, b) => b[1] - a[1]);
  const rankedAssets = getRanked(assetStats);
  const bestTf = getRanked(tfStats)[0];

  const rankedStrategies = Object.entries(strategyStats).sort((a, b) => b[1].profit - a[1].profit);
  const bestStrategy = rankedStrategies[0];

  let reportText = `🏆 *RELATÓRIO DE PERFORMANCE INSTITUCIONAL* 🏆\n`;
  reportText += `━━━━━━━━━━━━━━━━━━━━━━\n`;
  reportText += `🗓 *Data:* ${sim.dateStr}\n`;
  reportText += `🏦 *Banca Inicial:* $ ${sim.initialBalance.toFixed(2)}\n`;
  reportText += `💵 *Banca Final:* $ ${sim.balance.toFixed(2)}\n`;
  reportText += `💰 *Resultado Líquido:* ${profitSign}$ ${Math.abs(netProfit).toFixed(2)} (${outcomeWord})\n`;
  reportText += `📊 *Assertividade Geral:* ${winRate}% (${winCount}W - ${lossCount}L)\n`;
  reportText += `📈 *Qtd. Sinais Reais do Dia:* ${sortedTrades.length}\n`;
  reportText += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  // Seção de Análise do Pavio + Estratégia
  reportText += `🕯️ *CONFIRMAÇÃO DO PAVIO + ESTRATÉGIA:*\n`;
  reportText += `• Média de Pavio: ${avgWick}%\n`;
  reportText += `• Pavio Médio nos WINs: ${winWickAvg}% (Retrações confirmadas)\n`;
  reportText += `• Pavio Médio nos LOSS: ${lossWickAvg}% (Rompimentos)\n`;
  if (bestStrategy) {
    const stratWinRate = ((bestStrategy[1].wins / bestStrategy[1].total) * 100).toFixed(1);
    reportText += `• Melhor Estratégia: *${bestStrategy[0]}* (${stratWinRate}% WIN | ${pSignGross(bestStrategy[1].profit)}$ ${Math.abs(bestStrategy[1].profit).toFixed(2)})\n`;
  }
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
    reportText += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;
  }

  reportText += `*🎯 HISTÓRICO COMPLETO DAS OPERAÇÕES DO DIA:*\n\n`;

  sortedTrades.forEach((t, index) => {
    const ic = t.result === 'WIN' ? '✅ WIN ' : '❌ LOSS';
    const balanceAfterText = t.balanceAfter.toFixed(2);
    const wickInfo = t.wickStatus || (typeof t.wickSize === 'number' ? `${t.wickSize.toFixed(1)}%` : 'N/A');

    reportText += `*#${(index + 1).toString().padStart(2, '0')}* | 🕒 ${t.time} | 🪙 *${t.asset}* (${t.timeframe})\n`;
    reportText += `   ↳ 🎯 Ordem: *${t.type}* | ${ic} | 💸 ${pSignGross(t.profit)}$ ${Math.abs(t.profit).toFixed(2)}\n`;
    reportText += `   ↳ 🧠 Estratégia: ${t.strategy}\n`;
    reportText += `   ↳ 🕯️ Confirmação do Pavio: ${wickInfo}\n`;
    reportText += `   ↳ ⚖️ Saldo após ordem: $ ${balanceAfterText}\n\n`;
  });

  reportText += `━━━━━━━━━━━━━━━━━━━━━━\n`;
  reportText += `🤖 _SMC Quantum v4.0 Institutional Engine_\n`;
  reportText += `🌐 _Gerenciamento Soros Independente por Ativo (USD)_`;

  return reportText;
};

/**
 * Função utilitária para download direto no navegador de arquivos .txt ou .json
 */
export const downloadReportFile = (
  content: string,
  filename: string = 'relatorio.txt'
) => {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
