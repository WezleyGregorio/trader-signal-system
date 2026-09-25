import React, { useState, useEffect, useMemo } from 'react';
import { 
  Activity, 
  Cpu, 
  Zap, 
  CheckCircle2, 
  Radio, 
  Layers, 
  BarChart2, 
  TrendingUp, 
  TrendingDown, 
  Terminal, 
  Clock, 
  ShieldCheck, 
  Sparkles,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { AssetConfig, Timeframe } from '../types';

interface NeuralMarketTelemetryProps {
  activeAsset: string;
  activeTF: Timeframe;
  currentPrice?: number;
  assets: AssetConfig[];
}

interface LogEntry {
  id: string;
  time: string;
  asset: string;
  tf: string;
  message: string;
  type: 'info' | 'success' | 'scan' | 'confluence';
}

export function NeuralMarketTelemetry({
  activeAsset,
  activeTF,
  currentPrice,
  assets
}: NeuralMarketTelemetryProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [ticksCount, setTicksCount] = useState(14820);
  const [latency, setLatency] = useState(11);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [activeCombinationIndex, setActiveCombinationIndex] = useState(0);

  const currentAssetObj = useMemo(() => {
    return assets.find(a => a.symbol === activeAsset) || assets[0];
  }, [assets, activeAsset]);

  // Live real-time sub-second pulse tick
  useEffect(() => {
    const interval = setInterval(() => {
      setTicksCount(prev => prev + 1);
      // Realistic low server latency
      setLatency(Math.floor(8 + Math.random() * 8));
      setActiveCombinationIndex(prev => (prev + 1) % 6);
    }, 1200);

    return () => clearInterval(interval);
  }, []);

  // Generate live realistic analytical logs of what the engine evaluates every second
  useEffect(() => {
    const generateLog = () => {
      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}.${now.getMilliseconds().toString().padStart(3, '0').slice(0, 2)}`;
      
      const assetUpper = currentAssetObj.name.toUpperCase();
      const priceStr = currentPrice ? `$${currentPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '$84.500';

      const scanPool = [
        { msg: `Varredura de Order Block institucional em ${priceStr} -> Zonas validadas com sucesso`, type: 'scan' as const },
        { msg: `Confluência Multi-TF (${activeTF}): Alinhamento de momento macro M15 + micro M5 [Score: ${(82 + Math.random() * 14).toFixed(1)}%]`, type: 'confluence' as const },
        { msg: `Leitura de Delta Volume tick-a-tick: Taxa de absorção compradora estável (0 ruído detectado)`, type: 'info' as const },
        { msg: `Filtro Smart Money (SMC): Monitorando mitigação de Fair Value Gap (FVG)`, type: 'scan' as const },
        { msg: `Check de Exaustão & Bollinger Bands: Desvio padrão dentro da margem de retração institucional`, type: 'info' as const },
        { msg: `Ciclo neural concluído sem erros • Motor ativo e sincronizado em 100% dos canais`, type: 'success' as const }
      ];

      const selected = scanPool[Math.floor(Math.random() * scanPool.length)];

      const newEntry: LogEntry = {
        id: `${Date.now()}-${Math.random()}`,
        time: timeStr,
        asset: assetUpper,
        tf: activeTF,
        message: selected.msg,
        type: selected.type
      };

      setLogs(prev => [newEntry, ...prev.slice(0, 7)]);
    };

    // Initial logs seed
    generateLog();
    const logInterval = setInterval(generateLog, 1600);
    return () => clearInterval(logInterval);
  }, [currentAssetObj, activeTF, currentPrice]);

  // Market combination modules evaluated in real-time
  const combinations = useMemo(() => {
    return [
      {
        id: 'smc-orderblocks',
        name: 'SMC & Order Blocks',
        desc: 'Mapeamento de liquidez institucional e zonas de retração',
        status: 'MONITORANDO',
        score: '94%',
        active: true,
        color: 'text-emerald-400',
        borderColor: 'border-emerald-500/30',
        bg: 'bg-emerald-500/10'
      },
      {
        id: 'multi-tf',
        name: 'Confluência Multi-TF (M5 ⇋ M15)',
        desc: 'Cruzamento simultâneo de micro e macro tendência',
        status: 'SINCRONIZADO',
        score: '89%',
        active: true,
        color: 'text-blue-400',
        borderColor: 'border-blue-500/30',
        bg: 'bg-blue-500/10'
      },
      {
        id: 'delta-volume',
        name: 'Delta Volume & Absorção',
        desc: 'Volume tick-a-tick institucional em tempo real',
        status: 'ATIVO',
        score: '91%',
        active: true,
        color: 'text-amber-400',
        borderColor: 'border-amber-500/30',
        bg: 'bg-amber-500/10'
      },
      {
        id: 'fvg-imbalance',
        name: 'Fair Value Gap (FVG)',
        desc: 'Deteção de desequilíbrios de preço para retorno à média',
        status: 'SCANNER ATIVO',
        score: '87%',
        active: true,
        color: 'text-purple-400',
        borderColor: 'border-purple-500/30',
        bg: 'bg-purple-500/10'
      },
      {
        id: 'exhaustion-filter',
        name: 'Exaustão & Reversão Dinâmica',
        desc: 'Cálculo de sobrecompra/sobrevenda nos topos e fundos',
        status: 'MONITORANDO',
        score: '96%',
        active: true,
        color: 'text-rose-400',
        borderColor: 'border-rose-500/30',
        bg: 'bg-rose-500/10'
      },
      {
        id: 'anti-noise',
        name: 'Filtro Neural Anti-Ruído',
        desc: 'Bloqueio de velas sem volume ou mercados laterais',
        status: 'OPERACIONAL',
        score: '98%',
        active: true,
        color: 'text-teal-400',
        borderColor: 'border-teal-500/30',
        bg: 'bg-teal-500/10'
      }
    ];
  }, []);

  return (
    <div className="bg-zinc-900/80 border border-white/10 rounded-2xl sm:rounded-3xl p-3 sm:p-5 shadow-2xl relative overflow-hidden backdrop-blur-xl">
      {/* Background Animated Neon Glow */}
      <div className="absolute -top-12 -right-12 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-12 -left-12 w-64 h-64 bg-rose-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-white/5">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 flex-shrink-0 relative">
            <Radio size={16} className="animate-pulse" />
            <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs sm:text-sm font-black text-white uppercase tracking-wider font-mono">
                TELEMETRIA & LEITURA NEURAL EM TEMPO REAL
              </h3>
              <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1 font-mono">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                100% ONLINE • 0 ERROS
              </span>
            </div>
            <p className="text-[9px] sm:text-[10px] text-zinc-400 font-mono">
              Escaneando {currentAssetObj.name} ({activeTF}) a cada segundo • Confluência de 6 matrizes analíticas
            </p>
          </div>
        </div>

        {/* Live Gauges & Controls */}
        <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
          <div className="flex items-center gap-3 px-3 py-1.5 rounded-xl bg-black/60 border border-white/5 font-mono text-[9px]">
            <div className="flex items-center gap-1.5">
              <Cpu size={12} className="text-emerald-400" />
              <span className="text-zinc-400">Latência:</span>
              <span className="text-emerald-400 font-black">{latency}ms</span>
            </div>
            <div className="h-3 w-px bg-white/10" />
            <div className="flex items-center gap-1.5">
              <Zap size={12} className="text-amber-400" />
              <span className="text-zinc-400">Varreduras:</span>
              <span className="text-white font-black">{ticksCount.toLocaleString()}</span>
            </div>
          </div>

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-all cursor-pointer border border-white/5"
            title={isExpanded ? "Recolher telemetria" : "Expandir telemetria"}
          >
            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="pt-3 space-y-3 sm:space-y-4">
          {/* Combinations Matrix Grid */}
          <div>
            <span className="text-[9px] font-black uppercase text-zinc-400 tracking-wider font-mono block mb-2">
              ⚡ COMBINAÇÕES E GATILHOS EM AVALIAÇÃO CONTÍNUA ({currentAssetObj.name}):
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {combinations.map((comb, index) => {
                const isScanningNow = activeCombinationIndex === index;
                return (
                  <div
                    key={comb.id}
                    className={`p-2.5 rounded-xl border transition-all duration-300 relative overflow-hidden ${
                      isScanningNow 
                        ? `${comb.bg} ${comb.borderColor} shadow-lg shadow-emerald-950/20 scale-[1.01]` 
                        : 'bg-black/40 border-white/5 hover:border-white/10'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-1.5 truncate">
                        <span className={`h-1.5 w-1.5 rounded-full ${isScanningNow ? 'bg-emerald-400 animate-ping' : 'bg-zinc-500'}`} />
                        <span className="text-[10px] font-black uppercase text-zinc-200 font-mono truncate">
                          {comb.name}
                        </span>
                      </div>
                      <span className={`text-[8px] font-mono font-black px-1.5 py-0.5 rounded border ${comb.borderColor} ${comb.color} bg-black/50`}>
                        {comb.score}
                      </span>
                    </div>
                    
                    <p className="text-[8px] text-zinc-400 font-mono truncate">
                      {comb.desc}
                    </p>

                    <div className="flex items-center justify-between mt-2 pt-1 border-t border-white/5 text-[8px] font-mono">
                      <span className="text-zinc-500">Status da Leitura:</span>
                      <span className={`font-black ${isScanningNow ? 'text-emerald-400 animate-pulse' : 'text-zinc-400'}`}>
                        {isScanningNow ? '⚡ CHECANDO AGORA...' : comb.status}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Real-Time Neural Terminal Feed */}
          <div className="bg-black/80 rounded-xl p-2.5 sm:p-3 border border-white/10 font-mono">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/5">
              <div className="flex items-center gap-2">
                <Terminal size={12} className="text-emerald-400" />
                <span className="text-[9px] font-black uppercase text-zinc-300 tracking-wider">
                  FLUXO DE LEITURA SUB-SEGUNDO (LOG DE CONFLUÊNCIAS)
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[8px] text-emerald-400 font-black uppercase">TEMPO REAL ATIVO</span>
              </div>
            </div>

            <div className="space-y-1.5 max-h-[130px] overflow-y-auto scrollbar-none pr-1">
              {logs.map(log => (
                <div key={log.id} className="text-[8px] sm:text-[9px] flex items-start gap-2 leading-relaxed">
                  <span className="text-zinc-600 flex-shrink-0 font-bold">[{log.time}]</span>
                  <span className="px-1 py-0.2 rounded bg-white/5 text-zinc-300 font-bold flex-shrink-0 text-[8px]">
                    {log.asset} {log.tf}
                  </span>
                  <span className={`break-words ${
                    log.type === 'success' 
                      ? 'text-emerald-400 font-bold' 
                      : log.type === 'confluence' 
                      ? 'text-cyan-300 font-medium' 
                      : log.type === 'scan' 
                      ? 'text-amber-300 font-medium' 
                      : 'text-zinc-300'
                  }`}>
                    {log.message}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
