/**
 * screen-money-device.js
 * Детальный экран денег по конкретному аппарату
 * - Загрузка и отображение операций
 * - Управление ценами (pricing)
 * - Работа с ассортиментом
 */

// ============================================================================
// ИМПОРТЫ
// ============================================================================
import { 
    formatRuble, 
    formatMarginPercent,
    getPeriodRange,
    loadClientDevices,
    loadTankCosts
  } from './basic.js';
  
  // ============================================================================
  // ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ
  // ============================================================================
  let currentOperations = [];
  let addPositionContext = {
    serviceName: null,    // 'WASHER_FLUID'
    deviceId: null,       // 'ven_00001'
    season: null          // 'winter' или 'summer'
  };
  // ============================================================================
  // 1. ОПЕРАЦИИ - ЗАГРУЗКА И ОТОБРАЖЕНИЕ
  // ============================================================================
  
  /**
   * Загружает операции для аппарата за период
   * ПЕРЕНЕСТИ ИЗ: basic.js → loadOperations()
   */
  export async function loadOperations(deviceId, period) {
    console.log('Loading operations for', deviceId, 'period', period);

    const fullDeviceId = deviceId.includes('@') ? deviceId : `${deviceId}@omyvai.ru`;
    const tbody = document.getElementById('operations-table-body');
    if (!tbody) return;
  
    tbody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align: center; padding: 40px; color: var(--text-muted);">
          Загрузка операций...
        </td>
      </tr>
    `;
  
    try {
      const { start, end } = getPeriodRange(period);
      console.log('Period range:', {
        start: start.toISOString(),
        end: end.toISOString(),
        deviceId: deviceId,
      });
  
      const db = firebase.firestore();
  
      // arrival – приходные операции
      const arrivalSnap = await db
        .collection('operation_arrival')
        .where('machineId', '==', fullDeviceId)
        .where('startedAt', '>=', start)
        .where('startedAt', '<=', end)
        .get();
  
      console.log('📥 Arrival operations found:', arrivalSnap.size);
  
      // expense – расходные операции (продажи/списания)
      const expenseSnap = await db
        .collection('operation_expense')
        .where('machineId', '==', fullDeviceId)
        .where('startedAt', '>=', start)
        .where('startedAt', '<=', end)
        .get();
  
      console.log('📤 Expense operations found:', expenseSnap.size);
  
      const operations = [];
  
      // Приходы: доход не считаем, в таблице будет прочерк
      arrivalSnap.forEach((doc) => {
        const d = doc.data();
        console.log('Arrival doc:', doc.id, d);
  
        operations.push({
          id: doc.id,
          type: 'arrival',
          createdAt: d.createdAt,
          startedAt: d.startedAt,
          finishedAt: d.finishedAt,
          serviceType: d.serviceType || '',
          nomenclature: d.nomenclature || '',
          sum: parseFloat(d.sum || '0') || 0,
          quantity: parseFloat(d.quantity || '0') || 0,
          units: d.units || '',
          price: parseFloat(d.price_new || d.price || '0') || 0,
          paymentMethod: d.paymentMethod || '',
          status: 'success',
          transactionNumber: d.transaction_number || '',
          // income для приходов не используется
          income: 0,
        });
      });
  
      // Расходы: НЕ отбрасываем, даже если income нет или он не число
      expenseSnap.forEach((doc) => {
        const d = doc.data();
        console.log('Expense doc:', doc.id, d);
  
        const incomeRaw = d.income;
        const incomeParsed = incomeRaw != null ? parseFloat(incomeRaw) : NaN;
        const safeIncome = isFinite(incomeParsed) ? incomeParsed : 0;
  
        operations.push({
          id: doc.id,
          type: 'expense',
          createdAt: d.createdAt,
          startedAt: d.startedAt,
          finishedAt: d.finishedAt,
          // Если serviceType не задан, считаем, что это стеклоомыватель
          serviceType: d.serviceType || 'WASHER_FLUID',
          nomenclature: d.nomenclature || '',
          sum: parseFloat(d.sum || '0') || 0,
          quantity: parseFloat(d.quantity || '0') || 0,
          units: d.units || '',
          price: parseFloat(d.price_new || d.price || '0') || 0,
          paymentMethod: d.paymentMethod || '',
          status: 'success',
          transactionNumber: d.transaction_number || '',
          income: safeIncome,
        });
      });
  
      console.log('✅ Total operations loaded:', operations.length);
  
      operations.sort((a, b) => {
        const ta = a.startedAt ? a.startedAt.toMillis() : 0;
        const tb = b.startedAt ? b.startedAt.toMillis() : 0;
        return tb - ta;
      });
  
      // Сохраняем операции глобально для расчёта Доход/Выручка/Чеков/Продано
      window._washerOperations = operations;
  
      // Рендерим таблицу операций
      renderOperationsTable(operations);
    } catch (e) {
      console.error('Failed to load operations for', deviceId, e);
      tbody.innerHTML = `
        <tr>
          <td colspan="9" style="text-align: center; padding: 40px; color: var(--text-muted);">
            Ошибка загрузки операций
          </td>
        </tr>
      `;
    }
   }
  
  /**
   * Рендерит таблицу операций
   * ПЕРЕНЕСТИ ИЗ: basic.js → renderOperationsTable()
   */
  export function renderOperationsTable(operations) { 
    currentOperations = operations; // Сохраняем для фильтров

    const tbody = document.getElementById('operations-table-body');
    if (!tbody) return;
  
    const serviceFilter = document.getElementById('service-filter');
    const statusFilter = document.getElementById('status-filter');
    const pageSizeEl   = document.getElementById('page-size');
    const searchInput  = document.getElementById('operations-search');
  
    const serviceValue = serviceFilter ? serviceFilter.value : 'all';
    const statusValue  = statusFilter ? statusFilter.value : 'all';
    const pageSize     = pageSizeEl ? parseInt(pageSizeEl.value, 10) || 50 : 50;
    const searchTerm   = searchInput ? searchInput.value.trim().toLowerCase() : '';
  
    let filtered = [...operations];
  
    // Фильтр по услуге
    if (serviceValue !== 'all') {
      filtered = filtered.filter(op => op.serviceType === serviceValue);
    }
  
    // Фильтр по статусу
    if (statusValue !== 'all') {
      filtered = filtered.filter(op => op.status === statusValue);
    }
  
    // Поиск
    if (searchTerm) {
      filtered = filtered.filter(op => {
        const sumStr  = op.sum.toString();
        const timeStr = op.startedAt ? op.startedAt.toDate().toLocaleString('ru-RU') : '';
        return sumStr.includes(searchTerm) || timeStr.includes(searchTerm);
      });
    }
  
    // Ограничение количества
    filtered = filtered.slice(0, pageSize);
  
    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="9" style="text-align: center; padding: 40px; color: var(--text-muted);">
            Нет операций за выбранный период
          </td>
        </tr>
      `;
      return;
    }
  
    const rowsHtml = filtered.map((op, idx) => {
      const dateStr = op.startedAt
        ? op.startedAt.toDate().toLocaleString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })
        : '—';
  
      const serviceLabel = getServiceLabel(op.serviceType);
      const paymentLabel = getPaymentLabel(op.paymentMethod);
  
      // Логика дохода:
      // arrival: доход от отдельной операции не считаем → прочерк
      // expense: используем income, который заранее посчитан и записан в Firestore
      let incomeDisplay = '—';
      let incomeColor   = 'var(--text-muted)';
  
      if (op.type === 'expense') {
        const incomeVal = typeof op.income === 'number' ? op.income : 0;
        incomeDisplay   = incomeVal.toFixed(2) + ' ₽';
        incomeColor     = incomeVal >= 0 ? '#22c55e' : '#ef4444';
      }
  
      const volume = [
        op.quantity != null && op.quantity !== '' ? op.quantity : '',
        op.units || '',
      ].join(' ').trim();
  
      return `
        <tr>
          <td>${idx + 1}</td>
          <td>${dateStr}</td>
          <td>${serviceLabel}</td>
          <td>${op.nomenclature || '—'}</td>
          <td>${op.sum.toFixed(2)} ₽</td>
          <td>${volume}</td>
          <td>${paymentLabel}</td>
          <td><span class="status-pill status-ok">Успешно</span></td>
          <td style="color: ${incomeColor}; font-weight: 600;">${incomeDisplay}</td>
        </tr>
      `;
    }).join('');
  
    tbody.innerHTML = rowsHtml;
  }
  
  /**
   * Получить название услуги
   * ПЕРЕНЕСТИ ИЗ: basic.js → getServiceLabel()
   */
  function getServiceLabel(serviceType) {
    switch (serviceType) {
      case 'WASHER_FLUID': return 'Стеклоомыватель';
      case 'VACUUM_CLEANER': return 'Пылесос';
      case 'TARGETED_DELIVERY': return 'Адресная выдача';
      default: return serviceType || '—';
    }
  }
  
  /**
   * Получить название метода оплаты
   * ПЕРЕНЕСТИ ИЗ: basic.js → getPaymentLabel()
   */
  function getPaymentLabel(method) {
    switch (method) {
      case 'cash': return 'Наличные';
      case 'card': return 'Карта';
      case 'bonus': return 'Бонусы';
      default: return method || '—';
    }
  }
  
  /**
   * Маппинг статуса операции
   * ПЕРЕНЕСТИ ИЗ: basic.js → mapStatusLabel()
   */
  function mapStatusLabel(status) {
    switch (status) {
      case 'success':
        return 'Успешно';
      case 'cancelled':
        return 'Отменено';
      default:
        return status || '';
    }
  }
  
  /**
   * Маппинг метода оплаты
   * ПЕРЕНЕСТИ ИЗ: basic.js → mapPaymentMethodLabel()
   */
  function mapPaymentMethodLabel(method) {
    switch (method) {
      case 'cash':
        return 'Наличные';
      case 'card':
        return 'Карта';
      case 'bonus':
        return 'Бонусы';
      default:
        return method || '';
    }
  }
  
  // ============================================================================
  // 2. УПРАВЛЕНИЕ ЦЕНАМИ - ОСНОВНЫЕ ФУНКЦИИ
  // ============================================================================
  
  /**
   * Показывает вкладку управления ценами для услуги
   * ПЕРЕНЕСТИ ИЗ: basic.js → showServicePricingTab()
   */
  export async function showServicePricingTab(deviceId, serviceId) { 
    const container = document.getElementById('service-pricing-container');
    if (!container) {
      console.error('Container service-pricing-container not found!');
      return;
    }
  
    console.log('Showing pricing for service:', serviceId);
  
    const periodSelect = document.getElementById('detail-period');
    const periodValue = periodSelect ? periodSelect.value : '7d';
  
    if (serviceId === 'WASHER_FLUID') {
      // Рендерим каркас секции цен
      container.innerHTML = renderWasherPricingSection(deviceId, periodValue);
  
      try {
        // 1. Загружаем себестоимость баков
        const tankCosts = await loadTankCosts(deviceId);
        // сохраняем глобально, чтобы использовать в renderWasherPricingTable / getSeasonAssortment
        window._washerTankCosts = tankCosts;
  
        // 2. Загружаем данные ассортимента и статистики
        await renderWasherPricingTable(deviceId);
      } catch (e) {
        console.error('Failed to load washer pricing data:', e);
        const tbody = document.getElementById('washer-pricing-table');
        if (tbody) {
          tbody.innerHTML = `
            <tr>
              <td colspan="12" style="text-align: center; padding: 40px; color: #ef4444;">
                Ошибка загрузки данных: ${e.message}
              </td>
            </tr>
          `;
        }
      }
  
    } else if (serviceId === 'VACUUM_CLEANER') {
      container.innerHTML = renderVacuumPricingSection(deviceId, periodValue);
  
    } else if (serviceId === 'TARGETED_DELIVERY') {
      container.innerHTML = renderDeliveryPricingSection(deviceId, periodValue);
  
    } else {
      container.innerHTML = `
        <div style="padding: 40px; text-align: center; color: var(--text-muted);">
          ${serviceId}
          <br>
          <small>Раздел в разработке</small>
        </div>
      `;
    }
  }
  
  /**
   * Рендерит секцию управления ценами для стеклоомывателя
   * ПЕРЕНЕСТИ ИЗ: basic.js → renderWasherPricingSection()
   */
  function renderWasherPricingSection(deviceId, period = '7d') {
    return `
      <section class="price-section">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <div style="display: flex; align-items: center; gap: 16px;">
            <div class="section-title" style="margin-bottom: 0;">Управление ценами и пропорциями · Стеклоомыватель</div>
            
            <!-- Переключатель сезона -->
            <div style="display: flex; gap: 4px; background: var(--bg-secondary); padding: 4px; border-radius: 6px;">
              <button 
                class="season-toggle-btn" 
                data-season="winter" 
                onclick="switchSeason('${deviceId}', 'WASHER_FLUID', 'winter')"
                style="padding: 6px 12px; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 600; transition: all 0.2s;">
                ❄️ Зима
              </button>
              <button 
                class="season-toggle-btn" 
                data-season="summer" 
                onclick="switchSeason('${deviceId}', 'WASHER_FLUID', 'summer')"
                style="padding: 6px 12px; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 600; transition: all 0.2s;">
                ☀️ Лето
              </button>
            </div>
          </div>
          
          <button class="btn-add-position" onclick="showAddPositionModal('WASHER_FLUID', '${deviceId}')">+ Добавить позицию</button>
        </div>
        
        <div class="price-table-wrapper">
          <table class="price-table">
          <thead>
            <tr>
              <th>Позиция</th>
              <th>Артикул</th>
              <th>Цена/л</th>
              <th>Новая цена</th>
              <th>Пропорция</th>
              <th>Себ-сть/л</th>
              <th>Маржа</th>
              <th>Доход</th>
              <th>Выручка</th>
              <th>Чеков</th>
              <th>Продано (л)</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody id="washer-pricing-table">
            <!-- renderWasherPricingTable -->
          </tbody>
        
          </table>
        </div>
      </section>
    `;
  }
  
  /**
   * Рендерит секцию управления ценами для пылесоса
   * ПЕРЕНЕСТИ ИЗ: basic.js → renderVacuumPricingSection()
   */
  function renderVacuumPricingSection(deviceId, periodValue) {
    return `
      <section class="price-section">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <div class="section-title" style="margin-bottom:0;">Настройка цен — Пылесос</div>
          <button class="btn-add-position"
                  onclick="alert('Настройка ассортимента пылесоса пока не реализована');">
            Добавить позицию
          </button>
        </div>
  
        <div class="price-table-wrapper">
          <table class="price-table">
            <thead>
              <tr>
                <th>Тариф</th>
                <th>Цена, ₽/мин</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody id="vacuum-pricing-table">
              <tr>
                <td colspan="3" style="text-align:center;padding:40px;color:var(--text-muted);">
                  Экран цен для пылесоса ещё не сделан.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    `;
  }
  
  /**
   * Рендерит секцию управления ценами для адресной выдачи
   * ПЕРЕНЕСТИ ИЗ: basic.js → renderDeliveryPricingSection()
   */
  function renderDeliveryPricingSection() {
    return `
      <section class="price-section">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <div class="section-title" style="margin-bottom:0;">Адресное хранение · Ячейки и тарифы</div>
          <button class="btn-add-position" onclick="showAddPositionModal('TARGETED_DELIVERY')">+ Добавить ячейку</button>
        </div>
        
        <div class="price-table-wrapper">
          <table class="price-table">
            <thead>
              <tr>
                <th>Ячейка</th>
                <th>Цена / день</th>
                <th>Объём</th>
                <th>Себ-сть / день</th>
                <th>Маржа</th>
                <th>Доход</th>
                <th>Выручка</th>
                <th>Аренд</th>
                <th>Занятость</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody id="delivery-pricing-table">
              <tr>
                <td style="font-weight:600;">S (мал.)</td>
                <td><input type="number" class="price-input-small" value="50" /></td>
                <td>10 л</td>
                <td style="color:var(--text-muted);font-size:11px;">15 ₽</td>
                <td><div style="color:#22c55e;font-weight:600;">70 %</div></td>
                <td><div style="font-weight:600;color:#22c55e;">9 800 ₽</div></td>
                <td><div style="font-weight:600;">14 000 ₽</div></td>
                <td><div style="font-weight:600;">120</div></td>
                <td><div style="font-weight:600;">65 %</div></td>
                <td>
                  <button class="btn-save-price">Сохранить</button>
                  <button class="btn-delete-position">Удалить</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    `;
  }
   
  
  // ============================================================================
  // 3. УПРАВЛЕНИЕ ЦЕНАМИ - СТЕКЛООМЫВАТЕЛЬ
  // ============================================================================
  
  /**
   * Рендерит таблицу цен для стеклоомывателя
   * ПЕРЕНЕСТИ ИЗ: basic.js → renderWasherPricingTable()
   */
  export async function renderWasherPricingTable(deviceId) {
    const tbody = document.getElementById('washer-pricing-table');
    if (!tbody) {
      console.error('Table body washer-pricing-table not found');
      return;
    }
  
    // Показываем загрузку
    tbody.innerHTML = `
      <tr>
        <td colspan="12" style="text-align: center; padding: 40px; color: var(--text-muted);">
          Загрузка данных...
        </td>
      </tr>
    `;
  
    try {
      // 1. Загружаем настройки модуля
      const serviceModule = await loadServiceModuleSettings(deviceId, 'WASHER_FLUID');
  
      if (!serviceModule) {
        tbody.innerHTML = `
          <tr>
            <td colspan="12" style="text-align: center; padding: 40px; color: var(--text-muted);">
              Настройки услуги не найдены
            </td>
          </tr>
        `;
        return;
      }
  
      // 2. Получаем текущий сезон
      const currentSeason = serviceModule.service_season || 'winter';
      console.log('📅 Current season:', currentSeason);
  
      // Подсвечиваем активную кнопку сезона
      updateSeasonButtons(currentSeason);
  
      // 3. Загружаем ассортимент
      const tankCosts = window._washerTankCosts || {};
      const assortment = getSeasonAssortment(serviceModule, currentSeason, tankCosts);
      console.log('📦 Assortment loaded:', assortment);
  
      if (assortment.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="12" style="text-align: center; padding: 40px; color: var(--text-muted);">
              Нет позиций в ассортименте для сезона "${currentSeason}"
            </td>
          </tr>
        `;
        return;
      }
  
      // 4. Берём операции текущего периода и строим статистику по SKU
      const allOperations = window._washerOperations || [];
      const salesStats = buildSalesStatsBySku(allOperations);
  
      // 5. Рендерим строки таблицы
      const rows = assortment.map(item => {
        const stats = salesStats[item.sku] || {};
  
        const article = item.article || '';     // assortment_article
        const name = item.name;                 // -10, -15 и т.п.
  
        const basePrice   = item.price;         // Цена/л (assortment_price)
        const clientPrice = item.priceNew;      // Новая цена (assortment_price_new)
        const costPrice   = item.cost;          // Себ-сть/л (из баков/фоллбек)
  
        const currency = item.currency;
        const proportion = item.proportion;
        const unit = item.unit;
  
        // Маржа относительно себестоимости
        const margin = costPrice > 0 && clientPrice > 0
          ? ((clientPrice - costPrice) / clientPrice * 100).toFixed(0)
          : 0;
  
        // Лог по расчёту маржи
        console.log('🧮 Margin calc:', {
          sku: item.sku,
          name,
          basePrice,
          costPrice,
          clientPrice,
          marginPercent: margin
        });
  
        const marginColor = margin > 0 ? '#22c55e' : '#ef4444';
  
        // Статистика по позиции за выбранный период
        const income  = stats.income  || 0; // Доход
        const revenue = stats.revenue || 0; // Выручка
        const checks  = stats.checks  || 0; // Чеков
        const volume  = stats.volume  || 0; // Продано (л)
  
        return `
          <tr data-sku="${item.sku}">
            <td style="font-weight: 600;">${name}°C</td>
            <td>${article || '—'}</td>
            <td>
              <input
                type="number"
                class="price-input-small"
                value="${basePrice}"
                data-sku="${item.sku}"
                data-field="price"
                style="width: 80px;">
            </td>
            <td>
              <input
                type="number"
                class="price-input-small"
                value="${clientPrice}"
                data-sku="${item.sku}"
                data-field="price_new"
                style="width: 80px;">
            </td>
            <td>
              <div style="display: flex; gap: 4px; align-items: center;">
                <input
                  type="number"
                  class="proportion-input"
                  value="${proportion}"
                  min="0"
                  max="100"
                  data-sku="${item.sku}"
                  data-field="proportion"
                  style="width: 60px;">
                <span style="font-size: 10px; color: var(--text-muted);">%</span>
              </div>
            </td>
            <td style="color: var(--text-muted); font-size: 11px;">
              ${costPrice.toFixed(2)} ${currency}
            </td>
            <td>
              <div style="color: ${marginColor}; font-weight: 600;">
                ${margin} %
              </div>
            </td>
            <td>
              <div style="font-weight: 600; color: #22c55e;">
                ${income.toFixed(2)} ${currency}
              </div>
            </td>
            <td>
              <div style="font-weight: 600;">
                ${revenue.toFixed(2)} ${currency}
              </div>
            </td>
            <td>
              <div style="font-weight: 600;">${checks}</div>
            </td>
            <td>
              <div style="font-weight: 600;">
                ${volume.toFixed(1)} ${unit}
              </div>
            </td>
            <td>
              <button class="btn-save-price"
                      onclick="savePricePosition('${deviceId}', '${item.sku}')">
                Сохранить
              </button>
              <button class="btn-delete-position"
                      onclick="deletePosition('${deviceId}', '${item.sku}')">
                Удалить
              </button>
            </td>
          </tr>
        `;
      }).join('');
  
      tbody.innerHTML = rows;
  
    } catch (error) {
      console.error('❌ Failed to render pricing table:', error);
      tbody.innerHTML = `
        <tr>
          <td colspan="12" style="text-align: center; padding: 40px; color: #ef4444;">
            Ошибка загрузки данных: ${error.message}
          </td>
        </tr>
      `;
    }
   }
  
  /**
   * Загружает модуль услуги из Realtime Database
   * ПЕРЕНЕСТИ ИЗ: basic.js → loadServiceModuleSettings()
   */
  async function loadServiceModuleSettings(deviceId, serviceType) {
    try {
      const rtdb = firebase.database();
      const shortDeviceId = deviceId.replace('@omyvai.ru', '');
      
      const modulesRef = rtdb.ref(`devices_setting/${shortDeviceId}/modules`);
      const snapshot = await modulesRef.once('value');
      const modules = snapshot.val();
      
      if (!modules) {
        console.warn(`No modules found for device ${deviceId}`);
        return null;
      }
      
      // Модули могут быть массивом или объектом
      const modulesList = Array.isArray(modules) ? modules : Object.values(modules);
      const serviceModule = modulesList.find(m => m.service_name === serviceType);
      
      if (!serviceModule) {
        console.warn(`Service ${serviceType} not found for device ${deviceId}`);
        return null;
      }
      
      console.log('✅ Service module loaded:', serviceModule);
      return serviceModule;
    } catch (error) {
      console.error('Failed to load service module settings:', error);
      return null;
    }
  }
  
    /**
     * Получает ассортимент для сезона с расчётом себестоимости из баков
     * @param {Object} serviceModule - Модуль услуги из Firebase
     * @param {string} season - Сезон ('winter' или 'summer')
     * @param {Object} tankCosts - Себестоимость литра в баках {tank_1: 70, tank_2: 3}
     * @returns {Array} Массив позиций ассортимента
     */
    function getSeasonAssortment(serviceModule, season, tankCosts = {}) {
        const seasonMap = serviceModule.service_season_map || serviceModule.serviceseasonmap || {};
        const seasonData = seasonMap[season] || {};
        
        const rawAssortment = Array.isArray(seasonData.assortment)
        ? seasonData.assortment
        : Object.values(seasonData.assortment || {});
    
        const tank1Cost = tankCosts.tank_1 || 0;
        const tank2Cost = tankCosts.tank_2 || 0;
    
        const items = rawAssortment
        .filter(raw =>
            raw.assortment_enabled === 'true' ||
            raw.assortment_enabled === true
        )
        .map((raw, index) => {
            const recipeArr = Array.isArray(raw.assortment_recipe)
            ? raw.assortment_recipe
            : [];
    
            let p1 = parseFloat((recipeArr[0] || '0').toString().replace('−', '-').replace(',', '.'));
            let p2 = parseFloat((recipeArr[1] || '0').toString().replace('−', '-').replace(',', '.'));
    
            if (!isFinite(p1)) p1 = 0;
            if (!isFinite(p2)) p2 = 0;
    
            const sumP = p1 + p2;
            if (sumP > 0 && sumP !== 100) {
            p1 = (p1 / sumP) * 100;
            p2 = (p2 / sumP) * 100;
            }
    
            const a1 = p1 / 100;
            const a2 = p2 / 100;
    
            const calcCostFromTanks = a1 * tank1Cost + a2 * tank2Cost;
    
            // Себестоимость/л: из баков с фоллбеком на assortment_price
            const costPrice = calcCostFromTanks > 0
            ? calcCostFromTanks
            : parseFloat(raw.assortment_price || '0');
            
            // Цена/л (базовая) — из assortment_price
            const uiBasePrice = parseFloat(raw.assortment_price || '0');
            
            // Новая цена/л — из assortment_price_new, фоллбек на базовую цену
            const uiNewPrice = parseFloat(
            raw.assortment_price_new || raw.assortment_price || '0'
            );
    
            const sku = `washer_${raw.assortment_name}`;
    
            return {
            index,
            sku,
            article: raw.assortment_article || '',
            comment: raw.assortment_comment || '',
            currency: raw.assortment_currency || '₽',
            enabled:
                raw.assortment_enabled === 'true' || raw.assortment_enabled === true,
            link: raw.assortment_link || '',
            name: raw.assortment_name,
            
            // Цена/л базовая (из assortment_price)
            price: uiBasePrice,
            
            // Новая цена/л (из assortment_price_new)
            priceNew: uiNewPrice,
            
            // Себестоимость литра, рассчитанная из баков
            cost: costPrice,
            
            recipe: recipeArr,
            proportion: p1,
            unit: raw.assortment_unit || 'литр'
            };
        });
    
        console.log('🧮 Season assortment with tank costs:', items);
        return items;
    } 
  
  /**
   * Строит статистику продаж по SKU
   * ПЕРЕНЕСТИ ИЗ: basic.js → buildSalesStatsBySku()
   */
    function buildSalesStatsBySku(operations) {
        const stats = {}; // { 'washer_-10': { income, revenue, checks, volume } }
        
        operations.forEach(op => {
            if (op.type !== 'expense') return;
            if (op.serviceType !== 'WASHER_FLUID') return;
        
            const name = op.nomenclature; // "-10", "-15" и т.п.
            if (!name) return;
        
            const sku = `washer_${name}`;
        
            if (!stats[sku]) {
            stats[sku] = {
                income: 0,
                revenue: 0,
                checks: 0,
                volume: 0
            };
            }
        
            const s = stats[sku];
        
            const sum = typeof op.sum === 'number' ? op.sum : parseFloat(op.sum || '0');
            const inc = typeof op.income === 'number' ? op.income : parseFloat(op.income || '0');
            const qty = typeof op.quantity === 'number' ? op.quantity : parseFloat(op.quantity || '0');
        
            if (sum > 0) s.revenue += sum; // Выручка
            if (inc > 0) s.income += inc;  // Доход
            if (qty > 0) s.volume += qty;  // Продано (л)
        
            s.checks += 1;                 // Чеков
        });
        
        console.log('📊 Built sales stats by SKU:', stats);
        return stats;
    }

  
  /**
   * Обновляет кнопки переключения сезонов
   * ПЕРЕНЕСТИ ИЗ: basic.js → updateSeasonButtons()
   */
  function updateSeasonButtons(activeSeason) {
    const buttons = document.querySelectorAll('.season-toggle-btn');
    
    buttons.forEach(btn => {
      const season = btn.dataset.season;
      
      if (season === activeSeason) {
        // Активная кнопка
        btn.style.background = 'var(--primary)';
        btn.style.color = 'white';
      } else {
        // Неактивная кнопка
        btn.style.background = 'transparent';
        btn.style.color = 'var(--text-muted)';
      }
    });
  }
  
  /**
   * Переключает сезон
   * ПЕРЕНЕСТИ ИЗ: basic.js → switchSeason()
   */
  export async function switchSeason(deviceId, serviceType, newSeason) {
    try {
        console.log('🔄 Switching season:', deviceId, serviceType, newSeason);
        
        // Сохраняем новый сезон в Realtime Database
        const rtdb = firebase.database();
        const shortDeviceId = deviceId.replace('@omyvai.ru', '');
        
        // Находим индекс модуля
        const modulesSnapshot = await rtdb.ref(`devices_setting/${shortDeviceId}/modules`).once('value');
        const allModules = modulesSnapshot.val();
        const modulesList = Array.isArray(allModules) ? allModules : Object.values(allModules);
        const moduleIndex = modulesList.findIndex(m => m.service_name === serviceType);
        
        if (moduleIndex === -1) {
          alert('Модуль не найден');
          return;
        }
        
        const modulePath = `devices_setting/${shortDeviceId}/modules/${moduleIndex}`;
        
        // Обновляем сезон
        await rtdb.ref(`${modulePath}/service_season`).set(newSeason);
        
        console.log('✅ Season switched to:', newSeason);
        
        // Обновляем UI: подсвечиваем активную кнопку
        updateSeasonButtons(newSeason);
        
        // Перезагружаем таблицу с новым ассортиментом
        await renderWasherPricingTable(deviceId);
        
      } catch (error) {
        console.error('❌ Failed to switch season:', error);
        alert('Ошибка переключения сезона: ' + error.message);
      }
   }
  
  // ============================================================================
  // 4. УПРАВЛЕНИЕ ЦЕНАМИ - РЕДАКТИРОВАНИЕ ПОЗИЦИЙ
  // ============================================================================
  
  /**
   * Сохраняет изменение цены позиции
   * ПЕРЕНЕСТИ ИЗ: basic.js → savePricePosition()
   */
  export async function savePricePosition(deviceId, sku) { 
    try {
        console.log('💾 Saving position:', deviceId, sku);
        
        // Находим строку в таблице
        const row = document.querySelector(`tr[data-sku="${sku}"]`);
        if (!row) {
          alert('Позиция не найдена в таблице');
          return;
        }
        
        // Читаем новые значения из инпутов
        const priceInput = row.querySelector('input[data-field="price_new"]');
        const proportionInput = row.querySelector('input[data-field="proportion"]');
        
        const newPrice = parseFloat(priceInput.value);
        const newProportion = parseFloat(proportionInput.value);
        
        // Валидация
        if (isNaN(newPrice) || newPrice < 0) {
          alert('Некорректная цена (должна быть >= 0)');
          priceInput.focus();
          return;
        }
        
        if (isNaN(newProportion) || newProportion < 0 || newProportion > 100) {
          alert('Некорректная пропорция (должна быть от 0 до 100)');
          proportionInput.focus();
          return;
        }
        
        // Загружаем текущие настройки модуля
        const serviceModule = await loadServiceModuleSettings(deviceId, 'WASHER_FLUID');
        if (!serviceModule) {
          alert('Не удалось загрузить настройки услуги');
          return;
        }
        
        const currentSeason = serviceModule.service_season || 'winter';
        const assortment = serviceModule.service_season_map?.[currentSeason]?.assortment;
        
        if (!assortment) {
          alert('Ассортимент не найден');
          return;
        }
        
        // Ищем индекс позиции в массиве
        const items = Array.isArray(assortment) ? assortment : Object.values(assortment);
        const itemIndex = items.findIndex(item => {
          const itemSku = `washer_${item.assortment_name}`;
          return itemSku === sku;
        });
        
        if (itemIndex === -1) {
          alert('Позиция не найдена в настройках');
          return;
        }
        
        // Вычисляем процент добавки (вода)
        const additiveProportion = 100 - newProportion;
        
        // Формируем обновленный рецепт
        const updatedRecipe = [
          `${newProportion}%`,
          `${additiveProportion}%`
        ];
        
        // Путь к позиции в Realtime Database
        const rtdb = firebase.database();
        const shortDeviceId = deviceId.replace('@omyvai.ru', '');
        
        // Находим индекс модуля WASHER_FLUID
        const modulesList = Array.isArray(serviceModule.modules) 
          ? serviceModule.modules 
          : Object.values(serviceModule.modules || []);
        
        // Нужно найти индекс модуля в исходном массиве
        const modulesSnapshot = await rtdb.ref(`devices_setting/${shortDeviceId}/modules`).once('value');
        const allModules = modulesSnapshot.val();
        const modulesList2 = Array.isArray(allModules) ? allModules : Object.values(allModules);
        const moduleIndex = modulesList2.findIndex(m => m.service_name === 'WASHER_FLUID');
        
        if (moduleIndex === -1) {
          alert('Модуль не найден');
          return;
        }
        
        const positionPath = `devices_setting/${shortDeviceId}/modules/${moduleIndex}/service_season_map/${currentSeason}/assortment/${itemIndex}`;
        
        console.log('📝 Updating position at path:', positionPath);
        
        // Обновляем данные
        await rtdb.ref(positionPath).update({
          assortment_price_new: newPrice.toString(),
          assortment_recipe: updatedRecipe,
        });
        
        console.log('✅ Position saved successfully');
        alert('Изменения сохранены');
        
        // Перезагружаем таблицу, чтобы показать обновленные данные
        await renderWasherPricingTable(deviceId);
        
      } catch (error) {
        console.error('❌ Failed to save position:', error);
        alert('Ошибка сохранения: ' + error.message);
      }
  }
  
  /**
   * Удаляет позицию из ассортимента
   * ПЕРЕНЕСТИ ИЗ: basic.js → deletePosition()
   */
  export async function deletePosition(deviceId, sku) { 
    if (!confirm(`Удалить позицию ${sku}?\n\nПозиция будет скрыта, но данные сохранятся.`)) {
        return;
      }
      
      try {
        console.log('🗑️ Deleting position:', deviceId, sku);
        
        // Загружаем текущие настройки модуля
        const serviceModule = await loadServiceModuleSettings(deviceId, 'WASHER_FLUID');
        if (!serviceModule) {
          alert('Не удалось загрузить настройки услуги');
          return;
        }
        
        const currentSeason = serviceModule.service_season || 'winter';
        const assortment = serviceModule.service_season_map?.[currentSeason]?.assortment;
        
        if (!assortment) {
          alert('Ассортимент не найден');
          return;
        }
        
        // Ищем индекс позиции
        const items = Array.isArray(assortment) ? assortment : Object.values(assortment);
        const itemIndex = items.findIndex(item => {
          const itemSku = `washer_${item.assortment_name}`;
          return itemSku === sku;
        });
        
        if (itemIndex === -1) {
          alert('Позиция не найдена');
          return;
        }
        
        // Находим индекс модуля
        const rtdb = firebase.database();
        const shortDeviceId = deviceId.replace('@omyvai.ru', '');
        const modulesSnapshot = await rtdb.ref(`devices_setting/${shortDeviceId}/modules`).once('value');
        const allModules = modulesSnapshot.val();
        const modulesList = Array.isArray(allModules) ? allModules : Object.values(allModules);
        const moduleIndex = modulesList.findIndex(m => m.service_name === 'WASHER_FLUID');
        
        if (moduleIndex === -1) {
          alert('Модуль не найден');
          return;
        }
        
        const positionPath = `devices_setting/${shortDeviceId}/modules/${moduleIndex}/service_season_map/${currentSeason}/assortment/${itemIndex}`;
        
        // Помечаем позицию как отключенную
        await rtdb.ref(positionPath).update({
          assortment_enabled: 'false',
        });
        
        console.log('✅ Position deleted successfully');
        alert('Позиция удалена');
        
        // Перезагружаем таблицу
        await renderWasherPricingTable(deviceId);
        
      } catch (error) {
        console.error('❌ Failed to delete position:', error);
        alert('Ошибка удаления: ' + error.message);
      }
  }
  
  /**
   * Показывает модальное окно добавления позиции
   * ПЕРЕНЕСТИ ИЗ: basic.js → showAddPositionModal()
   */
  export function showAddPositionModal(serviceType, deviceId) {
    console.log('showAddPositionModal called', serviceType, deviceId); 
    addPositionContext.serviceName = serviceType; 
    addPositionContext.deviceId = deviceId;
    addPositionContext.season = 'winter'; 
  
    const modal = document.getElementById('add-position-modal');
    if (!modal) {
      console.error('add-position-modal not found');
      return;
    }
  
    document.getElementById('ap-article').value = '';
    document.getElementById('ap-name').value = '';
    document.getElementById('ap-comment').value = '';
    document.getElementById('ap-link').value = '';
    document.getElementById('ap-price').value = '';
    document.getElementById('ap-price-new').value = '';
  
    const r1 = document.getElementById('ap-recipe-1');
    const r2 = document.getElementById('ap-recipe-2');
    if (r1 && r2) {
      r1.value = '99';
      r2.value = '1';
    }
  
    document.getElementById('ap-unit').value = 'литр';
    document.getElementById('ap-enabled').checked = true;
  
    initRecipeInputs();
  
    modal.classList.remove('hidden');
  }
  
  /**
   * Закрывает модальное окно добавления позиции
   * ПЕРЕНЕСТИ ИЗ: basic.js → closeAddPositionModal()
   */
  export function closeAddPositionModal() {
    document.getElementById('add-position-modal').classList.add('hidden');
   }
  
  /**
   * Подтверждает добавление позиции
   * ПЕРЕНЕСТИ ИЗ: basic.js → confirmAddPosition()
   */
  export async function confirmAddPosition() {
    const article = document.getElementById('ap-article').value.trim();
    const name = document.getElementById('ap-name').value.trim();
    const comment = document.getElementById('ap-comment').value.trim();
    const link = document.getElementById('ap-link').value.trim();
    const price = document.getElementById('ap-price').value.trim();
    const priceNew = document.getElementById('ap-price-new').value.trim();
    const recipe1 = document.getElementById('ap-recipe-1').value.trim();
    const recipe2 = document.getElementById('ap-recipe-2').value.trim();
    const unit = document.getElementById('ap-unit').value.trim() || 'литр';
    const enabled = document.getElementById('ap-enabled').checked ? 'true' : 'false';
  
    // простая валидация
    if (!name || !price) {
      alert('Заполните минимум название и цену.');
      return;
    }
  
    const recipe = [recipe1 || '0%', recipe2 || '0%'];
  
    const payload = {
      assortment_article: article,
      assortment_comment: comment,
      assortment_currency: '₽',
      assortment_enabled: enabled,
      assortment_link: link,
      assortment_name: name,
      assortment_price: String(price),
      assortment_price_new: String(priceNew || price),
      assortment_recipe: recipe,
      assortment_unit: unit
    };
  
    const confirmText =
      `Добавить позицию:\n` +
      `Название: ${payload.assortment_name}\n` +
      `Цена: ${payload.assortment_price} ₽ (новая: ${payload.assortment_price_new} ₽)\n` +
      `Рецепт: ${payload.assortment_recipe.join(' / ')}\n\n` +
      `Продолжить?`;
  
    if (!window.confirm(confirmText)) {
      return;
    }
  
    try {
      await addAssortmentToFirebase(addPositionContext, payload);
      closeAddPositionModal();
      // здесь можно дернуть перерисовку списка позиций
    } catch (e) {
      console.error('Ошибка добавления позиции', e);
      alert('Не удалось сохранить позицию. Проверьте подключение.');
    }
   }
  
  /**
   * Добавляет позицию в Firebase
   * ПЕРЕНЕСТИ ИЗ: basic.js → addAssortmentToFirebase()
   */
  async function addAssortmentToFirebase(context, payload) {
    const { deviceId, season } = context; // 'ven_00001', 'winter'
  
    // Находим модуль WASHER_FLUID по service_name
    const deviceRef = firebase.database().ref(`devices_setting/${deviceId}`);
    const snapshot = await deviceRef.child('modules').once('value');
    const modules = snapshot.val() || [];
  
    let moduleIndex = null;
  
    Object.keys(modules).forEach((idx) => {
      if (modules[idx].service_name === 'WASHER_FLUID') {
        moduleIndex = idx;
      }
    });
  
    if (moduleIndex === null) {
      throw new Error('Модуль WASHER_FLUID не найден');
    }
  
    const assortmentRef = deviceRef
      .child(`modules/${moduleIndex}/service_season_map/${season}/assortment`);
  
    const assortmentSnap = await assortmentRef.once('value');
    const list = assortmentSnap.val() || [];
  
    // Добавляем в конец массива
    const newIndex = list.length;
    await assortmentRef.child(String(newIndex)).set(payload);
  }
  
  /**
   * Инициализирует inputs рецептуры (пропорций)
   * ПЕРЕНЕСТИ ИЗ: basic.js → initRecipeInputs()
   */
  export function initRecipeInputs() { 
    const r1 = document.getElementById('ap-recipe-1');
    const r2 = document.getElementById('ap-recipe-2');
    if (!r1 || !r2) return;
  
    function updateRecipe2() {
      let v1 = parseFloat(String(r1.value).replace(',', '.'));
      if (isNaN(v1)) v1 = 0;
      if (v1 < 0) v1 = 0;
      if (v1 > 100) v1 = 100;
      r1.value = v1.toString();
      const v2 = 100 - v1;
      r2.value = v2.toString();
    }
  
    r1.removeEventListener('input', r1._updateRecipe2 || (() => {}));
    r1.removeEventListener('blur', r1._updateRecipe2 || (() => {}));
    r1._updateRecipe2 = updateRecipe2;
  
    r1.addEventListener('input', updateRecipe2);
    r1.addEventListener('blur', updateRecipe2);
  
    updateRecipe2();
  }
  
  // ============================================================================
  // 5. СТАТИСТИКА ПРОДАЖ
  // ============================================================================
  
  /**
   * Загружает статистику продаж для ассортимента (заглушка)
   * ПЕРЕНЕСТИ ИЗ: basic.js → loadSalesStatsForAssortment()
   */
  async function loadSalesStatsForAssortment(deviceId, assortment) {
    // Пока возвращаем пустой объект
    // В следующем этапе загрузим реальные данные из Firestore
    return {};
  }
  
  /**
   * Загружает статистику по услуге и периоду
   * ПЕРЕНЕСТИ ИЗ: basic.js → loadServicePricingStats()
   */
  async function loadServicePricingStats(deviceId, serviceId, periodValue) {
    const { start, end } = getPeriodRange(periodValue);

    // пример: читать операции из Firestore
    const db = firebase.firestore();
    const snap = await db
      .collection('devices')
      .doc(deviceId)
      .collection('operations')
      .where('serviceId', '==', serviceId)
      .where('ts', '>=', start)
      .where('ts', '<=', end)
      .get();
  
    let totalRevenue = 0;
    let totalCount = 0;
    let totalDurationMin = 0;
  
    snap.forEach(doc => {
      const op = doc.data();
      totalRevenue += op.amount || 0;
      totalCount += 1;
      totalDurationMin += op.durationMin || 0;
    });
  
    const avgCheck = totalCount ? totalRevenue / totalCount : 0;
    const pricePerMinute = totalDurationMin ? totalRevenue / totalDurationMin : 0;
  
    return {
      totalRevenue,
      totalCount,
      avgCheck,
      pricePerMinute,
      periodLabel: periodValue,
    };
   }
  
  // ============================================================================
  // 6. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
  // ============================================================================
  
  /**
   * Маппинг типа услуги в человекочитаемый текст
   * ПЕРЕНЕСТИ ИЗ: basic.js → mapServiceTypeLabel()
   */
  function mapServiceTypeLabel(serviceType) {
    function mapServiceTypeLabel(serviceType) {
        switch (serviceType) {
          case 'WASHER_FLUID':
            return 'Стеклоомыватель';
          case 'VACUUM_CLEANER':
            return 'Пылесос';
          case 'TARGETED_DELIVERY':
            return 'Адресная выдача';
          default:
            return serviceType || '';
        }
      }
   }
  
// ============================================================================
// 7. РЕГИСТРАЦИЯ ГЛОБАЛЬНЫХ ФУНКЦИЙ ДЛЯ onclick
// ============================================================================

// Эти функции должны быть доступны из HTML через onclick
if (typeof window !== 'undefined') { // ⭐ Проверка на существование window
    window.savePricePosition = savePricePosition;
    window.deletePosition = deletePosition;
    window.switchSeason = switchSeason;
    window.showAddPositionModal = showAddPositionModal;
    window.closeAddPositionModal = closeAddPositionModal;
    window.confirmAddPosition = confirmAddPosition;
  }
  