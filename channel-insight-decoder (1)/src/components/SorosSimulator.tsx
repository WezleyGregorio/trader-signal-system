import React, { useState } from 'react';
import { Coins, RefreshCw, Send, Trash2, TrendingUp, TrendingDown, Clock, HelpCircle, ChevronRight, Layers, Download, Calendar } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { SimulatedTrade, DailySimulation, downloadReportFile, generateReportText } from '../utils/reportUtils';

interface SorosSimulatorProps {
  simulation: DailySimulation;
  activeAsset?: string;
  onReset: () => void;
  onSendTestReport: () => Promise<{success: boolean, message: string}> | void;
  onDownloadReport?: () => void;
  onOpenDailyReports?: () => void;
  isCustomDate?: boolean;
}

const ASSET_ITEMS = [
  { symbol: 'btcusdt', name: 'Bitcoin', key: 'BITCOIN', tag: 'BTC' },
  { symbol: 'paxgusdt', name: 'Gold', key: 'GOLD', tag: 'GOLD' },
  { symbol: 'dogeusdt', name: 'Dogecoin', key: 'DOGECOIN', tag: 'DOGE' },
  { symbol: 'xrpusdt', name: 'XRP', key: 'XRP', tag: 'XRP' },
  { symbol: 'ethusdt', name: 'Ethereum', key: 'ETHEREUM', tag: 'ETH' },
];

export function SorosSimulator({
  simulation,
  activeAsset = 'btcusdt',
  onReset,
  onSendTestReport,
  onOpenDailyReports,
  isCustomDate = false
}: SorosSimulatorProps) {
  const [showExplanation, setShowExplanation] = useState(false);
  const [sendStatus, setSendStatus] = useState<{type: 'success' | 'error', msg: string} | null>(null);

  const profitLoss = simulation.balance - simulation.initialBalance;
  const isProfit = profitLoss >= 0;

  // Find active asset soros state
  const currentAsset = ASSET_ITEMS.find(a => a.symbol.toLowerCase() === (activeAsset || '').toLowerCase()) || ASSET_ITEMS[0];
  const activeAssetSoros = simulation.assetSoros?.[currentAsset.key] || {
    sorosLevel: simulation.sorosLevel ?? 0,
    bet: simulation.bet ?? 3
  };

  const handleTestReport = async () => {
    setSendStatus({ type: 'success', msg: 'Enviando...' });
    const res = await onSendTestReport();
    if (res) {
      setSendStatus({ type: res.success ? 'success' : 'error', msg: res.message });
      setTimeout(() => setSendStatus(null), res.success ? 3000 : 5000);
    }
  };

  const handleDownload = () => {
    const text = generateReportText(simulation);
    const cleanDate = simulation.dateStr.replace(/\//g, '-');
    downloadReportFile(text, `Relatorio_SMC_${cleanDate}.txt`);
  };

  return (
    <div className="bg-[#0c0c0e] rounded-[1.5rem] p-5 sm:p-6 border border-white/5 relative overflow-hidden transition-all">
      <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl -z-10 pointer-events-none" />
      
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-emerald-500/10 rounded-xl text-emerald-400">
            <Coins size={18} />
          </div>
          <div>
            <h3 className="text-xs sm:text-sm font-black text-white uppercase tracking-wider">Simulador Soros $ 100</h3>
            <p className="text-[10px] text-zinc-500">1 Mão de Soro Independente por Ativo (Payout 87%)</p>
          </div>
        </div>
        <button 
          onClick={() => setShowExplanation(!showExplanation)}
          className="p-1.5 text-zinc-500 hover:text-zinc-300 transition-colors"
          title="Como Funciona?"
        >
          <HelpCircle size={15} />
        </button>
      </div>

      {/* Explanation Box */}
      <AnimatePresence>
        {showExplanation && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-4 text-[10px] text-zinc-400 bg-zinc-900/40 border border-white/5 p-3 rounded-xl leading-relaxed space-y-1.5 overflow-hidden"
          >
            <p className="font-bold text-white uppercase text-[8px] tracking-wider text-emerald-400">Regras de Gerenciamento Soros (USD):</p>
            <p>• *Banca Inicial*: $ 100,00.</p>
            <p>• *Entrada Base*: $ 3,00 por operação.</p>
            <p>• *Fórmula Soros*: Ao vencer a 1ª mão ($ 3,00), a próxima entrada deste ativo será $ 3,00 + 87% do payout ($ 5,61).</p>
            <p>• *Ciclo de 1 Mão*: Se vencer a mão de soros ($ 5,61), volta para $ 3,00. Se perder em qualquer mão, também volta para $ 3,00.</p>
            <p>• *Mãos Independentes*: Cada ativo possui seu próprio ciclo de Soros exclusivo, sem misturar com outros pares.</p>
            <p>• *Sem Martingale*: Sistema de alavancagem inteligente com risco restrito à entrada inicial.</p>
            <p>• *Saldo*: O saldo é atualizado a cada sinal finalizado e enviado em relatório diário para o seu Telegram às 23:59:59!</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        {/* Balance */}
        <div className="bg-zinc-900/50 rounded-xl p-3.5 border border-white/5 relative">
          <span className="text-[9px] uppercase text-zinc-500 font-bold block mb-0.5 tracking-wider">Saldo Atual</span>
          <span className="text-base sm:text-lg font-black text-white block">$ {simulation.balance.toFixed(2)}</span>
          <div className="flex items-center gap-1 mt-1">
            {isProfit ? (
              <span className="text-[9px] font-bold text-emerald-400 flex items-center gap-0.5">
                <TrendingUp size={10} /> +$ {profitLoss.toFixed(2)}
              </span>
            ) : (
              <span className="text-[9px] font-bold text-rose-500 flex items-center gap-0.5">
                <TrendingDown size={10} /> -$ {Math.abs(profitLoss).toFixed(2)}
              </span>
            )}
            <span className="text-[8px] text-zinc-600 font-medium">({simulation.dateStr})</span>
          </div>
        </div>

        {/* Soros State for Active Asset */}
        <div className="bg-zinc-900/50 rounded-xl p-3.5 border border-white/5">
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-[9px] uppercase text-zinc-500 font-bold tracking-wider">Próxima Entrada</span>
            <span className="text-[8px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">{currentAsset.tag}</span>
          </div>
          <span className="text-base sm:text-lg font-black text-emerald-400 block">$ {activeAssetSoros.bet.toFixed(2)}</span>
          
          {/* Hand indicator (1 hand of soros) */}
          <div className="flex items-center gap-1.5 mt-2">
            <div 
              className={`h-1.5 rounded-full transition-all duration-300 ${
                activeAssetSoros.sorosLevel === 0 ? 'w-4 bg-emerald-500' : 'w-2 bg-emerald-500/40'
              }`}
              title="Mão 1 (Base $3.00)"
            />
            <div 
              className={`h-1.5 rounded-full transition-all duration-300 ${
                activeAssetSoros.sorosLevel === 1 ? 'w-4 bg-amber-400' : 'w-1.5 bg-zinc-800'
              }`}
              title="Mão de Soro ($5.61)"
            />
            <span className="text-[8px] text-zinc-400 font-bold uppercase ml-1">
              {activeAssetSoros.sorosLevel === 0 ? 'Mão 1 ($3)' : 'Soro 1 ($5.61)'}
            </span>
          </div>
        </div>
      </div>

      {/* Asset-Specific Soros Hands */}
      <div className="mb-4 bg-zinc-900/40 p-2.5 rounded-xl border border-white/5">
        <div className="flex items-center justify-between mb-2 px-1">
          <span className="text-[9px] uppercase text-zinc-500 font-bold tracking-wider flex items-center gap-1">
            <Layers size={10} /> Mãos de Soros por Ativo
          </span>
          <span className="text-[8px] text-zinc-600 font-semibold">1 mão (87%)</span>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
          {ASSET_ITEMS.map((item) => {
            const state = simulation.assetSoros?.[item.key] || { sorosLevel: 0, bet: 3 };
            const isSoro = state.sorosLevel === 1;
            const isCurrent = item.symbol.toLowerCase() === (activeAsset || '').toLowerCase();
            return (
              <div
                key={item.symbol}
                className={`p-1.5 rounded-lg border text-center transition-all ${
                  isCurrent ? 'ring-1 ring-emerald-500/40 ' : ''
                }${
                  isSoro
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                    : 'bg-zinc-900/60 border-white/5 text-zinc-400'
                }`}
              >
                <div className="text-[9px] font-black uppercase text-white/90">{item.tag}</div>
                <div className={`text-[10px] font-black ${isSoro ? 'text-amber-400' : 'text-emerald-400'}`}>
                  ${state.bet.toFixed(2)}
                </div>
                <div className="text-[7px] uppercase font-bold text-zinc-500">
                  {isSoro ? 'Soro 1' : 'Base'}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Simulated Trades Table */}
      <div className="space-y-2.5 mb-5">
        <div className="flex items-center justify-between px-1">
          <span className="text-[9px] uppercase text-zinc-500 font-black tracking-widest flex items-center gap-1">
            <Clock size={10} /> Histórico Simulado de Hoje
          </span>
          <span className="text-[9px] font-mono text-zinc-600 font-bold">
            {simulation.trades.length} {simulation.trades.length === 1 ? 'operação' : 'operações'}
          </span>
        </div>

        <div className="max-h-[160px] overflow-y-auto pr-1 space-y-1.5 text-[10px] custom-scrollbar">
          {simulation.trades.length === 0 ? (
            <div className="text-center py-6 text-zinc-600 font-medium bg-zinc-900/20 border border-dashed border-white/5 rounded-xl">
              Nenhuma simulação realizada hoje ainda.
              <span className="block text-[8px] mt-0.5 text-zinc-600/70">As simulações ocorrem automaticamente à medida que os sinais de hoje expiram.</span>
            </div>
          ) : (
            simulation.trades.map((trade, i) => (
              <div 
                key={`${trade.id}-${i}`}
                className="p-2.5 bg-zinc-900/30 hover:bg-zinc-900/60 rounded-lg border border-white/5 flex items-center justify-between transition-colors"
              >
                <div className="flex items-center gap-2">
                  <div className={`h-5 w-5 rounded flex items-center justify-center text-[10px] font-black ${
                    trade.result === 'WIN' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'
                  }`}>
                    {trade.result === 'WIN' ? 'W' : 'L'}
                  </div>
                  <div>
                    <div className="flex items-center gap-1">
                      <span className="font-extrabold text-white">{trade.asset}</span>
                      <span className="text-[8px] bg-zinc-800 text-zinc-400 px-1 py-0.2 rounded font-sans pr-1 font-bold">{trade.timeframe}</span>
                      {typeof trade.wickSize === 'number' && (
                        <span className="text-[8px] bg-amber-500/10 text-amber-400 px-1 rounded font-mono font-bold" title="Confirmação do Pavio">
                          🕯️ {trade.wickSize.toFixed(1)}%
                        </span>
                      )}
                    </div>
                    <span className="text-[8px] text-zinc-500 font-medium block">
                      {trade.time} • {trade.type === 'CALL' ? 'CALL (COMPRA)' : 'PUT (VENDA)'}
                    </span>
                    {trade.wickStatus && (
                      <span className={`text-[7px] font-semibold block ${trade.result === 'WIN' ? 'text-emerald-400/80' : 'text-zinc-500'}`}>
                        {trade.wickStatus}
                      </span>
                    )}
                  </div>
                </div>

                <div className="text-right">
                  <span className="font-mono text-zinc-400 block text-[9px]">Entrada: ${trade.betAmount.toFixed(2)}</span>
                  <span className={`font-mono font-bold text-[9px] ${trade.result === 'WIN' ? 'text-emerald-400' : 'text-rose-500'}`}>
                    {trade.result === 'WIN' ? '+' : ''}${trade.profit.toFixed(2)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Actions Grid */}
      <div className="space-y-2 border-t border-white/5 pt-4">
        <div className="grid grid-cols-2 gap-2">
          {/* Download Report Button */}
          <button
            onClick={handleDownload}
            disabled={simulation.trades.length === 0}
            className="flex items-center justify-center gap-1.5 py-2 px-3 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            title="Baixar Relatório do Dia formatado em .txt"
          >
            <Download size={11} />
            Baixar Relatório
          </button>

          {/* Send to Telegram Button */}
          <button
            onClick={handleTestReport}
            className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all border ${
              sendStatus?.type === 'success'
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : sendStatus?.type === 'error'
                ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border-white/5'
            }`}
            disabled={simulation.trades.length === 0 || sendStatus !== null}
            title={simulation.trades.length === 0 ? "Faça pelo menos uma operação para poder enviar o relatório" : "Enviar Resumo do Dia agora para o chat do Telegram"}
          >
            <Send size={11} className={sendStatus ? 'animate-pulse' : ''} />
            {sendStatus ? sendStatus.msg : 'Enviar Telegram'}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {/* Daily Archives / Reports */}
          {onOpenDailyReports && (
            <button
              onClick={onOpenDailyReports}
              className="flex items-center justify-center gap-1.5 py-2 px-3 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-white/5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer"
              title="Visualizar histórico e baixar relatórios de todos os dias de operações"
            >
              <Calendar size={11} className="text-rose-400" />
              Histórico Dias
            </button>
          )}

          {/* Reset Balance */}
          <button
            onClick={onReset}
            className={`flex items-center justify-center gap-1.5 py-2 px-3 bg-[#110c0e] hover:bg-[#1a0e10] text-rose-500/70 hover:text-rose-400 border border-rose-500/10 rounded-lg text-[10px] font-black uppercase tracking-wider transition-colors ${!onOpenDailyReports ? 'col-span-2' : ''}`}
          >
            <Trash2 size={11} />
            Resetar Banca
          </button>
        </div>
      </div>
    </div>
  );
}
