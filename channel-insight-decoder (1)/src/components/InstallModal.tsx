import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Download, X, Monitor, Smartphone, Check, ArrowUpRight, Share2, PlusSquare, MoreVertical, Settings } from 'lucide-react';

interface InstallModalProps {
  isOpen: boolean;
  onClose: () => void;
  showInstallBtn: boolean;
  onInstall: () => void;
}

export function InstallModal({ isOpen, onClose, showInstallBtn, onInstall }: InstallModalProps) {
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
          className="fixed inset-0 bg-black/90 backdrop-blur-md"
        />

        {/* Modal body */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ type: 'spring', damping: 25, stiffness: 220 }}
          className="relative bg-[#0b0b0c] border border-white/10 rounded-[2rem] max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-[0_50px_100px_-20px_rgba(244,63,94,0.15)] z-10 custom-scrollbar"
        >
          {/* Top aesthetic gradient flare */}
          <div className="absolute top-0 right-0 h-40 w-40 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute top-0 left-0 h-40 w-40 bg-purple-500/5 rounded-full blur-3xl pointer-events-none" />

          {/* Close button */}
          <button 
            onClick={onClose}
            className="absolute top-6 right-6 h-8 w-8 rounded-full bg-zinc-900 border border-white/5 hover:border-white/15 text-zinc-400 hover:text-white flex items-center justify-center cursor-pointer transition-all active:scale-90"
          >
            <X size={16} />
          </button>

          <div className="p-6 sm:p-8">
            {/* Modal Title */}
            <div className="flex items-center gap-4 mb-6">
              <div className="h-10 w-10 bg-rose-500/10 rounded-2xl flex items-center justify-center text-rose-500 shadow-lg shadow-rose-500/10">
                <Download size={20} />
              </div>
              <div>
                <h3 className="text-lg sm:text-xl font-black text-white uppercase tracking-tighter leading-none">Instalar Aplicativo</h3>
                <span className="text-[10px] font-mono text-rose-400 uppercase tracking-widest mt-1 block">Acesso Instantâneo e Estabilidade</span>
              </div>
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed font-medium mb-6">
              Transforme a plataforma Crypto Sentinel num aplicativo de alto desempenho instalado no seu dispositivo. Funciona offline, ocupa menos memória, abre sem as barras do navegador e carrega instantaneamente!
            </p>

            {/* CRITICAL PWA ALERT FOR IFRAME / IN-APP BROWSERS */}
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 mb-6 space-y-2">
              <div className="flex gap-2 items-start">
                <span className="text-amber-500 shrink-0 mt-0.5 font-bold text-sm">🚨</span>
                <div>
                  <h4 className="text-xs font-black text-amber-400 uppercase tracking-wide">Aviso Crucial de Instalação</h4>
                  <p className="text-[10px] text-zinc-300 leading-relaxed mt-1">
                    Você **NÃO** consegue instalar o aplicativo se estiver visualizando ele de dentro do chat do AI Studio ou de dentro de navegadores embutidos de redes sociais. 
                  </p>
                </div>
              </div>
              <div className="text-[10px] text-zinc-400 bg-zinc-950/80 p-3 rounded-xl border border-white/5 space-y-2 font-medium">
                <p>
                  Para instalar como <strong className="text-white font-semibold">Aplicativo Oficial (e não mero atalho)</strong>:
                </p>
                <div className="space-y-1.5 pl-1">
                  <p>1. Copie o link abaixo ou use o botão de compartilhar.</p>
                  <p>2. Abra o aplicativo <strong className="text-amber-400 font-bold">Google Chrome</strong> (se for Android) ou <strong className="text-amber-400 font-bold">Safari</strong> (se for iPhone/iOS).</p>
                  <p>3. Cole o link no navegador principal e faça a instalação por lá.</p>
                </div>
                <div className="flex items-center gap-1.5 pt-1.5">
                  <input 
                    type="text" 
                    readOnly 
                    value="https://ais-pre-276bx2i5blf427kq2m6etp-167488839835.us-west2.run.app"
                    className="w-full bg-black border border-white/10 rounded-lg px-2.5 py-1.5 text-[9px] font-mono text-zinc-400 select-all focus:outline-none"
                  />
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText("https://ais-pre-276bx2i5blf427kq2m6etp-167488839835.us-west2.run.app");
                      alert("Link copiado! Cole no Chrome (Android) ou Safari (Safari) do celular para instalar.");
                    }}
                    className="shrink-0 bg-amber-500 hover:bg-amber-600 text-black text-[9px] font-black uppercase px-2.5 py-1.5 rounded-lg active:scale-95 transition-transform cursor-pointer font-bold"
                  >
                    Copiar Link
                  </button>
                </div>
              </div>
            </div>

            {showInstallBtn ? (
              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-rose-500/5 border border-rose-500/15 flex items-start gap-3">
                  <Sparkles className="text-rose-500 shrink-0 mt-0.5" size={16} />
                  <div>
                    <h4 className="text-xs font-black text-white uppercase">Instalação Nativa Disponível!</h4>
                    <p className="text-[10px] text-zinc-400 leading-relaxed mt-0.5">Seu navegador suporta instalação com 1 clique direto. Clique abaixo para iniciar.</p>
                  </div>
                </div>

                <button
                  onClick={() => {
                    onInstall();
                    onClose();
                  }}
                  className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-600 hover:to-rose-700 text-white text-xs font-black uppercase tracking-wider transition-all shadow-xl shadow-rose-500/20 active:scale-95 cursor-pointer flex items-center justify-center gap-2"
                >
                  <Download size={14} />
                  <span>Instalar Aplicativo Agora</span>
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Manual Onboarding tabs / panels */}
                <div>
                  <h4 className="text-xs font-black text-zinc-300 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <Smartphone size={14} className="text-rose-500" />
                    Como instalar no Safari (iPhone / iOS)
                  </h4>
                  
                  <div className="space-y-3 bg-black/40 p-4 rounded-2xl border border-white/5">
                    <div className="flex gap-3 items-start">
                      <span className="h-6 w-6 rounded-lg bg-zinc-800 text-white font-black font-mono text-[10px] flex items-center justify-center shrink-0 mt-0.5">1</span>
                      <p className="text-[11px] text-zinc-300 font-medium leading-relaxed">
                        Toque no botão de no navegador Safari <span className="inline-flex items-center gap-1 bg-zinc-800 px-2 py-0.5 rounded text-rose-400 font-bold border border-white/5"><Share2 size={11} /> Compartilhar</span> (ícone de seta pra cima na parte inferior).
                      </p>
                    </div>

                    <div className="flex gap-3 items-start">
                      <span className="h-6 w-6 rounded-lg bg-zinc-800 text-white font-black font-mono text-[10px] flex items-center justify-center shrink-0 mt-0.5">2</span>
                      <p className="text-[11px] text-zinc-300 font-medium leading-relaxed">
                        Role a lista de opções para baixo e toque em <span className="inline-flex items-center gap-1 bg-zinc-800 px-2 py-0.5 rounded text-rose-400 font-bold border border-white/5"><PlusSquare size={11} /> Adicionar à Tela de Início</span>.
                      </p>
                    </div>

                    <div className="flex gap-3 items-start">
                      <span className="h-6 w-6 rounded-lg bg-zinc-800 text-white font-black font-mono text-[10px] flex items-center justify-center shrink-0 mt-0.5">3</span>
                      <p className="text-[11px] text-zinc-300 font-medium leading-relaxed">
                        Confirme clicando em <strong className="text-white font-bold">"Adicionar"</strong> no canto superior direito. Pronto! O app aparecerá lindo em sua tela inicial.
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-black text-zinc-300 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <Monitor size={14} className="text-rose-500" />
                    Como instalar no Chrome (Android)
                  </h4>
                  
                  <div className="space-y-3 bg-black/40 p-4 rounded-2xl border border-white/5">
                    <div className="flex gap-3 items-start">
                      <span className="h-6 w-6 rounded-lg bg-zinc-800 text-white font-black font-mono text-[10px] flex items-center justify-center shrink-0 mt-0.5">1</span>
                      <p className="text-[11px] text-zinc-300 font-medium leading-relaxed">
                        Clique no menu de reticências <span className="inline-flex items-center gap-1 bg-zinc-800 px-1.5 py-0.5 rounded text-rose-400 font-bold border border-white/5"><MoreVertical size={11} /></span> localizado no canto superior direito do Google Chrome.
                      </p>
                    </div>

                    <div className="flex gap-3 items-start">
                      <span className="h-6 w-6 rounded-lg bg-zinc-800 text-white font-black font-mono text-[10px] flex items-center justify-center shrink-0 mt-0.5">2</span>
                      <p className="text-[11px] text-zinc-300 font-medium leading-relaxed">
                        Toque na opção <span className="inline-flex items-center gap-1 bg-zinc-800 px-2 py-0.5 rounded text-white font-bold border border-white/5">Instalar aplicativo</span> ou <span className="inline-flex items-center gap-1 bg-zinc-800 px-2 py-0.5 rounded text-white font-bold border border-white/5">Adicionar à tela de início</span>.
                      </p>
                    </div>

                    <div className="flex gap-3 items-start">
                      <span className="h-6 w-6 rounded-lg bg-zinc-800 text-white font-black font-mono text-[10px] flex items-center justify-center shrink-0 mt-0.5">3</span>
                      <p className="text-[11px] text-zinc-300 font-medium leading-relaxed">
                        Confirme no popup e aguarde a conclusão. Viu como é rápido? Seu aplicativo oficial agora inicializará separado do navegador.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <button
              onClick={onClose}
              className="mt-6 w-full py-3 rounded-xl border border-white/5 hover:bg-white/5 text-zinc-400 hover:text-white text-[10px] font-black uppercase tracking-widest transition-colors cursor-pointer"
            >
              Fechar Guia
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
