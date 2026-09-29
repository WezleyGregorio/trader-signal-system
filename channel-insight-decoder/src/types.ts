/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type SignalType = 'CALL' | 'PUT';
export type Timeframe = 'M1' | 'M5' | 'M15';

export interface Signal {
  id: string;
  asset: string;
  type: SignalType;
  timeframe: Timeframe;
  price: number;
  timestamp: number;
  expiryTimestamp: number;
  strategy: string;
  status: 'PENDING' | 'WIN' | 'LOSS' | 'EXPIRED';
  assertiveness?: number; // Estimated win rate probability (e.g. 88%)
  metrics?: {
    wickSize: number;
    volumeConfirmation: boolean;
    smcPattern?: string;
    wyckoffPhase?: string; 
    trendAlignment?: 'ALIGNED' | 'CONTRA-TREND';
    m1VolumeClimax?: boolean;
    m1ConfirmStatus?: 'GATILHO_M1_ALTO_VOLUME' | 'M1_VOLUME_NORMAL' | 'SEM_DADOS_M1';
    rsi?: number;
    bbTension?: boolean;
  };
  resultPrice?: number;
}

export interface Zone {
  price: number;
  type: 'SUPPORT' | 'RESISTANCE';
  strength: number; 
  isOrderBlock?: boolean;
  hits: number;
  retractionRate: number;
  volumeScore: 'ALTO' | 'MÉDIO' | 'BAIXO';
  accumulatedVolume?: number; // Representing Volume Profile at this zone
  lastTouchTimestamp?: number;
  wins: number;
  losses: number;
}

export interface AssetConfig {
  symbol: string;
  name: string;
  color: string;
}
