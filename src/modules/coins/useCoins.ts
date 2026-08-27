// ============================================
// src/modules/coins/useCoins.ts
// Хук для удобной работы с монетами
// Версия: 2.0.0 - ПЕРЕКЛЮЧЕНО НА EconomyStore
// ============================================

import { coinsStore } from './CoinsStore';
import { coinsAPI } from './CoinsAPI';

export function useCoins() {
  return {
    balance: coinsStore.getBalance(),
    transactions: coinsStore.getTransactions(),
    stats: coinsStore.getStats(),

    sync: () => coinsAPI.sync(),
    getBalance: () => coinsAPI.getBalance(),
    getHistory: (limit?: number, offset?: number) => coinsAPI.getHistory(limit, offset),

    hasEnough: (amount: number) => coinsStore.getBalance() >= amount,
    format: (amount: number) => `${amount} 🪙`,
  };
}

console.log('✅ useCoins v2.0.0 загружен (переключен на EconomyStore)');
