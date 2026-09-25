import React, { useState, useEffect } from 'react';
import { Calculator, DollarSign, Target, ShieldAlert, ArrowRight, Percent, RefreshCw } from 'lucide-react';
import { motion } from 'motion/react';

export function RiskManager() {
  const [banca, setBanca] = useState<number>(1000);
  const [risco, setRisco] = useState<number>(2);
  const [payout, setPayout] = useState<number>(87);
  
  const valorEntrada = (banca * risco) / 100;
  const lucroPrevisto = (valorEntrada * payout) / 100;
  
  // Martingale Calculator
  const loss1 = valorEntrada;
  const mg1 = (loss1 / (payout / 100)) + loss1;
  const loss2 = loss1 + mg1;
  const mg2 = (loss2 / (payout / 100)) + loss2;

  return (
    <div className="bg-[#0c0c0e] rounded-[1.5rem] p-5 sm:p-6 border border-white/5 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-3xl -z-10 pointer-events-none" />
      
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 sm:p-3 bg-amber-500/10 rounded-xl">
          <Calculator className="text-amber-500" size={20} />
        </div>
        <div>
          <h3 className="text-sm sm:text-base font-black text-white uppercase tracking-wider">Gerenciamento de Risco</h3>
          <p className="text-[10px] text-zinc-500">Calculadora de Entradas e Martingale</p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <label className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider">Banca ($)</label>
            <div className="relative">
              <DollarSign size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input 
                type="number" 
                value={banca} 
                onChange={e => setBanca(Number(e.target.value))}
                className="w-full bg-zinc-900 border border-white/5 rounded-lg py-2 pl-8 pr-3 text-xs text-white focus:outline-none focus:border-amber-500/50 transition-colors"
              />
            </div>
          </div>
          
          <div className="space-y-1.5">
            <label className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider">Risco (%)</label>
            <div className="relative">
              <Percent size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input 
                type="number" 
                value={risco} 
                onChange={e => setRisco(Number(e.target.value))}
                className="w-full bg-zinc-900 border border-white/5 rounded-lg py-2 pl-8 pr-3 text-xs text-white focus:outline-none focus:border-amber-500/50 transition-colors"
                step="0.5"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider">Payout (%)</label>
            <div className="relative">
              <Target size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input 
                type="number" 
                value={payout} 
                onChange={e => setPayout(Number(e.target.value))}
                className="w-full bg-zinc-900 border border-white/5 rounded-lg py-2 pl-8 pr-3 text-xs text-white focus:outline-none focus:border-amber-500/50 transition-colors"
              />
            </div>
          </div>
        </div>

        <div className="bg-zinc-900/50 rounded-xl p-4 border border-white/5">
          <div className="flex justify-between items-center mb-2">
            <span className="text-[10px] uppercase text-zinc-400 font-bold tracking-widest">Ação Operacional</span>
            <span className="text-[10px] uppercase text-emerald-400 font-black">Recomendado</span>
          </div>
          <div className="flex items-end justify-between">
            <div>
              <span className="text-zinc-500 text-[10px] block mb-0.5">Entrada Ideal</span>
              <span className="text-xl sm:text-2xl font-black text-white leading-none">$ {valorEntrada.toFixed(2)}</span>
            </div>
            <div className="text-right">
              <span className="text-zinc-500 text-[10px] block mb-0.5">Lucro Esperado</span>
              <span className="text-lg sm:text-xl font-bold text-emerald-400 leading-none">+$ {lucroPrevisto.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <h4 className="text-[10px] uppercase text-zinc-500 font-black tracking-widest flex items-center gap-1.5">
            <RefreshCw size={10} />
            Proteção Martingale
          </h4>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-zinc-900/30 rounded-lg p-3 border border-white/5">
              <span className="text-[10px] text-zinc-400 block mb-1">Gale 1 (Recuperação)</span>
              <span className="text-sm font-bold text-amber-400">$ {mg1.toFixed(2)}</span>
            </div>
            <div className="bg-zinc-900/30 rounded-lg p-3 border border-white/5">
              <span className="text-[10px] text-zinc-400 block mb-1">Gale 2 (Risco Alto)</span>
              <span className="text-sm font-bold text-rose-400">$ {mg2.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
