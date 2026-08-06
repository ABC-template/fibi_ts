// ============================================
// src/modules/coins/useCoins.ts
// Хук для удобной работы с монетами
// Версия: 1.0.0
// ============================================

import { coinsStore } from './CoinsStore';
import { coinsAPI } from './CoinsAPI';

export function useCoins() {
  return {
    // Store
    balance: coinsStore.getBalance(),
    transactions: coinsStore.getTransactions(),
    stats: coinsStore.getStats(),

    // Actions
    addCoins: (amount: number, source: string, description: string) => {
      return coinsStore.addCoins(amount, source, description);
    },
    spendCoins: (amount: number, source: string, description: string) => {
      return coinsStore.spendCoins(amount, source, description);
    },
    sync: () => coinsAPI.sync(),
    getBalance: () => coinsAPI.getBalance(),
    getHistory: (limit?: number, offset?: number) => coinsAPI.getHistory(limit, offset),

    // Helpers
    hasEnough: (amount: number) => coinsStore.getBalance() >= amount,
    format: (amount: number) => `${amount} 🪙`,
  };
}

console.log('✅ useCoins v1.0.0 загружен');
