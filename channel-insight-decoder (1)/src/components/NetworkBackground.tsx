import React, { useEffect, useRef } from 'react';

type MarketState = 'BULLISH' | 'BEARISH' | 'CHAOS' | 'NEUTRAL';
type ParticleType = 'bull' | 'bear' | 'money' | 'chaos';

interface Particle {
  x: number;
  y: number;
  size: number;
  speedX: number;
  speedY: number;
  text: string;
  type: ParticleType;
  opacity: number;
  life: number;
  maxLife: number;
  rotation: number;
  rotSpeed: number;
}

const BULL_SYMBOLS = ["▲", "BULL", "BUY", "LONG", "UP", "🚀", "📈", "PUMP", "MOON", "🟢", "🐂", "💚"];
const BEAR_SYMBOLS = ["▼", "BEAR", "SELL", "SHORT", "DOWN", "🩸", "📉", "DUMP", "CRASH", "🔴", "🐻", "💔"];
const MONEY_SYMBOLS = ["$", "₿", "€", "£", "¥", "PROFIT", "💰", "💎", "HOLD", "🧊", "💸"];
const CHAOS_SYMBOLS = ["🚨", "LIQUIDATED", "REKT", "VOLATILITY", "NEWS", "🔥", "⚠️", "⚡", "WHALE ALERT", "💥"];

const getRandomElement = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];

interface NetworkBackgroundProps {
  symbol?: string;
}

const NetworkBackground: React.FC<NetworkBackgroundProps> = ({ symbol = 'btcusdt' }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let particles: Particle[] = [];
    let ws: WebSocket | null = null;
    let volumeHistory: { buy: number, sell: number, time: number }[] = [];

    let currentMarketState: MarketState = 'NEUTRAL';
    let stateIntensity = 0; // Para transições suaves

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    const createParticle = (type: ParticleType, intensity: number): Particle => {
      let text = '';
      if (type === 'bull') text = getRandomElement(BULL_SYMBOLS);
      else if (type === 'bear') text = getRandomElement(BEAR_SYMBOLS);
      else if (type === 'chaos') text = getRandomElement(CHAOS_SYMBOLS);
      else text = getRandomElement(MONEY_SYMBOLS);

      const size = (Math.random() * 20 + 15) * (type === 'chaos' ? 1.5 : 1) + (intensity * 10);
      const x = Math.random() * canvas.width;
      let y = 0;
      let speedX = (Math.random() - 0.5) * 2;
      let speedY = 0;

      if (type === 'bull') {
        y = canvas.height + 50; // Nasce embaixo
        speedY = -(Math.random() * 5 + 3) - intensity * 5; // Sobe rápido
      } else if (type === 'bear') {
        y = -50; // Nasce em cima
        speedY = (Math.random() * 5 + 3) + intensity * 5; // Cai rápido
      } else if (type === 'chaos') {
        y = canvas.height / 2 + (Math.random() - 0.5) * canvas.height;
        speedX = (Math.random() - 0.5) * 25; // Explosão pros lados
        speedY = (Math.random() - 0.5) * 25; // Explosão pra cima/baixo
      } else {
        y = -50;
        speedY = Math.random() * 2 + 1; // Drift suave caindo (chuva de dinheiro)
      }

      return {
        x,
        y,
        size,
        speedX,
        speedY,
        text,
        type,
        opacity: Math.random() * 0.6 + 0.4,
        life: 0,
        maxLife: type === 'chaos' ? Math.random() * 50 + 20 : Math.random() * 100 + 50,
        rotation: (Math.random() - 0.5) * Math.PI,
        rotSpeed: (Math.random() - 0.5) * (type === 'chaos' ? 0.2 : 0.05)
      };
    };

    const connectWS = () => {
      // Usando ticker aggTrade da Binance para pegar fluxo real de trades do ativo
      ws = new WebSocket(`wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@aggTrade`);
      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          const qty = parseFloat(data.q);
          const isSell = data.m; // true se o agressor foi o vendedor
          
          volumeHistory.push({
            buy: isSell ? 0 : qty,
            sell: isSell ? qty : 0,
            time: Date.now()
          });
        } catch (err) {}
      };
      
      ws.onclose = () => {
        setTimeout(connectWS, 5000); // Tenta reconectar
      };
    };
    connectWS();

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const now = Date.now();

      // 1. Limpar histórico antigo (janela de 5 segundos)
      volumeHistory = volumeHistory.filter(v => now - v.time < 5000);

      // 2. Calcular volume total da janela
      let totalBuy = 0;
      let totalSell = 0;
      for (const v of volumeHistory) {
        totalBuy += v.buy;
        totalSell += v.sell;
      }
      const totalVol = totalBuy + totalSell;

      // 3. Determinar Estado do Mercado (Dinâmico)
      // 35 BTC em 5 seg é uma volatilidade absurda. Acima de 5 já é tendência.
      let targetState: MarketState = 'NEUTRAL';
      let intensity = 0;

      if (totalVol > 35) {
        targetState = 'CHAOS';
        intensity = Math.min((totalVol - 35) / 40, 1); 
      } else if (totalBuy > totalSell * 1.4 && totalVol > 3) {
        targetState = 'BULLISH';
        intensity = Math.min(totalBuy / 20, 1);
      } else if (totalSell > totalBuy * 1.4 && totalVol > 3) {
        targetState = 'BEARISH';
        intensity = Math.min(totalSell / 20, 1);
      } else {
        targetState = 'NEUTRAL';
      }

      currentMarketState = targetState;
      
      // Suaviza a transição de intensidade visual
      if (currentMarketState !== 'NEUTRAL') {
        stateIntensity += (intensity - stateIntensity) * 0.1;
      } else {
        stateIntensity += (0 - stateIntensity) * 0.05;
      }

      // 4. Desenhar Efeitos de Fundo (Aura baseada no mercado)
      if (currentMarketState === 'BULLISH' || (currentMarketState === 'NEUTRAL' && stateIntensity > 0.01)) {
        const grad = ctx.createLinearGradient(0, canvas.height, 0, canvas.height - 400);
        grad.addColorStop(0, `rgba(20, 241, 149, ${stateIntensity * 0.2})`); // Verde saindo de baixo
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      if (currentMarketState === 'BEARISH' || (currentMarketState === 'NEUTRAL' && stateIntensity > 0.01)) {
        const grad = ctx.createLinearGradient(0, 0, 0, 400);
        grad.addColorStop(0, `rgba(244, 63, 94, ${stateIntensity * 0.2})`); // Vermelho saindo de cima
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      if (currentMarketState === 'CHAOS') {
        const pulse = Math.sin(now / 150) * 0.15 + 0.15;
        const grad = ctx.createRadialGradient(canvas.width/2, canvas.height/2, canvas.width/4, canvas.width/2, canvas.height/2, canvas.width/1.2);
        grad.addColorStop(0, 'transparent');
        grad.addColorStop(1, `rgba(255, 69, 0, ${pulse})`); // Laranja/Vermelho intenso nas bordas
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      // 5. Spawn de Partículas baseado no Estado
      if (currentMarketState === 'CHAOS') {
        if (Math.random() < 0.6 + stateIntensity * 0.4) particles.push(createParticle('chaos', stateIntensity));
        if (Math.random() < 0.4) particles.push(createParticle(Math.random() > 0.5 ? 'bull' : 'bear', stateIntensity));
      } else if (currentMarketState === 'BULLISH') {
        if (Math.random() < 0.2 + stateIntensity * 0.6) particles.push(createParticle('bull', stateIntensity));
      } else if (currentMarketState === 'BEARISH') {
        if (Math.random() < 0.2 + stateIntensity * 0.6) particles.push(createParticle('bear', stateIntensity));
      } else {
        // NEUTRAL
        if (Math.random() < 0.08) particles.push(createParticle('money', 0));
      }

      // 6. Atualizar e Desenhar Partículas
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.speedX;
        p.y += p.speedY;
        p.rotation += p.rotSpeed;
        p.life++;

        if (p.life > p.maxLife || p.x < -150 || p.x > canvas.width + 150 || p.y < -150 || p.y > canvas.height + 150) {
          particles.splice(i, 1);
          continue;
        }

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);

        let color = '';
        let shadowColor = '';
        
        if (p.type === 'bull') {
          color = `rgba(20, 241, 149, ${p.opacity})`; // Neon Green
          shadowColor = '#14f195';
        } else if (p.type === 'bear') {
          color = `rgba(244, 63, 94, ${p.opacity})`; // Neon Red
          shadowColor = '#f43f5e';
        } else if (p.type === 'chaos') {
          color = `rgba(255, 140, 0, ${p.opacity})`; // Neon Orange
          shadowColor = '#ff4500';
        } else {
          color = `rgba(243, 186, 47, ${p.opacity * 0.6})`; // Gold
          shadowColor = '#f3ba2f';
        }

        if (p.type === 'chaos') {
           ctx.globalAlpha = (Math.sin(now / 50 + p.life) + 1) / 2; // Efeito piscando
        }

        ctx.shadowBlur = p.opacity > 0.5 ? (p.type === 'chaos' ? 25 : 15) : 5;
        ctx.shadowColor = shadowColor;
        ctx.fillStyle = color;
        ctx.font = `bold ${p.size}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        ctx.fillText(p.text, 0, 0);

        ctx.restore();
      }

      animationFrameId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      cancelAnimationFrame(animationFrameId);
      if (ws) ws.close();
    };
  }, [symbol]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-0 pointer-events-none opacity-80 mix-blend-screen"
    />
  );
};

export default NetworkBackground;
