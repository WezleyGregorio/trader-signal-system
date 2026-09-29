import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, X, Volume2, VolumeX, Send, HelpCircle, Check, Shield, RefreshCcw } from 'lucide-react';
import { Signal } from '../types';

interface AlertSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isSoundEnabled: boolean;
  onSoundToggle: (enabled: boolean) => void;
  isAutoRecoveryEnabled: boolean;
  onAutoRecoveryToggle: (enabled: boolean) => void;
  onSettingsChange: (settings: { telegramToken: string; telegramChatId: string; webhookUrl: string }) => void;
}

export function AlertSettingsModal({
  isOpen,
  onClose,
  isSoundEnabled,
  onSoundToggle,
  isAutoRecoveryEnabled,
  onAutoRecoveryToggle,
  onSettingsChange
}: AlertSettingsModalProps) {
  const [telegramToken, setTelegramToken] = useState(() => localStorage.getItem('sentinel_tg_token') || '8819856103:AAF7qEa8rBBttiwza52Pj6-DSuCZSFC_1as');
  const [telegramChatId, setTelegramChatId] = useState(() => localStorage.getItem('sentinel_tg_chatid') || '8561094480');
  const [webhookUrl, setWebhookUrl] = useState(() => localStorage.getItem('sentinel_webhook_url') || '');

  const [testStatus, setTestStatus] = useState<'IDLE' | 'SENDING' | 'SUCCESS' | 'ERROR'>('IDLE');
  const [showGuide, setShowGuide] = useState(false);

  // Sync to local storage and trigger parent state update
  useEffect(() => {
    localStorage.setItem('sentinel_tg_token', telegramToken);
    localStorage.setItem('sentinel_tg_chatid', telegramChatId);
    localStorage.setItem('sentinel_webhook_url', webhookUrl);
    
    onSettingsChange({ telegramToken, telegramChatId, webhookUrl });
  }, [telegramToken, telegramChatId, webhookUrl]);

  // Read latest local storage values when modal opens to stay synchronized
  useEffect(() => {
    if (isOpen) {
      setTelegramToken(localStorage.getItem('sentinel_tg_token') || '8819856103:AAF7qEa8rBBttiwza52Pj6-DSuCZSFC_1as');
      setTelegramChatId(localStorage.getItem('sentinel_tg_chatid') || '8561094480');
      setWebhookUrl(localStorage.getItem('sentinel_webhook_url') || '');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const testTrigger = async () => {
    if (!telegramToken && !telegramChatId && !webhookUrl) {
      alert("Por favor, preencha as configurações do Telegram ou Webhook para enviar um teste.");
      return;
    }

    setTestStatus('SENDING');
    try {
      let telegramSuccess = true;
      let webhookSuccess = true;

      const dummySignal: Signal = {
        id: `TEST-${Date.now()}`,
        asset: 'BTCUSDT',
        type: 'CALL',
        timeframe: 'M15',
        price: 68500,
        timestamp: Date.now(),
        expiryTimestamp: Date.now() + 900000,
        strategy: 'SMC Institutional Flow (TEST)',
        status: 'PENDING',
        metrics: {
          wickSize: 52.4,
          volumeConfirmation: true,
          wyckoffPhase: 'Spring'
        }
      };

      if (telegramToken && telegramChatId) {
        const tgRes = await fetch(`/api/telegram/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: telegramToken,
            chatId: telegramChatId,
            text: `🔔 *TESTE DE INTEGRAÇÃO MODAL* 🔔\n\n` +
                  `*Sinalizador:* Crypto Sentinel Neural Engine\n` +
                  `*Status:* Conectado com sucesso em tempo recorde!\n\n` +
                  `Configuração realizada através do menu de acesso rápido.`
          })
        });
        if (!tgRes.ok) telegramSuccess = false;
      }

      if (webhookUrl) {
        const whRes = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: 'test_connection',
            app: 'Crypto Sentinel',
            timestamp: Date.now(),
            mockSignal: dummySignal
          })
        });
        if (!whRes.ok) webhookSuccess = false;
      }

      if (telegramSuccess && webhookSuccess) {
        setTestStatus('SUCCESS');
        setTimeout(() => setTestStatus('IDLE'), 3000);
      } else {
        setTestStatus('ERROR');
        setTimeout(() => setTestStatus('IDLE'), 4000);
      }
    } catch (err) {
      console.error(err);
      setTestStatus('ERROR');
      setTimeout(() => setTestStatus('IDLE'), 4000);
    }
  };

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
          className="relative bg-[#0b0b0c] border border-white/10 rounded-[2rem] max-w-xl w-full max-h-[90vh] overflow-y-auto shadow-3xl z-10 custom-scrollbar"
        >
          {/* Aesthetics */}
          <div className="absolute top-0 right-0 h-40 w-40 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute top-0 left-0 h-40 w-40 bg-zinc-500/5 rounded-full blur-3xl pointer-events-none" />

          {/* Close button */}
          <button 
            onClick={onClose}
            className="absolute top-6 right-6 h-8 w-8 rounded-full bg-zinc-900 border border-white/5 hover:border-white/15 text-zinc-400 hover:text-white flex items-center justify-center cursor-pointer transition-all active:scale-90"
          >
            <X size={16} />
          </button>

          <div className="p-6 sm:p-8 space-y-6">
            {/* Modal Title */}
            <div className="flex items-center justify-between pr-10">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 bg-rose-500/10 rounded-2xl flex items-center justify-center text-rose-500">
                  <Bell size={20} className="animate-pulse" />
                </div>
                <div>
                  <h3 className="text-lg sm:text-xl font-black text-white uppercase tracking-tighter leading-none">Canais de Recebimento</h3>
                  <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mt-1 block">Configuração de Alertas de Sinais</span>
                </div>
              </div>
              
              <div className="flex gap-2">
                <button 
                  onClick={() => onAutoRecoveryToggle(!isAutoRecoveryEnabled)}
                  className={`p-2.5 rounded-xl transition-all cursor-pointer ${isAutoRecoveryEnabled ? 'bg-sky-500/10 text-sky-500' : 'bg-zinc-800 text-zinc-500 hover:text-zinc-400'}`}
                  title={isAutoRecoveryEnabled ? "Auto-Recovery ativado (reconecta a cada 30s se houver erro)" : "Auto-Recovery desativado"}
                >
                  <RefreshCcw size={18} className={isAutoRecoveryEnabled ? 'animate-spin-slow' : ''} />
                </button>
                <button 
                  onClick={() => onSoundToggle(!isSoundEnabled)}
                  className={`p-2.5 rounded-xl transition-all cursor-pointer ${isSoundEnabled ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}
                  title={isSoundEnabled ? "Alertas sonoros ativos" : "Alertas sonoros mutados"}
                >
                  {isSoundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
                </button>
              </div>
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed font-medium">
              Não perca nenhuma oportunidade de compra ou venda! Ative os alertas sonoros locais ou envie os dados em tempo real direto para o seu celular através do Telegram ou do seu Webhook customizado.
            </p>

            <div className="space-y-4">
              {/* Telegram Configuration Group */}
              <div className="space-y-3 bg-black/40 p-5 rounded-3xl border border-white/5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-white uppercase tracking-widest flex items-center gap-2">
                    <span className="h-1.5 w-1.5 bg-sky-450 bg-sky-400 rounded-full" />
                    Telegram Messenger
                  </span>
                  <button 
                    onClick={() => setShowGuide(!showGuide)}
                    className="text-[10px] font-black text-rose-500/70 hover:text-rose-500 font-mono flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <HelpCircle size={12} /> Como configurar?
                  </button>
                </div>

                {showGuide && (
                  <div className="text-[10px] text-zinc-400 font-medium bg-black/50 p-4 rounded-2xl border border-white/5 space-y-1.5 ml-1.5 list-decimal leading-relaxed">
                    <p className="font-extrabold text-white uppercase">Siga estes 3 passos simples:</p>
                    <p>1. Procure pelo <strong className="text-zinc-100">@BotFather</strong> no Telegram e digite <code className="bg-zinc-805 bg-zinc-800 text-zinc-350 px-1.5 py-0.5 rounded">/newbot</code> para criar seu bot e copiar o seu <strong className="text-zinc-100">Token</strong>.</p>
                    <p>2. Inicie uma conversa com seu bot clicando em "Começar" ou "Start".</p>
                    <p>3. Abra o bot <strong className="text-zinc-100">@userinfobot</strong> para copiar seu <strong className="text-zinc-100">Chat ID</strong> numérico. Insira ambos abaixo.</p>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="text-[9px] font-black text-zinc-500 uppercase tracking-widest block mb-1">Bot Token API</label>
                    <input 
                      type="text" 
                      placeholder="Ex: 8593829482:AAFlsh_93Hdf..."
                      value={telegramToken}
                      onChange={(e) => setTelegramToken(e.target.value)}
                      className="w-full bg-zinc-950 border border-white/5 rounded-xl px-3 py-2.5 text-xs font-mono text-zinc-300 focus:outline-none focus:border-rose-500/50 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-black text-zinc-500 uppercase tracking-widest block mb-1">Seu Chat ID</label>
                    <input 
                      type="text" 
                      placeholder="Ex: 1948301934"
                      value={telegramChatId}
                      onChange={(e) => setTelegramChatId(e.target.value)}
                      className="w-full bg-zinc-950 border border-white/5 rounded-xl px-3 py-2.5 text-xs font-mono text-zinc-300 focus:outline-none focus:border-rose-500/50 transition-colors"
                    />
                  </div>
                </div>
              </div>

              {/* Webhook Configuration Group */}
              <div className="space-y-3 bg-black/40 p-5 rounded-3xl border border-white/5">
                <span className="text-[10px] font-black text-white uppercase tracking-widest flex items-center gap-2">
                  <span className="h-1.5 w-1.5 bg-amber-400 rounded-full" />
                  Webhook (Discord / Zapier / API)
                </span>
                <div>
                  <label className="text-[9px] font-black text-zinc-500 uppercase tracking-widest block mb-1">URL de Destino (POST)</label>
                  <input 
                    type="text" 
                    placeholder="https://discord.com/api/webhooks/..."
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                    className="w-full bg-zinc-950 border border-white/5 rounded-xl px-3 py-2.5 text-xs font-mono text-zinc-300 focus:outline-none focus:border-rose-500/50 transition-colors"
                  />
                </div>
              </div>

              {/* Action button */}
              <button
                onClick={testTrigger}
                disabled={testStatus === 'SENDING'}
                className={`w-full py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 border cursor-pointer ${
                  testStatus === 'SENDING' ? 'bg-zinc-800 text-zinc-500 border-transparent cursor-not-allowed' :
                  testStatus === 'SUCCESS' ? 'bg-emerald-500 text-white border-transparent' :
                  testStatus === 'ERROR' ? 'bg-rose-500 text-white border-transparent' :
                  'bg-zinc-800 hover:bg-white text-zinc-300 hover:text-black border-white/5'
                }`}
              >
                {testStatus === 'SENDING' ? (
                  <>
                    <div className="h-3 w-3 border-2 border-zinc-500 border-t-white rounded-full animate-spin" />
                    Processando Envio de Teste...
                  </>
                ) : testStatus === 'SUCCESS' ? (
                  <>
                    <Check size={14} />
                    Sinal de Teste Enviado para Seu Dispositivo!
                  </>
                ) : testStatus === 'ERROR' ? (
                  <>
                    Erro no Teste! Revise suas Credenciais
                  </>
                ) : (
                  <>
                    <Send size={12} />
                    Testar Conexão de Sinais
                  </>
                )}
              </button>
            </div>

            <button
              onClick={onClose}
              className="w-full py-3 rounded-xl border border-white/5 hover:bg-white/5 text-zinc-400 hover:text-white text-[10px] font-black uppercase tracking-widest transition-colors cursor-pointer"
            >
              Confirmar e Salvar Configurações
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
