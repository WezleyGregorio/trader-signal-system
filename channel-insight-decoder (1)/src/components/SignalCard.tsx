import React from 'react';
import { Signal } from '../types';
import { motion } from 'motion/react';
import { TrendingUp, TrendingDown, Clock, Target, Volume2, ShieldAlert, Zap, CheckCircle2, XCircle, Cpu } from 'lucide-react';
import { format } from 'date-fns';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface SignalCardProps {
  signal: Signal;
  key?: React.Key;
}

export function SignalCard({ signal }: SignalCardProps) {
  const isCall = signal.type === 'CALL';
  const isWin = signal.status === 'WIN';
  const isLoss = signal.status === 'LOSS';
  const isPending = signal.status === 'PENDING';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn(
        "bg-zinc-900/80 backdrop-blur-xl border border-white/5 rounded-[2rem] overflow-hidden shadow-2xl relative group",
        isWin && "border-emerald-500/20",
        isLoss && "border-rose-500/20"
      )}
    >
      <div className={cn(
        "h-2 w-full",
        isCall ? "bg-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.4)]" : "bg-rose-500 shadow-[0_0_20px_rgba(244,63,94,0.4)]",
        isWin && "bg-emerald-400",
        isLoss && "bg-rose-400"
      )} />
      
      <div className="p-6">
        <div className="flex justify-between items-start mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
               <span className="text-[10px] font-black text-rose-500 uppercase tracking-widest">{signal.asset}</span>
               <span className="h-1 w-1 bg-zinc-700 rounded-full" />
               <span className="text-[10px] font-mono text-zinc-500 uppercase">{signal.timeframe} Timeframe</span>
            </div>
            <h3 className="text-xl font-black text-white tracking-tighter">{signal.strategy}</h3>
          </div>
          <div className={cn(
            "px-4 py-2 rounded-2xl text-[11px] font-black flex items-center gap-2 uppercase tracking-wider transition-all",
            isCall ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20" : "bg-rose-500 text-white shadow-lg shadow-rose-500/20"
          )}>
            {isCall ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
            {signal.type}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-white/5 p-4 rounded-3xl border border-white/5 animate-pulse">
             <div className="flex items-center gap-2 text-zinc-500 mb-1">
                <Target size={14} className="text-zinc-400" />
                <span className="text-[9px] font-black uppercase tracking-widest">Preço Alvo</span>
             </div>
             <span className="text-lg font-mono font-bold text-white">${signal.price.toLocaleString()}</span>
          </div>
          <div className="bg-white/5 p-4 rounded-3xl border border-white/5">
             <div className="flex items-center gap-2 text-zinc-500 mb-1">
                <Zap size={14} className="text-rose-500 animate-pulse" />
                <span className="text-[9px] font-black uppercase tracking-widest">Pavio Mínimo</span>
             </div>
             <span className="text-lg font-mono font-bold text-white">{signal.metrics?.wickSize.toFixed(1)}%</span>
          </div>
          
          {/* Assertiveness Precision indicator */}
          <div className="col-span-2 bg-gradient-to-r from-rose-500/10 to-transparent p-4 rounded-3xl border border-rose-500/20">
             <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black text-rose-500 uppercase tracking-wider flex items-center gap-1.5">
                  ⭐ Assertividade Estimada
                </span>
                <span className="text-sm font-mono font-black text-rose-400">{signal.assertiveness || 85}%</span>
             </div>
             <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-rose-600 to-rose-400 transition-all duration-500" 
                  style={{ width: `${signal.assertiveness || 85}%` }} 
                />
             </div>
          </div>
        </div>

        {signal.metrics && (
          <div className="space-y-2 mb-6">
            <div className="flex items-center justify-between text-[11px]">
               <span className="text-zinc-500 font-bold uppercase tracking-widest flex items-center gap-2">
                 <Volume2 size={12} /> Confirmação Volume
               </span>
               <span className={signal.metrics.volumeConfirmation ? "text-emerald-500 font-black" : "text-rose-500 font-black"}>
                 {signal.metrics.volumeConfirmation ? 'ALTO (INSTITUCIONAL)' : 'NORMAL (REMEDIM)'}
               </span>
            </div>
            {signal.metrics.m1ConfirmStatus && (
              <div className="flex items-center justify-between text-[11px] bg-rose-500/5 p-2 rounded-xl border border-rose-500/10">
                 <span className="text-rose-400 font-bold uppercase tracking-widest flex items-center gap-1.5">
                   <Cpu size={12} className="animate-pulse" /> Confirm. Estudo M1 (Pavio)
                 </span>
                 <span className={signal.metrics.m1VolumeClimax ? "text-emerald-400 font-black animate-pulse" : "text-zinc-400"}>
                   {signal.metrics.m1VolumeClimax ? '🔥 ALTO VOL (PAVIO ALTO)' : '✓ VOL NORMAL'}
                 </span>
              </div>
            )}
            {typeof signal.metrics.rsi === 'number' && (
              <div className="flex items-center justify-between text-[11px]">
                 <span className="text-zinc-500 font-bold uppercase tracking-widest flex items-center gap-2">
                   <Clock size={12} /> RSI (14) GLOBAL
                 </span>
                 <span className={cn(
                   "font-black uppercase",
                   signal.metrics.rsi >= 80 ? "text-rose-400" : signal.metrics.rsi <= 20 ? "text-emerald-400" : "text-zinc-400"
                 )}>
                   {signal.metrics.rsi.toFixed(1)} {signal.metrics.rsi >= 80 ? '(SOBRECOMPRADO)' : signal.metrics.rsi <= 20 ? '(SOBREVENDIDO)' : ''}
                 </span>
              </div>
            )}
            {signal.metrics.bbTension && (
              <div className="flex items-center justify-between text-[11px] bg-blue-500/5 p-2 rounded-xl border border-blue-500/10">
                 <span className="text-blue-400 font-bold uppercase tracking-widest flex items-center gap-1.5">
                   <Target size={12} className="animate-pulse" /> Tensão de Bollinger
                 </span>
                 <span className="text-blue-400 font-black animate-pulse">
                   ELÁSTICO ESTICADO
                 </span>
              </div>
            )}
            <div className="flex items-center justify-between text-[11px]">
               <span className="text-zinc-500 font-bold uppercase tracking-widest flex items-center gap-2">
                 <ShieldAlert size={12} /> Alinhamento Tendência
               </span>
               <span className={signal.metrics.trendAlignment === 'ALIGNED' ? "text-emerald-500 font-black" : "text-amber-500 font-black"}>
                 {signal.metrics.trendAlignment === 'ALIGNED' ? 'A FAVOR DA TENDÊNCIA' : 'MICRO RETRAÇÃO'}
               </span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
               <span className="text-zinc-500 font-bold uppercase tracking-widest flex items-center gap-2">
                 <ShieldAlert size={12} /> Fase de Wyckoff
               </span>
               <span className="text-zinc-200 font-black uppercase">{signal.metrics.wyckoffPhase}</span>
            </div>
          </div>
        )}

        {/* Results Section */}
        {!isPending && (
          <div className={cn(
            "mb-6 p-4 rounded-3xl flex items-center justify-between border",
            isWin ? "bg-emerald-500/10 border-emerald-500/20" : "bg-rose-500/10 border-rose-500/20"
          )}>
            <div className="flex items-center gap-3">
              {isWin ? <CheckCircle2 className="text-emerald-500" size={24} /> : <XCircle className="text-rose-500" size={24} />}
              <div>
                <span className={cn("text-[10px] font-black uppercase tracking-widest", isWin ? "text-emerald-500" : "text-rose-500")}>
                  {isWin ? 'WIN (Retração Confirmada)' : 'LOSS (Rompimento)'}
                </span>
                <p className="text-xs text-zinc-400">Final: ${signal.resultPrice?.toLocaleString()}</p>
                {typeof signal.metrics?.wickSize === 'number' && (
                  <span className="text-[9px] font-mono text-zinc-400 block mt-0.5">
                    🕯️ Pavio: {signal.metrics.wickSize.toFixed(1)}% • {isWin ? '✅ Pavio Respeitado' : '❌ Rompeu Zona'}
                  </span>
                )}
              </div>
            </div>
            <span className={cn("text-xs font-black", isWin ? "text-emerald-400" : "text-rose-400")}>
              {isWin ? '+100%' : '0%'}
            </span>
          </div>
        )}

        <div className="pt-4 border-t border-zinc-800/50 flex justify-between items-center">
          <div className="flex items-center gap-2">
             <div className={cn("h-1.5 w-1.5 rounded-full", isPending ? "bg-rose-500 animate-pulse" : "bg-zinc-700")} />
             <span className="text-[10px] text-zinc-600 font-mono font-bold">
               {new Date(signal.timestamp).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
             </span>
          </div>
          <div className="flex items-center gap-2">
             <Clock size={12} className="text-zinc-600" />
             <span className="text-[10px] text-zinc-600 font-mono uppercase font-bold">
               Exp: {new Date(signal.expiryTimestamp).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })}
             </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
