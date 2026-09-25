/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { X, Calendar, Download, Send, CheckCircle2, TrendingUp, TrendingDown, Layers, FileText, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Signal } from '../types';
import {
  calculateDailySimulation,
  generateReportText,
  downloadReportFile,
  getSPDateStr,
  DailySimulation
} from '../utils/reportUtils';

interface DailyReportsModalProps {
  isOpen: boolean;
  onClose: () => void;
  allSignals: Signal[];
  availableDates: string[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
  onSendTelegram: (text: string) => Promise<{ success: boolean; message: string }>;
}

export function DailyReportsModal({
  isOpen,
  onClose,
  allSignals,
  availableDates,
  selectedDate,
  onSelectDate,
  onSendTelegram
}: DailyReportsModalProps) {
  const [sendingDate, setSendingDate] = useState<string | null>(null);
  const [sendResult, setSendResult] = useState<{ date: string; success: boolean; msg: string } | null>(null);
  const todayStr = getSPDateStr();

  if (!isOpen) return null;

  // Monta sumário para cada data disponível
  const dailySummaries = availableDates.map(dateStr => {
    const sim = calculateDailySimulation(allSignals, dateStr);
    const winCount = sim.trades.filter(t => t.result === 'WIN').length;
    const lossCount = sim.trades.filter(t => t.result === 'LOSS').length;
    const total = sim.trades.length;
    const netProfit = +(sim.balance - sim.initialBalance).toFixed(2);
    const winRate = total > 0 ? ((winCount / total) * 100).toFixed(1) : '0.0';

    const tradesWithWick = sim.trades.filter(t => typeof t.wickSize === 'number');
    const avgWick = tradesWithWick.length > 0
      ? (tradesWithWick.reduce((acc, t) => acc + (t.wickSize || 0), 0) / tradesWithWick.length).toFixed(1)
      : null;

    return {
      dateStr,
      isToday: dateStr === todayStr,
      sim,
      total,
      winCount,
      lossCount,
      netProfit,
      winRate,
      avgWick
    };
  });

  const handleDownloadDay = (sim: DailySimulation, dateStr: string) => {
    const text = generateReportText(sim);
    const cleanDate = dateStr.replace(/\//g, '-');
    downloadReportFile(text, `Relatorio_SMC_${cleanDate}.txt`);
  };

  const handleDownloadAllDays = () => {
    let combined = `====================================================\n`;
    combined += `  HISTÓRICO CONSOLIDADO DE OPERAÇÕES - SMC QUANTUM  \n`;
    combined += `  Gerado em: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}\n`;
    combined += `====================================================\n\n`;

    dailySummaries.forEach(summary => {
      combined += generateReportText(summary.sim);
      combined += `\n\n${'='.repeat(52)}\n\n`;
    });

    downloadReportFile(combined, `Relatorio_SMC_Consolidado_Todos_Os_Dias.txt`);
  };

  const handleSendTelegram = async (sim: DailySimulation, dateStr: string) => {
    setSendingDate(dateStr);
    const text = generateReportText(sim);
    const res = await onSendTelegram(text);
    setSendResult({ date: dateStr, success: res.success, msg: res.message });
    setSendingDate(null);
    setTimeout(() => setSendResult(null), 4000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="bg-[#0e0e12] border border-white/10 rounded-[2rem] w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-white/5 flex items-center justify-between bg-zinc-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-rose-500/10 rounded-xl text-rose-400">
              <Calendar size={20} />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-white uppercase tracking-tight flex items-center gap-2">
                Relatórios Diários de Operações
                <span className="text-[9px] bg-rose-500/20 text-rose-400 px-2 py-0.5 rounded-full font-bold">
                  {dailySummaries.length} {dailySummaries.length === 1 ? 'dia' : 'dias'}
                </span>
              </h2>
              <p className="text-[11px] text-zinc-400">
                Baixe o relatório oficial com confirmação de pavio ou selecione o dia para visualizar no sistema.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white rounded-xl hover:bg-white/5 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Global Toolbar */}
        <div className="p-4 bg-zinc-900/40 border-b border-white/5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-zinc-400 text-xs font-semibold">
            <Sparkles size={14} className="text-amber-400" />
            <span>Dados 100% reais segregados por dia, sem mistura de sessões.</span>
          </div>

          <button
            onClick={handleDownloadAllDays}
            className="flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 text-zinc-200 hover:text-white rounded-xl text-xs font-bold transition-all border border-white/10"
          >
            <Download size={13} />
            Baixar Todos os Dias (.txt)
          </button>
        </div>

        {/* Days List */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-3 custom-scrollbar flex-1">
          {dailySummaries.length === 0 ? (
            <div className="text-center py-12 text-zinc-500">
              Nenhum dia de operação registrado ainda.
            </div>
          ) : (
            dailySummaries.map(summary => {
              const isSelected = selectedDate === summary.dateStr;
              const isSending = sendingDate === summary.dateStr;
              const currentSendRes = sendResult?.date === summary.dateStr ? sendResult : null;

              return (
                <div
                  key={summary.dateStr}
                  className={`p-4 sm:p-5 rounded-2xl border transition-all ${
                    isSelected
                      ? 'bg-zinc-900/90 border-rose-500/40 shadow-lg shadow-rose-500/5'
                      : 'bg-zinc-900/40 hover:bg-zinc-900/60 border-white/5'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="text-base sm:text-lg font-black text-white font-mono">
                        {summary.dateStr}
                      </div>
                      {summary.isToday && (
                        <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 animate-pulse">
                          Hoje
                        </span>
                      )}
                      {isSelected && (
                        <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-400 border border-rose-500/30">
                          Ativo na tela
                        </span>
                      )}
                    </div>

                    {/* Stats pills */}
                    <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono">
                      <span className="bg-zinc-800 text-zinc-300 px-2 py-1 rounded-lg font-bold">
                        {summary.total} sinais
                      </span>
                      <span className="bg-emerald-500/10 text-emerald-400 px-2 py-1 rounded-lg font-bold">
                        {summary.winRate}% ({summary.winCount}W - {summary.lossCount}L)
                      </span>
                      <span className={`px-2 py-1 rounded-lg font-bold ${
                        summary.netProfit >= 0
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : 'bg-rose-500/10 text-rose-400'
                      }`}>
                        {summary.netProfit >= 0 ? '+' : ''}${summary.netProfit.toFixed(2)}
                      </span>
                      {summary.avgWick && (
                        <span className="bg-amber-500/10 text-amber-400 px-2 py-1 rounded-lg font-bold" title="Média de retração de pavio dos sinais">
                          🕯️ Pavio: {summary.avgWick}%
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions for this day */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-white/5">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          onSelectDate(summary.dateStr);
                          onClose();
                        }}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 ${
                          isSelected
                            ? 'bg-rose-500 text-white'
                            : 'bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white'
                        }`}
                      >
                        <Layers size={13} />
                        {isSelected ? 'Exibindo na Tela' : 'Ver Sinais deste Dia'}
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleDownloadDay(summary.sim, summary.dateStr)}
                        className="px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                        title="Baixar relatório formatado .txt deste dia"
                      >
                        <Download size={13} />
                        Baixar Relatório (.txt)
                      </button>

                      <button
                        onClick={() => handleSendTelegram(summary.sim, summary.dateStr)}
                        disabled={isSending}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border ${
                          currentSendRes?.success
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                            : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-white/5'
                        }`}
                        title="Enviar este relatório para o Telegram agora"
                      >
                        <Send size={12} className={isSending ? 'animate-pulse' : ''} />
                        {isSending ? 'Enviando...' : currentSendRes?.success ? 'Enviado!' : 'Telegram'}
                      </button>
                    </div>
                  </div>

                  {currentSendRes && !currentSendRes.success && (
                    <div className="mt-2 text-[10px] text-rose-400">
                      Erro ao enviar: {currentSendRes.msg}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/5 bg-zinc-950/60 flex items-center justify-between">
          <span className="text-zinc-500 text-xs">
            Gerenciamento Soros $ 100 • 1 Mão de Soro Independente por Ativo
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-xs font-bold transition-all"
          >
            Fechar
          </button>
        </div>
      </motion.div>
    </div>
  );
}
