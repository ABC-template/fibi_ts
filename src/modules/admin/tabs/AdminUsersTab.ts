// ============================================
// src/modules/admin/tabs/AdminUsersTab.ts
// Админ-панель → «Пользователи»: поиск, смена роли, монеты и энергия
// Версия: 2.1.0
//   - полная блокировка (закрывает всё API) и заморозка монет — кнопками в карточке;
//     в карточке видно: заблокирован (причина, до какого числа), монеты заморожены,
//     подписка на канал
//   2.0.0
//   - API /admin/users (список, роль, баланс, сброс входа) вместо несуществующих эндпоинтов
//   - роль: trial / premium / admin; creator не меняется. Premium — тариф и срок
//     (по умолчанию первый платный тариф и его срок)
//   - монеты и постоянная энергия: сумма со знаком (+ начислить, − списать)
//   - карточки вместо таблицы (удобно с телефона)
// ============================================

import { IAdminTab } from '../core/admin-tab.interface';
import { apiClient } from '@/services/api';

function esc(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function fmtDate(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('ru-RU');
}

export class AdminUsersTab implements IAdminTab {
  id = 'users';
  label = 'Пользователи';
  icon = '👤';
  priority = 60;

  private users: any[] = [];
  private tiers: any[] = [];
  private loading = false;
  private search = '';
  private error: string | null = null;

  async init(): Promise<void> {
    await Promise.all([this.loadData(this.search), this.loadTiers()]);
  }

  async loadData(query?: string): Promise<void> {
    if (this.loading) return;
    this.loading = true;
    this.error = null;
    this.search = (query ?? this.search ?? '').trim();
    try {
      const url = this.search ? `/admin/users?search=${encodeURIComponent(this.search)}` : '/admin/users';
      const res = await apiClient.get(url);
      this.users = res?.success ? res.users || [] : [];
    } catch (e) {
      this.error = (e as Error).message || 'Не удалось загрузить пользователей';
      console.error('[AdminUsersTab]', e);
    } finally {
      this.loading = false;
    }
  }

  private async loadTiers(): Promise<void> {
    try {
      const res = await apiClient.get('/admin/economy/subscriptions');
      this.tiers = (res?.tiers || []).filter((t: any) => t.is_active && t.tier_key !== 'trial' && !t.is_trial);
    } catch {
      this.tiers = [];
    }
  }

  async refresh(): Promise<void> {
    await this.loadData(this.search);
  }

  onShow(): void {
    void this.loadData(this.search);
  }

  private card(u: any): string {
    const isCreator = u.role === 'creator';
    const energy = (u.token_balance_bonus ?? 0) + (u.token_balance_permanent ?? 0);
    const roleSelect = isCreator
      ? `<span style="font-weight:600">👑 creator</span>`
      : `<select onchange="window.adminModule.changeRole(${u.telegram_id}, this.value)"
           style="padding:4px 8px;border-radius:6px;border:1px solid var(--app-border-color);background:var(--app-bg-primary);color:var(--app-text-primary);font-size:12px">
           <option value="trial" ${u.role === 'trial' ? 'selected' : ''}>trial</option>
           <option value="premium" ${u.role === 'premium' ? 'selected' : ''}>premium</option>
           <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>admin</option>
         </select>`;

    const btn = (label: string, action: string, title: string) =>
      `<button onclick="${action}" title="${title}"
         style="padding:6px 10px;font-size:12px;border:none;border-radius:8px;background:var(--app-bg-tertiary);color:var(--app-text-primary);cursor:pointer">${label}</button>`;

    return `
      <div style="border:1px solid var(--app-border-color-light);border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:8px">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
          <div>
            <div style="font-weight:600;color:var(--app-text-primary)">${u.username ? '@' + esc(u.username) : 'без username'}</div>
            <div style="font-size:11px;color:var(--app-text-tertiary)">ID ${u.telegram_id} · с ${fmtDate(u.created_at)}</div>
          </div>
          ${roleSelect}
        </div>

        <div style="display:flex;flex-wrap:wrap;gap:6px 14px;font-size:12px;color:var(--app-text-secondary)">
          <span>Тариф: <b>${esc(u.subscription_tier || 'trial')}</b></span>
          <span>До: <b>${fmtDate(u.premium_until)}</b></span>
          <span>🪙 <b>${u.coin_balance ?? 0}</b></span>
          <span>⚡ <b>${energy}</b> <span style="color:var(--app-text-tertiary)">(${u.token_balance_bonus ?? 0} бонус + ${u.token_balance_permanent ?? 0})</span></span>
          <span>🔥 ${u.streak ?? 0}</span>
          ${u.data_deadline ? `<span style="color:#e67e22">☁️ облако удалится ${fmtDate(u.data_deadline)}</span>` : ''}
          ${u.economy_locked ? '<span style="color:#e67e22">🧊 монеты заморожены</span>' : ''}
          ${u.channel_member === false ? '<span style="color:#e67e22">📢 не подписан на канал</span>' : ''}
          ${u.blocked
            ? `<span style="color:#e74c3c">⛔ заблокирован${u.block_expires_at ? ` до ${fmtDate(u.block_expires_at)}` : ' бессрочно'}${u.block_reason ? ` — ${esc(u.block_reason)}` : ''}</span>`
            : ''}
        </div>

        <div style="display:flex;flex-wrap:wrap;gap:6px">
          ${btn('🪙 ±', `window.adminModule.adjustUserBalance(${u.telegram_id}, 'coins')`, 'Начислить или списать монеты')}
          ${btn('⚡ ±', `window.adminModule.adjustUserBalance(${u.telegram_id}, 'tokens')`, 'Начислить или списать постоянную энергию')}
          ${btn('🔄 Вход', `window.adminModule.resetUserCheckin(${u.telegram_id})`, 'Сбросить ежедневный вход (тест)')}
          ${btn(u.economy_locked ? '🧊 Разморозить' : '🧊 Заморозить', `window.adminModule.toggleUserEconomyLock(${u.telegram_id})`, 'Заморозка монет: нельзя получать и тратить монеты')}
          ${u.is_admin_id || isCreator
            ? ''
            : u.blocked
              ? btn('✅ Разблокировать', `window.adminModule.blockUserFromList(${u.telegram_id}, false)`, 'Снять блокировку')
              : btn('⛔ Заблокировать', `window.adminModule.blockUserFromList(${u.telegram_id}, true)`, 'Полная блокировка: приложение закрыто')}
        </div>
      </div>`;
  }

  render(): string {
    return `
      <div style="background:var(--app-bg-secondary);border-radius:12px;padding:16px;border:1px solid var(--app-border-color-light)">
        <h3 style="margin:0 0 12px;color:var(--app-text-primary)">👤 Пользователи (${this.users.length})</h3>

        <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
          <input type="text" id="users-search" placeholder="ID или @username"
            value="${esc(this.search)}"
            style="flex:1;min-width:160px;padding:8px 12px;border-radius:8px;border:1px solid var(--app-border-color);background:var(--app-bg-primary);color:var(--app-text-primary);font-size:13px"
            onkeydown="if(event.key==='Enter') window.adminModule.searchUsers(this.value)">
          <button class="btn btn-secondary" style="padding:8px 14px;font-size:13px"
            onclick="window.adminModule.searchUsers(document.getElementById('users-search').value)">🔍</button>
        </div>

        ${this.error ? `<div style="color:#e74c3c;font-size:13px;margin-bottom:10px">⚠️ ${esc(this.error)}</div>` : ''}
        ${this.loading && this.users.length === 0 ? '<div style="padding:20px;text-align:center;color:var(--app-text-tertiary)">⏳ Загрузка...</div>' : ''}

        <div style="display:flex;flex-direction:column;gap:10px">
          ${!this.loading && this.users.length === 0
            ? '<div style="text-align:center;padding:24px;color:var(--app-text-tertiary)">Никого не найдено</div>'
            : this.users.map((u) => this.card(u)).join('')}
        </div>

        <div style="margin-top:14px;font-size:11px;color:var(--app-text-tertiary)">
          Показаны последние 100 (или результаты поиска). Изменения пишутся в журнал (system_logs).
          После смены роли пользователю нужно перезапустить приложение.
        </div>
      </div>
    `;
  }

  // ==========================================
  // Действия
  // ==========================================

  async changeRole(userId: number, role: string): Promise<void> {
    const user = this.users.find((x) => x.telegram_id === userId);
    let tier: string | null = null;
    let days: number | null = null;

    if (role === 'premium') {
      if (this.tiers.length === 0) await this.loadTiers();
      const options = this.tiers.map((t) => `${t.tier_key} (${t.days || 30} дн.)`).join(', ');
      const defaultTier = this.tiers[0]?.tier_key || '';
      const tierAnswer = prompt(`Тариф (${options || 'нет активных платных'}):`, defaultTier);
      if (tierAnswer === null) return this.refresh();
      tier = tierAnswer.trim() || null;

      const tierDays = this.tiers.find((t) => t.tier_key === tier)?.days || 30;
      const daysAnswer = prompt('Срок, дней:', String(tierDays));
      if (daysAnswer === null) return this.refresh();
      days = parseInt(daysAnswer, 10);
      if (!Number.isInteger(days) || days < 1) {
        alert('Срок — целое число дней');
        return this.refresh();
      }
    } else if (role === 'trial' && user && user.role !== 'trial') {
      const ok = confirm('Перевести в trial? Облачные чаты пользователя удалятся через 7 дней, если он не вернётся в PRO.');
      if (!ok) return this.refresh();
    }

    try {
      const res = await apiClient.post('/admin/users', { action: 'role', user_id: userId, role, tier, days });
      if (res?.success && user) {
        user.role = res.role;
        user.subscription_tier = res.subscription_tier;
        user.premium_until = res.premium_until;
      }
      await this.loadData(this.search);
    } catch (e) {
      alert((e as Error).message || 'Ошибка смены роли');
      await this.loadData(this.search);
    }
  }

  async adjustBalance(userId: number, currency: 'coins' | 'tokens'): Promise<void> {
    const what = currency === 'tokens' ? 'постоянной энергии ⚡' : 'монет 🪙';
    const answer = prompt(`Сколько ${what}? Со знаком минус — списать.`, currency === 'tokens' ? '10000' : '100');
    if (answer === null) return;
    const amount = parseInt(answer.replace(/\s/g, ''), 10);
    if (!Number.isInteger(amount) || amount === 0) {
      alert('Нужно целое число, не ноль');
      return;
    }
    const reason = prompt('Причина (необязательно):', '') || null;

    try {
      await apiClient.post('/admin/users', { action: 'balance', user_id: userId, currency, amount, reason });
      await this.loadData(this.search);
    } catch (e) {
      alert((e as Error).message || 'Ошибка изменения баланса');
    }
  }

  async resetCheckin(userId: number): Promise<void> {
    if (!confirm('Сбросить ежедневный вход? При следующем запуске приложения снова начислятся бонус дня и монеты за вход.')) return;
    try {
      await apiClient.post('/admin/users', { action: 'reset_checkin', user_id: userId });
      alert('Готово: перезапустите приложение у пользователя');
    } catch (e) {
      alert((e as Error).message || 'Ошибка сброса');
    }
  }

  /** Полная блокировка (user_blocks): закрывает всё API, кроме входа */
  async setBlocked(userId: number, block: boolean): Promise<void> {
    try {
      if (block) {
        const reason = prompt('Причина блокировки (видна пользователю):', '');
        if (reason === null) return;
        const daysAnswer = prompt('Срок, дней (пусто — бессрочно):', '');
        if (daysAnswer === null) return;
        const days = daysAnswer.trim() ? parseInt(daysAnswer, 10) : null;
        if (days !== null && (!Number.isInteger(days) || days < 1)) {
          alert('Срок — целое число дней');
          return;
        }
        await apiClient.post('/admin/economy/blocks', { user_id: userId, reason: reason.trim() || null, days });
      } else {
        if (!confirm('Снять блокировку?')) return;
        await apiClient.delete(`/admin/economy/blocks?user_id=${userId}`);
      }
      await this.loadData(this.search);
    } catch (e) {
      alert((e as Error).message || 'Ошибка');
    }
  }

  /** Заморозка монет (economy_locked): приложение доступно, монеты — нет */
  async toggleEconomyLock(userId: number): Promise<void> {
    const user = this.users.find((x) => x.telegram_id === userId);
    const locked = !(user?.economy_locked === true);
    if (!confirm(locked ? 'Заморозить монеты пользователя?' : 'Разморозить монеты?')) return;
    try {
      await apiClient.post('/admin/users', { action: 'economy_lock', user_id: userId, locked });
      await this.loadData(this.search);
    } catch (e) {
      alert((e as Error).message || 'Ошибка');
    }
  }

  // Совместимость со старыми кнопками
  async addCoins(userId: number): Promise<void> {
    return this.adjustBalance(userId, 'coins');
  }

  async addTokens(userId: number): Promise<void> {
    return this.adjustBalance(userId, 'tokens');
  }

  destroy(): void {}
}
