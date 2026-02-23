/**
 * screen-bonus.js
 * Модуль управления бонусной системой
 * 
 * Структура Firestore:
 * - users/{userId}
 *   - bonus_balance: number
 *   - email: string
 *   - phone: string
 *   - qr_id: string
 *   - owner_email: string
 *   - nfc_links: map
 *   - updated_at: timestamp
 *   
 *   - transactions/{transactionId}
 *     - type: "purchase" | "deposit" | "refund" | "adjustment"
 *     - amount_spent: number
 *     - balance_before: number
 *     - balance_after: number
 *     - timestamp: timestamp
 *     - status: "completed"
 */

import { showErrorMessage, showLoadingIndicator, hideLoadingIndicator } from './basic.js';

// ============================================================================
// ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ
// ============================================================================

let bonusUsers = [];
let filteredBonusUsers = [];
let selectedUser = null;
let currentOwnerEmail = null;

// ============================================================================
// 1. РЕНДЕР HTML СТРУКТУРЫ
// ============================================================================

export function renderBonusScreen() {
  return `
      <div class="main-top">
          <div>
              <div class="main-title">🎁 Управление бонусами</div>
              <div class="main-subtitle">Бонусная программа лояльности</div>
          </div>
          <div style="display: flex; gap: 8px;">
              <button class="btn-small primary" onclick="showAddUserModal()">
                  ➕ Добавить клиента
              </button>
              <button class="btn-small" onclick="showImportModal()">
                  📊 Импорт из Excel
              </button>
              <button class="btn-small" onclick="showBulkInvitationModal()">
                  ✉️ Рассылка
              </button>
          </div>
      </div>
      
      <section class="kpi-row">
          <!-- Объединённая карточка по клиентам -->
          <article class="kpi-card">
              <div class="kpi-title">👥 Клиенты</div>
              <div class="kpi-main">
                  <span id="bonus-total-users">0</span>
                  <span style="font-size:12px; color:var(--text-muted); margin-left:4px;">
                      всего
                  </span>
              </div>
              <div class="kpi-line">
                  Активных: <span id="bonus-active-count">0</span>
              </div>
              <div class="kpi-line">
                  За 30д: 
                  <span id="bonus-new-30d" style="font-weight:600;">0</span>
                  <span style="font-size:12px; color:var(--text-muted); margin-left:4px;">
                      новых
                  </span>
                  <span class="link-more" style="margin-left:8px;" onclick="showNewUsers()">
                      Подробнее
                  </span>
              </div>
          </article>
          
          <article class="kpi-card">
              <div class="kpi-title">💰 Общий баланс</div>
              <div class="kpi-main"><span id="bonus-total-balance">0</span> ₽</div>
              <div class="kpi-line">Средний: <span id="bonus-avg-balance">0</span> ₽</div>
          </article>
          
          <article class="kpi-card">
              <div class="kpi-title">📊 Транзакции (7д)</div>
              <div class="kpi-main"><span id="bonus-transactions-7d">0</span></div>
              <div class="kpi-line">Объем: <span id="bonus-volume-7d">0</span> ₽</div>
          </article>
      </section>
      
      <section class="table-section">
          <div class="table-header">
              <div class="table-title">📋 Клиенты</div>
              <div class="table-controls">
                  <select class="select" id="bonus-filter-select">
                      <option value="all">Все клиенты</option>
                      <option value="active">С балансом > 0</option>
                      <option value="inactive">Баланс = 0</option>
                      <option value="high-balance">Баланс ≥ 500₽</option>
                  </select>
                  <input class="search-input" id="bonus-search-input" 
                         placeholder="🔍 Email, телефон или QR ID..." />
              </div>
          </div>
          
          <div class="table-scroll">
              <table>
                  <thead>
                      <tr>
                          <th style="width: 40px;">№</th>
                          <th>Email</th>
                          <th>Телефон</th>
                          <th>QR ID</th>
                          <th>Баланс</th>
                          <th>Последняя активность</th>
                          <th>Действия</th>
                      </tr>
                  </thead>
                  <tbody id="bonus-users-table-body">
                      <tr>
                          <td colspan="7" style="text-align:center; padding:40px; color:var(--text-muted)">
                              Загрузка...
                          </td>
                      </tr>
                  </tbody>
              </table>
          </div>
      </section>
  `;
}

// ============================================================================
// 2. ИНИЦИАЛИЗАЦИЯ И ЗАГРУЗКА ДАННЫХ
// ============================================================================

export async function initBonusScreen() {
    console.log('[Bonus] Initializing...');
    try {
        showLoadingIndicator();
        
        const currentUser = firebase.auth().currentUser;
        if (!currentUser) {
            throw new Error('Пользователь не авторизован');
        }
        currentOwnerEmail = currentUser.email;
        
        await loadBonusUsers(currentOwnerEmail);
        renderBonusKPI();
        renderBonusUsersTable();
        setupBonusFilters();
        
        console.log('[Bonus] Initialized successfully');
    } catch (error) {
        console.error('[Bonus] Init failed:', error);
        showErrorMessage('Ошибка: ' + error.message);
    } finally {
        hideLoadingIndicator();
    }
}

async function loadBonusUsers(ownerEmail) {
    console.log('[Bonus] Loading users for:', ownerEmail);
    const db = firebase.firestore();
    
    try {
        const snapshot = await db.collection('users')
            .where('owner_email', '==', ownerEmail)
            .orderBy('updated_at', 'desc')
            .get();
        
        bonusUsers = [];
        
        for (const doc of snapshot.docs) {
            const data = doc.data();
            const lastTransaction = await getLastTransaction(doc.id);
            
            bonusUsers.push({
              id: doc.id,
              email: data.email || '',
              phone: data.phone || '',
              bonus_balance: data.bonus_balance || 0,
              owner_email: data.owner_email || '',
              created_at: data.created_at, 
              updated_at: data.updated_at,
              nfc_links: data.nfc_links || {},
              lastTransaction
            });           
        }
        
        filteredBonusUsers = [...bonusUsers];
        console.log('[Bonus] Loaded users:', bonusUsers.length);
    } catch (error) {
        console.error('[Bonus] Failed to load users:', error);
        throw error;
    }
}

async function getLastTransaction(userId) {
    const db = firebase.firestore();
    try {
        const snapshot = await db.collection('users')
            .doc(userId)
            .collection('transactions')
            .orderBy('timestamp', 'desc')
            .limit(1)
            .get();
        
        if (snapshot.empty) return null;
        
        const doc = snapshot.docs[0];
        const data = doc.data();
        
        return {
            id: doc.id,
            type: data.type,
            amount: data.amount_spent || 0,
            timestamp: data.timestamp,
            device_id: data.device_id || '',
            item_name: data.item_name || '',
            status: data.status || ''
        };
    } catch (error) {
        console.warn('[Bonus] Failed to load last transaction:', error);
        return null;
    }
}

// ============================================================================
// 3. ОТОБРАЖЕНИЕ ДАННЫХ (KPI И ТАБЛИЦА)
// ============================================================================

function renderBonusKPI() {
  const totalUsers = bonusUsers.length;
  const activeUsers = bonusUsers.filter(u => u.bonus_balance > 0).length;
  const totalBalance = bonusUsers.reduce((sum, u) => sum + (u.bonus_balance || 0), 0);
  const avgBalance = totalUsers > 0 ? Math.round(totalBalance / totalUsers) : 0;

  // новые за 30 дней
  const now = new Date();
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

  const new30d = bonusUsers.filter(u => {
    if (!u.created_at) return false;
    // u.created_at может быть Timestamp или Date
    const created = u.created_at.toDate ? u.created_at.toDate() : u.created_at;
    return (now - created) <= THIRTY_DAYS_MS;
  }).length;

  document.getElementById('bonus-total-users').textContent = totalUsers;
  document.getElementById('bonus-active-count').textContent = activeUsers;
  document.getElementById('bonus-total-balance').textContent = totalBalance.toLocaleString('ru-RU');
  document.getElementById('bonus-avg-balance').textContent = avgBalance;

  // TODO: позже заполним реальными данными
  document.getElementById('bonus-transactions-7d').textContent = 0;
  document.getElementById('bonus-volume-7d').textContent = 0;

  document.getElementById('bonus-new-30d').textContent = new30d;
}

function renderBonusUsersTable() {
    const tbody = document.getElementById('bonus-users-table-body');
    if (!tbody) return;
    
    if (filteredBonusUsers.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align:center; padding:40px; color:var(--text-muted)">
                    Пользователей не найдено
                </td>
            </tr>
        `;
        return;
    }
    
    const rows = filteredBonusUsers.map((user, index) => {
        const balance = user.bonus_balance || 0;
        const balanceColor = balance > 0 ? '#10b981' : '#94a3b8';
        const lastActivity = user.lastTransaction?.timestamp 
            ? formatRelativeTime(user.lastTransaction.timestamp.toDate())
            : 'Нет активности';
        
        return `
            <tr>
                <td style="font-size:11px; color:var(--text-muted)">${index + 1}</td>
                <td style="font-weight:600; font-size:12px">${user.email || 'Не указан'}</td>
                <td style="font-size:11px">${user.phone || 'Не указан'}</td>
                <td style="font-size:11px; font-family:monospace">${user.qr_id || '-'}</td>
                <td style="font-weight:700; color:${balanceColor}; font-size:14px">${balance} ₽</td>
                <td style="font-size:11px">${lastActivity}</td>
                <td>
                  <button class="btn-small" onclick="sendInvitation('${user.id}')">Пригласить</button>
                  <button class="btn-small" onclick="showUserTransactions('${user.id}')">История</button>
                  <button class="btn-small primary" onclick="showDepositModal('${user.id}')">Пополнить</button>
              </td>
            </tr>
        `;
    }).join('');
    
    tbody.innerHTML = rows;
}

// ============================================================================
// 4. ФИЛЬТРАЦИЯ И ПОИСК
// ============================================================================

function setupBonusFilters() {
    const filterSelect = document.getElementById('bonus-filter-select');
    const searchInput = document.getElementById('bonus-search-input');
    
    if (filterSelect) filterSelect.addEventListener('change', applyBonusFilters);
    if (searchInput) searchInput.addEventListener('input', applyBonusFilters);
}

function applyBonusFilters() {
    const filterValue = document.getElementById('bonus-filter-select')?.value || 'all';
    const searchTerm = document.getElementById('bonus-search-input')?.value.toLowerCase().trim() || '';
    
    filteredBonusUsers = bonusUsers.filter(user => {
        const matchesSearch = 
            user.email.toLowerCase().includes(searchTerm) ||
            user.phone.toLowerCase().includes(searchTerm) ||
            (user.qr_id || '').toLowerCase().includes(searchTerm);
        
        if (!matchesSearch) return false;
        
        switch (filterValue) {
            case 'active': return user.bonus_balance > 0;
            case 'inactive': return user.bonus_balance === 0;
            case 'high-balance': return user.bonus_balance >= 500;
            default: return true;
        }
    });
    
    renderBonusUsersTable();
}

// ============================================================================
// 5. ОПЕРАЦИИ С БАЛАНСОМ (ПОПОЛНЕНИЕ, СПИСАНИЕ, КОРРЕКТИРОВКА)
// ============================================================================

/**
 * Показать модальное окно пополнения баланса
 */
window.showDepositModal = function(userId) {
    console.log('[Bonus] showDepositModal:', userId);
    
    // Найти пользователя
    const user = bonusUsers.find(u => u.id === userId);
    if (!user) {
        showErrorMessage('Пользователь не найден');
        return;
    }
    
    // Создать HTML модального окна
    const modalHtml = `
        <div id="depositModal" class="modal">
            <div class="modal-content" style="min-width: 400px; max-width: 500px;">
                <span class="close" id="closeDepositBtn">&times;</span>
                <h3 style="margin-bottom: 20px; color: var(--accent)">💰 Пополнение баланса</h3>
                
                <!-- Информация о клиенте -->
                <div style="padding: 12px; background: rgba(59, 130, 246, 0.1); border-radius: 8px; margin-bottom: 16px;">
                    <div style="font-size: 12px; color: var(--text-muted)">Клиент:</div>
                    <div style="font-size: 14px; font-weight: 600; margin-top: 4px;">${user.email}</div>
                    <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">
                        Текущий баланс: <strong style="color: var(--accent)">${user.bonus_balance} ₽</strong>
                    </div>
                </div>
                
                <!-- Форма пополнения -->
                <div class="settings-grid" style="grid-template-columns: 1fr; gap: 16px;">
                    
                    <!-- Сумма пополнения -->
                    <div class="settings-field">
                        <label class="settings-label" for="deposit-amount">
                            Сумма пополнения, ₽ <span style="color: #ef4444">*</span>
                        </label>
                        <input 
                            type="number" 
                            id="deposit-amount" 
                            class="settings-input" 
                            placeholder="100" 
                            min="1" 
                            step="1"
                            required
                        />
                        <small style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">
                            Минимальная сумма: 1 ₽
                        </small>
                    </div>
                    
                    <!-- Способ оплаты -->
                    <div class="settings-field">
                        <label class="settings-label" for="deposit-payment-method">
                            Способ оплаты <span style="color: #ef4444">*</span>
                        </label>
                        <select id="deposit-payment-method" class="service-select" style="width: 100%;">
                            <option value="cash">💵 Наличные</option>
                            <option value="card">💳 Банковская карта</option>
                            <option value="bank_transfer">🏦 Банковский перевод</option>
                            <option value="other">📋 Другое</option>
                        </select>
                    </div>
                    
                    <!-- Комментарий -->
                    <div class="settings-field">
                        <label class="settings-label" for="deposit-comment">Комментарий</label>
                        <textarea 
                            id="deposit-comment" 
                            class="settings-input" 
                            style="min-height: 60px; resize: vertical; padding: 8px;"
                            placeholder="Необязательное примечание к операции..."
                        ></textarea>
                    </div>
                    
                    <!-- Предпросмотр -->
                    <div style="padding: 12px; background: rgba(34, 197, 94, 0.1); border-radius: 8px; border-left: 3px solid var(--accent);">
                        <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 6px;">
                            Баланс после пополнения:
                        </div>
                        <div style="font-size: 18px; font-weight: 700; color: var(--accent);">
                            <span id="deposit-preview-balance">${user.bonus_balance}</span> ₽
                        </div>
                    </div>
                    
                </div>
                
                <!-- Кнопки -->
                <div class="modal-actions" style="margin-top: 24px;">
                    <button class="btn-secondary" id="cancelDepositBtn">Отмена</button>
                    <button class="btn-primary" id="confirmDepositBtn">💰 Пополнить</button>
                </div>
            </div>
        </div>
    `;
    
    // Добавить модальное окно в DOM
    const modalDiv = document.createElement('div');
    modalDiv.innerHTML = modalHtml;
    document.body.appendChild(modalDiv.firstElementChild);
    
    // Получить элементы
    const modal = document.getElementById('depositModal');
    const closeBtn = document.getElementById('closeDepositBtn');
    const cancelBtn = document.getElementById('cancelDepositBtn');
    const confirmBtn = document.getElementById('confirmDepositBtn');
    const amountInput = document.getElementById('deposit-amount');
    const previewBalance = document.getElementById('deposit-preview-balance');
    
    // Показать модальное окно
    modal.classList.remove('hidden');
    
    // Обновление предпросмотра при вводе суммы
    amountInput.addEventListener('input', () => {
        const amount = parseFloat(amountInput.value) || 0;
        const newBalance = user.bonus_balance + amount;
        previewBalance.textContent = newBalance;
        previewBalance.style.color = amount > 0 ? 'var(--accent)' : 'var(--text-muted)';
    });
    
    // Автофокус на поле ввода
    setTimeout(() => amountInput.focus(), 100);
    
    // Закрытие модального окна
    const closeModal = () => {
        modal.remove();
    };
    
    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    
    // Закрытие по клику вне окна
    modal.addEventListener('click', (e) => {
        if (e.target.id === 'depositModal') {
            closeModal();
        }
    });
    
    // Закрытие по ESC
    const handleEsc = (e) => {
        if (e.key === 'Escape') {
            closeModal();
            document.removeEventListener('keydown', handleEsc);
        }
    };
    document.addEventListener('keydown', handleEsc);
    
    // Подтверждение пополнения
    confirmBtn.addEventListener('click', async () => {
        const amount = parseFloat(amountInput.value);
        const paymentMethod = document.getElementById('deposit-payment-method').value;
        const comment = document.getElementById('deposit-comment').value.trim();
        
        // Валидация
        if (!amount || amount <= 0) {
            showErrorMessage('Введите корректную сумму пополнения');
            amountInput.focus();
            return;
        }
        
        if (amount > 100000) {
            showErrorMessage('Максимальная сумма пополнения: 100 000 ₽');
            return;
        }
        
        // Подтверждение
        const confirmText = `Пополнить баланс на ${amount} ₽?\n\nКлиент: ${user.email}\nСпособ оплаты: ${getPaymentMethodLabel(paymentMethod)}\nНовый баланс: ${user.bonus_balance + amount} ₽`;
        
        if (!confirm(confirmText)) {
            return;
        }
        
        // Выполнить пополнение
        try {
            showLoadingIndicator();
            confirmBtn.disabled = true;
            confirmBtn.textContent = 'Обработка...';
            
            await depositBonus(userId, amount, paymentMethod, comment);
            
            closeModal();
            
            // Перезагрузить данные
            await loadBonusUsers(currentOwnerEmail);
            renderBonusKPI();
            renderBonusUsersTable();
            
            showSuccessMessage(`Баланс успешно пополнен на ${amount} ₽`);
            
        } catch (error) {
            console.error('[Bonus] Deposit failed:', error);
            showErrorMessage('Ошибка пополнения: ' + error.message);
            confirmBtn.disabled = false;
            confirmBtn.textContent = '💰 Пополнить';
        } finally {
            hideLoadingIndicator();
        }
    });
};

/**
 * Пополнить баланс пользователя (продажа бонусов)
 */
async function depositBonus(userId, amount, paymentMethod, comment) {
    console.log('[Bonus] depositBonus:', { userId, amount, paymentMethod, comment });
    
    const db = firebase.firestore();
    
    try {
        // 1. Получить текущий баланс
        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists) {
            throw new Error('Пользователь не найден');
        }
        
        const userData = userDoc.data();
        const currentBalance = userData.bonus_balance || 0;
        const newBalance = currentBalance + amount;
        
        // 2. Создать ID транзакции
        const transactionId = `deposit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // 3. Данные транзакции
        const transactionData = {
            transaction_id: transactionId,
            type: 'deposit',
            amount_spent: amount,
            balance_before: currentBalance,
            balance_after: newBalance,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            status: 'completed',
            payment_method: paymentMethod,
            comment: comment || '',
            owner_email: currentOwnerEmail,
            operator_email: currentOwnerEmail,
            device_id: '', // Пополнение через админку, не через устройство
            device_session_id: '',
            session_id: transactionId,
            item_name: 'Пополнение баланса',
            item_article: '',
            quantity: 1,
            currency: '₽'
        };
        
        // 4. Batch операция для атомарности
        const batch = db.batch();
        
        // Обновить баланс пользователя
        batch.update(db.collection('users').doc(userId), {
            bonus_balance: newBalance,
            updated_at: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Создать транзакцию
        batch.set(
            db.collection('users').doc(userId).collection('transactions').doc(transactionId),
            transactionData
        );
        
        // Выполнить batch
        await batch.commit();
        
        console.log('[Bonus] Deposit completed successfully:', transactionId);
        
    } catch (error) {
        console.error('[Bonus] Deposit failed:', error);
        throw error;
    }
}

/**
 * Получить человекочитаемое название способа оплаты
 */
function getPaymentMethodLabel(method) {
    const labels = {
        'cash': '💵 Наличные',
        'card': '💳 Банковская карта',
        'bank_transfer': '🏦 Банковский перевод',
        'other': '📋 Другое'
    };
    return labels[method] || method;
}

/**
 * Показать сообщение об успехе (добавить в конец файла если нет)
 */
function showSuccessMessage(message) {
    const main = document.querySelector('main.main');
    if (!main) return;
    
    const successDiv = document.createElement('div');
    successDiv.className = 'success-message';
    successDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #10b981;
        color: white;
        padding: 16px 24px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        z-index: 10000;
        max-width: 400px;
        animation: slideIn 0.3s ease-out;
    `;
    successDiv.textContent = message;
    
    main.appendChild(successDiv);
    
    // Автоудаление через 4 секунды
    setTimeout(() => {
        successDiv.style.animation = 'slideOut 0.3s ease-in';
        setTimeout(() => successDiv.remove(), 300);
    }, 4000);
}

// ============================================================================
// 6. ИСТОРИЯ ТРАНЗАКЦИЙ
// ============================================================================

/**
 * Показать историю транзакций пользователя
 */
window.showUserTransactions = async function(userId) {
    console.log('Bonus Show transactions for', userId);
    const user = bonusUsers.find(u => u.id === userId);
    if (!user) {
      showErrorMessage('Пользователь не найден');
      return;
    }
  
    // Каркас модала
    const modalHtml = `
      <div id="bonusTxModal" class="modal">
        <div class="modal-content" style="min-width: 700px; max-width: 900px;">
          <span class="close" id="bonusTxCloseBtn">&times;</span>
          <h3 style="margin-bottom: 16px; color: var(--accent)">
            История операций — ${user.email || user.qrid || user.phone || user.id}
          </h3>
  
          <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 12px;">
            Текущий баланс: <strong style="color: var(--accent)">${user.bonusbalance || 0}</strong>
          </div>
  
          <div class="table-section">
            <div class="table-header">
              <div class="table-title">Последние операции</div>
            </div>
            <div class="table-scroll" style="max-height: 400px;">
              <table>
                <thead>
                  <tr>
                    <th style="width:40px;">#</th>
                    <th>Тип</th>
                    <th>Дата</th>
                    <th>Сумма</th>
                    <th>Баланс до</th>
                    <th>Баланс после</th>
                    <th>Статус</th>
                    <th>Комментарий</th>
                    <th>Метод</th>
                  </tr>
                </thead>
                <tbody id="bonus-tx-table-body">
                  <tr>
                    <td colspan="9" style="text-align:center; padding: 32px; color: var(--text-muted);">
                      Загрузка...
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    `;
  
    const wrapper = document.createElement('div');
    wrapper.innerHTML = modalHtml;
    document.body.appendChild(wrapper.firstElementChild);
  
    const modal = document.getElementById('bonusTxModal');
    const closeBtn = document.getElementById('bonusTxCloseBtn');
    const tbody = document.getElementById('bonus-tx-table-body');
  
    const closeModal = () => {
      modal.remove();
      document.removeEventListener('keydown', handleEsc);
    };
  
    const handleEsc = (e) => {
      if (e.key === 'Escape') closeModal();
    };
  
    closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target.id === 'bonusTxModal') closeModal();
    });
    document.addEventListener('keydown', handleEsc);
  
    modal.classList.remove('hidden');
  
    try {
      showLoadingIndicator();
      const transactions = await loadUserTransactions(userId, 100);
  
      if (!transactions || transactions.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="9" style="text-align:center; padding: 32px; color: var(--text-muted);">
              Операций пока нет
            </td>
          </tr>
        `;
        return;
      }
  
      const rows = transactions.map((tx, idx) => {
        const dateStr = tx.timestamp
          ? tx.timestamp.toDate().toLocaleString('ru-RU')
          : '';
        const amount = tx.amountspent || 0;
        const before = tx.balancebefore ?? '';
        const after = tx.balanceafter ?? '';
        const typeLabel = formatTransactionType(tx.type);
        const status = tx.status || '';
        const comment = tx.comment || '';
        const paymentMethod = tx.paymentmethod || '';
  
        const amountColor = amount >= 0 ? '#10b981' : '#ef4444';
  
        return `
          <tr>
            <td style="font-size:11px; color: var(--text-muted);">${idx + 1}</td>
            <td style="font-size:12px; font-weight:600;">${typeLabel}</td>
            <td style="font-size:11px;">${dateStr}</td>
            <td style="font-weight:700; color:${amountColor};">${amount}</td>
            <td style="font-size:11px;">${before}</td>
            <td style="font-size:11px;">${after}</td>
            <td style="font-size:11px;">${status}</td>
            <td style="font-size:11px; max-width:220px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${comment}">
              ${comment}
            </td>
            <td style="font-size:11px;">${getPaymentMethodLabel(paymentMethod)}</td>
          </tr>
        `;
      }).join('');
  
      tbody.innerHTML = rows;
    } catch (e) {
      console.error('Bonus loadUserTransactions failed', e);
      showErrorMessage('Не удалось загрузить операции');
    } finally {
      hideLoadingIndicator();
    }
}; 

/**
 * Загрузить транзакции пользователя
 */
async function loadUserTransactions(userId, limit = 50) {
    console.log('Bonus loadUserTransactions', userId, limit);
    const db = firebase.firestore();
  
    try {
      const snap = await db
        .collection('users')
        .doc(userId)
        .collection('transactions')
        .orderBy('timestamp', 'desc')
        .limit(limit)
        .get();
  
      if (snap.empty) return [];
  
      const list = [];
      snap.forEach(doc => {
        const data = doc.data();
        list.push({
          id: doc.id,
          type: data.type || 'purchase',
          amountspent: data.amountspent || 0,
          balancebefore: data.balancebefore,
          balanceafter: data.balanceafter,
          timestamp: data.timestamp || null,
          status: data.status || '',
          paymentmethod: data.paymentmethod || '',
          comment: data.comment || '',
          deviceid: data.deviceid || '',
          itemname: data.itemname || '',
          itemarticle: data.itemarticle || '',
        });
      });
  
      return list;
    } catch (error) {
      console.error('Bonus Failed to load transactions', error);
      throw error;
    }
}
  
// ============================================================================
// 7. ДОБАВЛЕНИЕ НОВОГО ПОЛЬЗОВАТЕЛЯ
// ============================================================================

/**
 * Показать модальное окно добавления пользователя
 */
window.showAddUserModal = function() {
    console.log('[Bonus] Show add user modal');
  
    const modalHtml = `
      <div id="addUserModal" class="modal">
        <div class="modal-content" style="min-width: 420px; max-width: 520px;">
          <span class="close" id="closeAddUserBtn">&times;</span>
          <h3 style="margin-bottom: 20px; color: var(--accent);">
            Новый бонусный пользователь
          </h3>
  
          <div class="settings-grid" style="grid-template-columns: 1fr; gap: 16px;">
            <!-- Email -->
            <div class="settings-field">
              <label class="settings-label" for="new-user-email">
                Email <span style="color:#ef4444">*</span>
              </label>
              <input
                type="email"
                id="new-user-email"
                class="settings-input"
                placeholder="user@example.com"
              />
              <small style="font-size:11px; color: var(--text-muted); margin-top:4px;">
                Используется для авторизации и уведомлений.
              </small>
            </div>
  
            <!-- Phone -->
            <div class="settings-field">
              <label class="settings-label" for="new-user-phone">
                Телефон
              </label>
              <input
                type="text"
                id="new-user-phone"
                class="settings-input"
                placeholder="+7..."
              />
              <small style="font-size:11px; color: var(--text-muted); margin-top:4px;">
                Необязательно, но желательно для связи.
              </small>
            </div>
   
            <!-- Initial balance -->
            <div class="settings-field">
              <label class="settings-label" for="new-user-balance">
                Стартовый баланс
              </label>
              <input
                type="number"
                id="new-user-balance"
                class="settings-input"
                placeholder="0"
                min="0"
                step="1"
                value="0"
              />
              <small style="font-size:11px; color: var(--text-muted); margin-top:4px;">
                При необходимости можно сразу начислить бонусы.
              </small>
            </div>
          </div>
  
          <div class="modal-actions" style="margin-top:24px;">
            <button class="btn-secondary" id="cancelAddUserBtn">Отмена</button>
            <button class="btn-primary" id="confirmAddUserBtn">Создать</button>
          </div>
        </div>
      </div>
    `;
  
    const wrapper = document.createElement('div');
    wrapper.innerHTML = modalHtml;
    document.body.appendChild(wrapper.firstElementChild);
  
    const modal = document.getElementById('addUserModal');
    const closeBtn = document.getElementById('closeAddUserBtn');
    const cancelBtn = document.getElementById('cancelAddUserBtn');
    const confirmBtn = document.getElementById('confirmAddUserBtn');

    const emailInput = document.getElementById('new-user-email');
    const phoneInput = document.getElementById('new-user-phone');
    const balanceInput = document.getElementById('new-user-balance');
  
    const closeModal = () => {
      modal.remove();
      document.removeEventListener('keydown', handleEsc);
    };
  
    const handleEsc = (e) => {
      if (e.key === 'Escape') closeModal();
    };
  
    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target.id === 'addUserModal') closeModal();
    });
    document.addEventListener('keydown', handleEsc);
  
    modal.classList.remove('hidden');
    setTimeout(() => emailInput.focus(), 100);
   
    // Подтверждение создания
    confirmBtn.addEventListener('click', async () => {
      const email = emailInput.value.trim();
      const phone = phoneInput.value.trim();
      const balance = parseFloat(balanceInput.value || '0') || 0;
  
      if (!email) {
        showErrorMessage('Укажите email');
        emailInput.focus();
        return;
      }
      if (!isValidEmail(email)) {
        showErrorMessage('Некорректный email');
        emailInput.focus();
        return;
      }
  
      if (phone && !isValidPhone(phone)) {
        showErrorMessage('Некорректный телефон');
        phoneInput.focus();
        return;
      }
    
      if (balance < 0) {
        showErrorMessage('Стартовый баланс не может быть отрицательным');
        balanceInput.focus();
        return;
      }
  
      const userData = {
        email,
        phone: phone || null,
        bonusbalance: balance,
        owneremail: currentOwnerEmail,
      };
  
      try {
        showLoadingIndicator();
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Создание...';
  
        await createNewUser(userData);
  
        closeModal();
        await loadBonusUsers(currentOwnerEmail);
        renderBonusKPI();
        renderBonusUsersTable();
        showSuccessMessage('Пользователь создан');
      } catch (error) {
        console.error('[Bonus] createNewUser failed', error);
        showErrorMessage(error.message || 'Не удалось создать пользователя');
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Создать';
      } finally {
        hideLoadingIndicator();
      }
    });
};  

/**
 * Создать нового пользователя
 */
async function createNewUser(userData) {
  console.log('[Bonus] createNewUser', userData);
  const db = firebase.firestore();

  // Нормализация
  const emailLower = userData.email.toLowerCase();
  const phone = userData.phone || null;
  const startBalance = userData.bonusbalance || 0;

  try {
    // Проверка на дубликат по email в рамках текущего owner_email
    const emailSnap = await db.collection('users')
      .where('owner_email', '==', currentOwnerEmail)
      .where('email', '==', emailLower)
      .limit(1)
      .get();

    if (!emailSnap.empty) {
      throw new Error('Пользователь с таким email уже существует');
    }

    const now = firebase.firestore.FieldValue.serverTimestamp();

    const newUser = {
      email: emailLower,
      phone,
      bonus_balance: startBalance,
      owner_email: currentOwnerEmail,
      nfc_links: {},
      created_at: now,
      updated_at: now,
    };

    const userRef = await db.collection('users').add(newUser);
    console.log('[Bonus] User created with id', userRef.id);

    // Стартовый депозит, чтобы история и баланс совпадали
    if (startBalance > 0) {
      const transactionId =
        'init_' +
        Date.now().toString(36) +
        Math.random().toString(36).substr(2, 6);

      const txData = {
        transactionid: transactionId,
        type: 'deposit',
        amount_spent: startBalance,
        balance_before: 0,
        balance_after: startBalance,
        timestamp: now,
        status: 'completed',
        payment_method: 'other',
        comment: 'Стартовый бонус при создании пользователя',
        owner_email: currentOwnerEmail,
        operator_email: currentOwnerEmail,
        device_id: '',
        device_session_id: '',
        session_id: transactionId,
        item_name: '',
        item_article: '',
        quantity: 1,
        currency: 'RUB',
      };

      await db
        .collection('users')
        .doc(userRef.id)
        .collection('transactions')
        .doc(transactionId)
        .set(txData);

      console.log('[Bonus] Initial deposit transaction created', transactionId);
    }

    return userRef.id;
  } catch (error) {
    console.error('[Bonus] Failed to create user', error);
    throw error;
  }
}

// ============================================================================
// 8. ИМПОРТ ИЗ EXCEL
// ============================================================================

/**
 * Показать модальное окно импорта
 */
window.showImportModal = function() {
    console.log('[Bonus] Show import modal');
  
    const modalHtml = `
      <div id="importUsersModal" class="modal">
        <div class="modal-content" style="min-width: 420px; max-width: 520px;">
          <span class="close" id="closeImportUsersBtn">&times;</span>
          <h3 style="margin-bottom: 16px; color: var(--accent);">
            Импорт бонусных пользователей (Excel)
          </h3>
  
          <div style="font-size:12px; color:var(--text-muted); margin-bottom:12px;">
            Поддерживается формат .xlsx. Ожидаемые колонки: 
            <strong>email</strong>, phone, qrid, bonusbalance.
          </div>
  
          <div class="settings-field" style="margin-bottom:16px;">
            <input type="file" id="import-users-file" accept=".xlsx" />
          </div>
  
          <div id="import-users-summary" style="font-size:12px; color:var(--text-muted); display:none;"></div>
  
          <div class="modal-actions" style="margin-top:24px;">
            <button class="btn-secondary" id="cancelImportUsersBtn">Отмена</button>
            <button class="btn-primary" id="confirmImportUsersBtn" disabled>Импортировать</button>
          </div>
        </div>
      </div>
    `;
  
    const wrapper = document.createElement('div');
    wrapper.innerHTML = modalHtml;
    document.body.appendChild(wrapper.firstElementChild);
  
    const modal = document.getElementById('importUsersModal');
    const closeBtn = document.getElementById('closeImportUsersBtn');
    const cancelBtn = document.getElementById('cancelImportUsersBtn');
    const confirmBtn = document.getElementById('confirmImportUsersBtn');
    const fileInput = document.getElementById('import-users-file');
    const summaryDiv = document.getElementById('import-users-summary');
  
    let parsedUsers = [];
  
    const closeModal = () => {
      modal.remove();
      document.removeEventListener('keydown', handleEsc);
    };
  
    const handleEsc = (e) => {
      if (e.key === 'Escape') closeModal();
    };
  
    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target.id === 'importUsersModal') closeModal();
    });
    document.addEventListener('keydown', handleEsc);
  
    modal.classList.remove('hidden');
  
    // Чтение файла
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) {
        parsedUsers = [];
        confirmBtn.disabled = true;
        summaryDiv.style.display = 'none';
        return;
      }
  
      try {
        showLoadingIndicator();
        const usersData = await handleExcelImport(file);
        parsedUsers = usersData;
  
        if (!parsedUsers || parsedUsers.length === 0) {
          summaryDiv.textContent = 'Не удалось найти подходящие записи в файле.';
          summaryDiv.style.display = 'block';
          confirmBtn.disabled = true;
        } else {
          summaryDiv.textContent = `Найдено записей: ${parsedUsers.length}. Нажмите «Импортировать» для загрузки.`;
          summaryDiv.style.display = 'block';
          confirmBtn.disabled = false;
        }
      } catch (e) {
        console.error('[Bonus] handleExcelImport failed', e);
        showErrorMessage('Ошибка чтения Excel файла');
        parsedUsers = [];
        confirmBtn.disabled = true;
        summaryDiv.style.display = 'none';
      } finally {
        hideLoadingIndicator();
      }
    });
  
    // Старт импорта
    confirmBtn.addEventListener('click', async () => {
      if (!parsedUsers || parsedUsers.length === 0) return;
  
      try {
        showLoadingIndicator();
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Импорт...';
  
        await importUsersFromData(parsedUsers);
  
        closeModal();
        await loadBonusUsers(currentOwnerEmail);
        renderBonusKPI();
        renderBonusUsersTable();
        showSuccessMessage('Импорт завершён');
      } catch (e) {
        console.error('[Bonus] importUsersFromData failed', e);
        showErrorMessage(e.message || 'Ошибка импорта пользователей');
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Импортировать';
      } finally {
        hideLoadingIndicator();
      }
    });
};  

/**
 * Обработать импорт файла Excel
 */
async function handleExcelImport(file) {
    console.log('[Bonus] handleExcelImport', file?.name);
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
  
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
  
          const firstSheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[firstSheetName];
          if (!sheet) {
            return resolve([]);
          }
  
          const raw = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  
          // Приводим к нормализованному виду
          const usersData = raw
            .map(row => {
              const email = String(row.email || row.Email || '').trim();
              const phone = String(row.phone || row.Phone || row.tel || '').trim();
              const qrid = String(row.qrid || row.QRID || row.qr || '').trim();
              const bonusRaw = row.bonusbalance || row.bonus || row.balance;
              const bonusbalance = bonusRaw !== undefined && bonusRaw !== null
                ? Number(bonusRaw) || 0
                : 0;
  
              return { email, phone, qrid, bonusbalance };
            })
            .filter(u => u.email || u.qrid); // отбрасываем пустые строки
  
          resolve(usersData);
        } catch (err) {
          reject(err);
        }
      };
  
      reader.onerror = (err) => reject(err);
      reader.readAsArrayBuffer(file);
    });
}

/**
 * Импортировать пользователей из массива данных
 */
async function importUsersFromData(usersData) {
    console.log('[Bonus] importUsersFromData count=', usersData?.length);
    if (!Array.isArray(usersData) || usersData.length === 0) return;
  
    const db = firebase.firestore();
    const now = firebase.firestore.FieldValue.serverTimestamp();
  
    const normalized = usersData.map(u => {
      const email = (u.email || '').trim();
      const phone = (u.phone || '').trim();
      const qrid = (u.qrid || '').trim();
  
      return {
        email,
        phone,
        qrid,
        bonusbalance: Number(u.bonusbalance || 0) || 0,
      };
    }).filter(u => u.email && isValidEmail(u.email) && u.qrid);
  
    if (normalized.length === 0) {
      throw new Error('Нет валидных записей для импорта');
    }
  
    // Импорт партиями
    const chunkSize = 400;
    for (let i = 0; i < normalized.length; i += chunkSize) {
      const chunk = normalized.slice(i, i + chunkSize);
      const batch = db.batch();
  
      chunk.forEach(u => {
        const docRef = db.collection('users').doc();
        const data = {
          email: u.email.toLowerCase(),
          phone: u.phone || null,
          qrid: u.qrid,
          bonusbalance: u.bonusbalance,
          owneremail: currentOwnerEmail,
          nfclinks: {},
          updatedat: now,
          createdat: now,
        };
        batch.set(docRef, data);
      });
  
      await batch.commit();
      console.log('[Bonus] Import batch committed, size=', chunk.length);
    }
}  

// ============================================================================
// 9. EMAIL РАССЫЛКА
// ============================================================================

/**
 * Отправить приглашение пользователю
 */
window.sendInvitation = async function(userId) {
  console.log('[Bonus] Send invitation to:', userId);

  const user = bonusUsers.find(u => u.id === userId);
  if (!user) {
    showErrorMessage('Пользователь не найден');
    return;
  }

  if (!user.email || !isValidEmail(user.email)) {
    showErrorMessage('У пользователя не указан корректный email');
    return;
  }

  const confirmText = `Отправить приглашение на ${user.email}?`;
  if (!confirm(confirmText)) return;

  try {
    showLoadingIndicator();

    const subject = 'Приглашение в бонусную программу OmyVai';

    // Тело письма не передаём — используется шаблон в Cloud Function
    await sendBulkInvitations([user.id], { subject });

    showSuccessMessage('Письмо с приглашением отправлено (или поставлено на отправку)');
  } catch (e) {
    console.error('[Bonus] sendInvitation failed', e);
    showErrorMessage('Не удалось отправить приглашение');
  } finally {
    hideLoadingIndicator();
  }
};

/**
 * Показать модальное окно массовой рассылки
 */
window.showBulkInvitationModal = function() {
  console.log('[Bonus] Show bulk invitation modal');

  if (!bonusUsers || bonusUsers.length === 0) {
    showErrorMessage('Нет пользователей для рассылки');
    return;
  }

  const modalHtml = `
    <div id="bulkInviteModal" class="modal">
      <div class="modal-content" style="min-width: 520px; max-width: 720px;">
        <span class="close" id="closeBulkInviteBtn">&times;</span>
        <h3 style="margin-bottom: 16px; color: var(--accent);">
          Массовая рассылка приглашений
        </h3>

        <div style="font-size:12px; color:var(--text-muted); margin-bottom:12px;">
          Будут отобраны пользователи с валидным email. Можно отредактировать тему и при желании задать свой текст письма.
          Если оставить текст пустым, будет использован стандартный шаблон.
        </div>

        <div class="settings-grid" style="grid-template-columns: 1fr; gap: 12px;">
          <div class="settings-field">
            <label class="settings-label" for="bulk-subject">Тема письма</label>
            <input
              type="text"
              id="bulk-subject"
              class="settings-input"
              value="Добро пожаловать в бонусную программу OmyVai"
            />
          </div>

          <div class="settings-field">
            <label class="settings-label" for="bulk-body">
              Текст письма (необязательно)
            </label>
            <textarea
              id="bulk-body"
              class="settings-input"
              style="min-height: 140px; resize: vertical; padding: 8px;"
            ></textarea>
            <small style="font-size:11px; color:var(--text-muted); margin-top:4px;">
              Можно использовать плейсхолдеры: {{email}}, {{qrid}}, {{resetLink}}.
              Если поле пустое, будет использован стандартный шаблон письма.
            </small>
          </div>
        </div>

        <div id="bulk-invite-summary" style="font-size:12px; color:var(--text-muted); margin-top:12px;">
        </div>

        <div class="modal-actions" style="margin-top:20px;">
          <button class="btn-secondary" id="cancelBulkInviteBtn">Отмена</button>
          <button class="btn-primary" id="confirmBulkInviteBtn">Отправить</button>
        </div>
      </div>
    </div>
  `;

  const wrapper = document.createElement('div');
  wrapper.innerHTML = modalHtml;
  document.body.appendChild(wrapper.firstElementChild);

  const modal = document.getElementById('bulkInviteModal');
  const closeBtn = document.getElementById('closeBulkInviteBtn');
  const cancelBtn = document.getElementById('cancelBulkInviteBtn');
  const confirmBtn = document.getElementById('confirmBulkInviteBtn');
  const summaryDiv = document.getElementById('bulk-invite-summary');
  const subjectInput = document.getElementById('bulk-subject');
  const bodyInput = document.getElementById('bulk-body');

  const validUsers = bonusUsers.filter(
    u => u.email && isValidEmail(u.email)
  );
  summaryDiv.textContent = `Будет отправлено писем: ${validUsers.length}.`;

  const closeModal = () => {
    modal.remove();
    document.removeEventListener('keydown', handleEsc);
  };

  const handleEsc = (e) => {
    if (e.key === 'Escape') closeModal();
  };

  closeBtn.addEventListener('click', closeModal);
  cancelBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target.id === 'bulkInviteModal') closeModal();
  });
  document.addEventListener('keydown', handleEsc);

  modal.classList.remove('hidden');

  confirmBtn.addEventListener('click', async () => {
    if (validUsers.length === 0) {
      showErrorMessage('Нет пользователей с валидным email');
      return;
    }

    const subject = subjectInput.value.trim();
    const body = bodyInput.value;

    if (!subject) {
      showErrorMessage('Укажите тему письма');
      subjectInput.focus();
      return;
    }

    // body можно оставить пустым → используем шаблон на функции
    const template = body.trim()
      ? { subject, body }
      : { subject };

    const confirmText = `Отправить приглашения ${validUsers.length} пользователям?`;
    if (!confirm(confirmText)) return;

    try {
      showLoadingIndicator();
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Отправка...';

      const ids = validUsers.map(u => u.id);
      await sendBulkInvitations(ids, template);

      closeModal();
      showSuccessMessage('Рассылка поставлена в очередь');
    } catch (e) {
      console.error('[Bonus] bulk invitations failed', e);
      showErrorMessage('Не удалось выполнить массовую рассылку');
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Отправить';
    } finally {
      hideLoadingIndicator();
    }
  });
};

/**
 * Отправить массовую рассылку
 */
async function sendBulkInvitations(userIds, emailTemplate) {
  console.log('[Bonus] sendBulkInvitations count=', userIds?.length);
  if (!Array.isArray(userIds) || userIds.length === 0) return;

  const usersMap = {};
  bonusUsers.forEach(u => {
    usersMap[u.id] = u;
  });

  const emails = userIds
    .map(id => usersMap[id])
    .filter(u => u && u.email && isValidEmail(u.email))
    .map(u => {
      // body может быть пустым → тогда сработает шаблон на функции
      let body = emailTemplate.body || '';
      body = body.replace(/{{email}}/g, u.email);
      body = body.replace(/{{qrid}}/g, u.qr_id || u.qrid || '');
      return {
        to: u.email,
        subject: emailTemplate.subject || 'Добро пожаловать в бонусную программу OmyVai',
        body, // допускаем пустую строку
      };
    });

  if (emails.length === 0) {
    throw new Error('Нет валидных получателей для рассылки');
  }

  const response = await fetch('https://functions.yandexcloud.net/d4etdb5ee52pm8745u5f', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emails }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error('Ошибка отправки: ' + text);
  }

  const result = await response.json();
  console.log('[Bonus] Email service response:', result);
  showSuccessMessage(`Письма отправлены: ${result.sent}, ошибок: ${result.failed}`);
}

// ============================================================================
// 10. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================================

/**
 * Форматировать относительное время
 */
function formatRelativeTime(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffMins < 1) return 'Только что';
    if (diffMins < 60) return `${diffMins} мин. назад`;
    if (diffHours < 24) return `${diffHours} ч. назад`;
    if (diffDays < 7) return `${diffDays} дн. назад`;
    
    return date.toLocaleDateString('ru-RU');
}

/**
 * Форматировать тип транзакции
 */
function formatTransactionType(type) {
    const types = {
        'purchase': '🛒 Покупка',
        'deposit': '💰 Пополнение',
        'refund': '↩️ Возврат',
        'adjustment': '✏️ Корректировка'
    };
    return types[type] || type;
}

/**
 * Валидация email
 */
function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Валидация телефона
 */
function isValidPhone(phone) {
    return /^[\d\s\+\-\(\)]+$/.test(phone);
}

/**
 * Показать только новых клиентов за 30 дней
 */
window.showNewUsers = function() {
  console.log('[Bonus] showNewUsers');

  if (!bonusUsers || bonusUsers.length === 0) {
    showErrorMessage('Нет клиентов для анализа');
    return;
  }

  const now = new Date();
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

  filteredBonusUsers = bonusUsers.filter(u => {
    if (!u.created_at) return false;
    const created = u.created_at.toDate ? u.created_at.toDate() : u.created_at;
    return (now - created) <= THIRTY_DAYS_MS;
  });

  if (filteredBonusUsers.length === 0) {
    showErrorMessage('За последние 30 дней новых клиентов не было');
  }

  renderBonusUsersTable();
};

// ============================================================================
// ЭКСПОРТ ФУНКЦИЙ
// ============================================================================

export {
    loadBonusUsers,
    renderBonusKPI,
    renderBonusUsersTable,
    applyBonusFilters
};
