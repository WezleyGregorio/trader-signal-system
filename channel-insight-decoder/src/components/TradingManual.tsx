import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { BookOpen, ShieldCheck, Play, Sparkles, AlertCircle, TrendingUp, Cpu, X } from 'lucide-react';

interface TradingManualModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'manual' | 'confluence';
}

export function TradingManualModal({ isOpen, onClose, initialTab = 'manual' }: TradingManualModalProps) {
  const [activeTab, setActiveTab] = useState<'manual' | 'confluence'>(initialTab);

  // Sync active tab state if requested on modal re-open
  React.useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab, isOpen]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop overlay */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/85 backdrop-blur-md"
        />

        {/* Modal body */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ type: 'spring', damping: 25, stiffness: 220 }}
          className="relative bg-[#0b0b0c] border border-white/10 rounded-[2rem] max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-3xl z-10 custom-scrollbar"
        >
          {/* Top aesthetic gradient flare */}
          <div className="absolute top-0 right-0 h-40 w-40 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute top-0 left-0 h-40 w-40 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

          {/* Close button */}
          <button 
            onClick={onClose}
            className="absolute top-6 right-6 h-8 w-8 rounded-full bg-zinc-900 border border-white/5 hover:border-white/15 text-zinc-400 hover:text-white flex items-center justify-center cursor-pointer transition-all active:scale-90"
          >
            <X size={16} />
          </button>

          <div className="p-6 sm:p-8">
            {/* Modal Title */}
            <div className="flex items-center gap-4 mb-6 sm:mb-8 pr-10">
              <div className="h-10 w-10 bg-rose-500/10 rounded-2xl flex items-center justify-center text-rose-500">
                <BookOpen size={20} />
              </div>
              <div>
                <h3 className="text-lg sm:text-xl font-black text-white uppercase tracking-tighter leading-none">Manual & Estudos SMC</h3>
                <span className="text-[10px] font-mono text-zinc-500">Documentação e diretrizes do motor neural Quantum</span>
              </div>
            </div>

            {/* High-tech Selector Tabs */}
            <div className="flex bg-black/40 p-1 rounded-xl border border-white/5 mb-6 sm:mb-8">
              <button 
                onClick={() => setActiveTab('manual')}
                className={`flex-1 py-2 rounded-lg text-xs font-black uppercase tracking-wide transition-all flex items-center justify-center gap-2 ${activeTab === 'manual' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-white'}`}
              >
                <Play size={12} />
                Manual de Operação
              </button>
              <button 
                onClick={() => setActiveTab('confluence')}
                className={`flex-1 py-2 rounded-lg text-xs font-black uppercase tracking-wide transition-all flex items-center justify-center gap-2 ${activeTab === 'confluence' ? 'bg-zinc-805 bg-zinc-800 text-white' : 'text-zinc-500 hover:text-white'}`}
              >
                <ShieldCheck size={12} />
                Guia de Confluência
              </button>
            </div>

            {/* Tab content conditional rendering */}
            {activeTab === 'manual' ? (
              <div className="space-y-6">
                <h4 className="text-xs font-black text-rose-500 uppercase tracking-widest flex items-center gap-2">
                  <Play size={12} /> Execução Sem Erros (Passo a Passo)
                </h4>
                
                <div className="space-y-4">
                  <div className="flex gap-4 p-4 bg-black/30 rounded-2xl border border-white/5 hover:border-white/10 transition-colors">
                    <span className="h-8 w-8 rounded-xl bg-zinc-800 text-white font-black font-mono text-xs flex items-center justify-center shrink-0">
                      01
                    </span>
                    <div>
                      <p className="text-xs font-black text-white uppercase">Ajuste o Par de Moedas</p>
                      <p className="text-[11px] text-zinc-400 mt-1">Ao receber o alerta (ex: BTCUSDT), abra imediatamente o mesmo par de moedas em sua corretora de preferência.</p>
                    </div>
                  </div>

                  <div className="flex gap-4 p-4 bg-black/30 rounded-2xl border border-white/5 hover:border-white/10 transition-colors">
                    <span className="h-8 w-8 rounded-xl bg-zinc-800 text-white font-black font-mono text-xs flex items-center justify-center shrink-0">
                      02
                    </span>
                    <div>
                      <p className="text-xs font-black text-white uppercase">Foco de Ativos e Timeframes</p>
                      <p className="text-[11px] text-zinc-400 mt-1">
                        <strong>Bitcoin:</strong> Focado em <strong>M5 e M15</strong> (operações de 1 a 5 minutos na Polarium).<br/>
                        <strong>Solana, BNB e Dogecoin:</strong> Focados exclusivamente em <strong>M15</strong> (sem M5) para operar na Binarium.
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-4 p-4 bg-black/30 rounded-2xl border border-white/5 hover:border-white/10 transition-colors">
                    <span className="h-8 w-8 rounded-xl bg-zinc-800 text-rose-500 font-black font-mono text-xs flex items-center justify-center shrink-0">
                      03
                    </span>
                    <div>
                      <p className="text-xs font-black text-white uppercase">Vencimento e Entrada Máxima (M15)</p>
                      <p className="text-[11px] text-rose-400 mt-1">
                        Nas operações de <strong>M15</strong> (Solana, BNB, Dogecoin, BTC), a entrada só é válida até o tempo de <strong>9 minutos e 59 segundos</strong> de vida do candle. Se entrar nos 10 minutos em diante, a corretora Binarium rola o vencimento para a próxima vela de 15m (30 minutos adiante), inviabilizando nossa retração de pavio planejada.
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-4 p-4 bg-black/30 rounded-2xl border border-white/5 hover:border-white/10 transition-colors">
                    <span className="h-8 w-8 rounded-xl bg-zinc-800 text-white font-black font-mono text-xs flex items-center justify-center shrink-0">
                      04
                    </span>
                    <div>
                      <p className="text-xs font-black text-white uppercase">Ordem de Compra ou Venda (CALL/PUT)</p>
                      <p className="text-[11px] text-zinc-400 mt-1">
                        Se o sinal for do tipo <strong>CALL (Compra)</strong>, execute a operação de compra (Botão Verde) ao toque na linha suporte recomendada. Se for <strong>PUT (Venda)</strong>, execute a operação de venda (Botão Vermelho) no toque da linha de resistência.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <h4 className="text-xs font-black text-emerald-500 uppercase tracking-widest flex items-center gap-2">
                  <ShieldCheck size={12} /> Inteligência de Confluência Extrema
                </h4>

                <div className="bg-gradient-to-br from-emerald-500/5 to-transparent p-6 rounded-3xl border border-emerald-500/10 space-y-4">
                  <p className="text-xs text-zinc-300 leading-relaxed">
                    O algoritmo neural SMC Quantum calcula instantaneamente as principais confluências institucionais. Siga estas diretrizes para filtrar as melhores entradas:
                  </p>

                  <div className="space-y-3.5">
                    <div className="flex items-start gap-2.5">
                      <Sparkles size={14} className="text-emerald-500 shrink-0 mt-0.5" />
                      <p className="text-[11px] text-zinc-300">
                        <strong className="text-white">Assertividade ≥ 80%:</strong> Priorize os sinais com pontuação avançada acima de 80%, pois eles unificam volume e retração extrema.
                      </p>
                    </div>

                    <div className="flex items-start gap-2.5">
                      <TrendingUp size={14} className="text-emerald-500 shrink-0 mt-0.5" />
                      <p className="text-[11px] text-zinc-300">
                        <strong className="text-white">Macro Tendência:</strong> Opções marcadas como <span className="text-emerald-400 font-bold">"A FAVOR DA TENDÊNCIA"</span> têm chances estatísticas superiores, pois as instituições estão injetando capital a favor do mercado.
                      </p>
                    </div>

                    <div className="flex items-start gap-2.5">
                      <Cpu size={14} className="text-emerald-500 shrink-0 mt-0.5" />
                      <p className="text-[11px] text-zinc-300">
                        <strong className="text-white">Zonas de Orderblock (OB):</strong> Sinais gerados próximos a Order Blocks institucionais representam regiões de altíssima rejeição de preço.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-rose-500/5 rounded-2xl border border-rose-500/10 flex items-start gap-3">
                  <AlertCircle size={16} className="text-rose-500 shrink-0 mt-0.5" />
                  <p className="text-[10px] text-zinc-400 leading-normal">
                    <strong className="text-zinc-200">Aviso de Gestão:</strong> O mercado financeiro possui volatilidade. Use stop-loss rígido, não opere com moedas fora de tendência extrema em horários de notícias de alto impacto (3 Touros / USD).
                  </p>
                </div>
              </div>
            )}

            {/* Bottom dialog footer controls */}
            <div className="mt-8 pt-6 border-t border-white/5 flex justify-end">
              <button 
                onClick={onClose}
                className="px-5 py-2.5 rounded-xl bg-zinc-900 border border-white/5 hover:border-white/10 text-xs font-black uppercase text-zinc-300 hover:text-white transition-all active:scale-95 cursor-pointer"
              >
                Fechar Painel
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
