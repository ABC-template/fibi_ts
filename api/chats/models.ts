// ============================================
// api/chats/models.ts
// Описание: Ключи OpenRouter (ROUTER_KEY0..9)
// Версия: 5.0.0 - удалены неиспользуемые getModelConfig, getLanguageInstruction и IModelConfig
//                 (модель и промпт берутся из агента, ai_agents)
//          4.1.0 - getRotatedKeysPool: ключи 0..9 с пропусками; убран неиспользуемый hasAvailableKeys
// ============================================

/**
 * Ключи OpenRouter ROUTER_KEY0..ROUTER_KEY9. Пропуск в нумерации не обрывает
 * список (раньше при отсутствии, например, ROUTER_KEY1 ключи 2..9 не использовались).
 */
export function getRotatedKeysPool(): string[] {
  const keys: string[] = [];
  for (let i = 0; i < 10; i++) {
    const key = process.env[`ROUTER_KEY${i}`]?.trim();
    if (key) keys.push(key);
  }
  return keys;
}
