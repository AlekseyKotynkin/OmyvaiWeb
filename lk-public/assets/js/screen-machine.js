// screen-machine.js - Главный экран "Аппараты"

import { 
    loadClientDevices, 
    loadDeviceSettings, 
    buildAddress,
    showLoadingIndicator,
    hideLoadingIndicator,
    showErrorMessage,
    getPeriodRange
  } from './basic.js';
  import { loadFullFleetStatus, formatLastPing } from './screen-status.js';
  
  // Глобальные переменные
  let mainMachines = [];
  let mainFilteredMachines = [];
  let mainPingByDeviceId = {};
  let mainMoneyData = {};
  let mainStockData = {};
  
  /**
   * 1. ИНИЦИАЛИЗАЦИЯ ЭКРАНА
   */
  export async function initMainScreen() {
    console.log('[Main] Initializing main screen...');
    
    try {
      showLoadingIndicator();
  
      const deviceIds = await loadClientDevices();
      await loadAllMainData(deviceIds);
      
      renderMainKPI();
      renderMainTable();
      setupMainFilters();
  
    } catch (e) {
      console.error('[Main] Failed to initialize main screen', e);
      showErrorMessage('Не удалось загрузить данные');
    } finally {
      hideLoadingIndicator();
    }
  }
  
/**
 * 2. ЗАГРУЗКА ВСЕХ ДАННЫХ
 */
async function loadAllMainData(deviceIds) {
    console.log('[Main] Loading data for', deviceIds.length, 'devices');
  
    // 2.1. Загружаем статус связи для всех устройств
    const fleet = await loadFullFleetStatus();
    mainPingByDeviceId = {};
    if (fleet && Array.isArray(fleet.devices)) {
      fleet.devices.forEach(d => {
        mainPingByDeviceId[d.deviceId] = {
          isOnline: d.isOnline,
          lastPing: d.lastPing,
          lastPingText: formatLastPing(d.lastPing),
          uptime7d: d.uptime7d,
          criticalIssues: d.criticalIssues || 0,
          warnings: d.warnings || 0,
        };
      });
    }
  
    // 2.2. Загружаем данные по деньгам (за 7 дней)
    await loadMainMoneyData(deviceIds, '7d');
  
    // 2.3. Загружаем данные по остаткам
    await loadMainStockData(deviceIds);
  
    // 2.4. Формируем общий список аппаратов
    const devicesData = [];
    for (const fullId of deviceIds) {
      const shortId = fullId.replace('@omyvai.ru', '');
      
      try {
        const settings = await loadDeviceSettings(shortId);
        if (!settings) continue;
  
        const location = settings.installation_address
          ? buildAddress(settings.installation_address)
          : '';
  
        const lat = settings.installation_address?.geo?.lat ?? null;
        const lng = settings.installation_address?.geo?.lng ?? null;
  
        // Получаем список модулей/услуг
        const modules = settings.modules || {};
        const modulesList = Array.isArray(modules) ? modules : Object.values(modules);
        const servicesCount = modulesList.length;
  
        // Данные по деньгам
        const money = mainMoneyData[shortId] || { income: 0, checks: 0, margin: 0 };
  
        // Данные по остаткам
        const stock = mainStockData[shortId] || { minPercent: 0, daysLeft: null, isCritical: false };
  
        // Статус связи
        const ping = mainPingByDeviceId[shortId];
        const isOnline = ping?.isOnline || false;
        const uptime7d = ping?.uptime7d || 0;
        const problems = (ping?.criticalIssues || 0) + (ping?.warnings || 0);
  
        devicesData.push({
          id: shortId,
          location,
          lat,
          lng,
          servicesCount,
          money: money.income,
          checks: money.checks,
          margin: money.margin,
          isOnline,
          uptime7d,
          problems,
          stock: stock.minPercent,
          forecast: stock.daysLeft,
          isCritical: stock.isCritical,
        });
      } catch (e) {
        console.error('[Main] Failed to load device', fullId, e);
      }
    }
  
    mainMachines = devicesData;
    mainFilteredMachines = [...mainMachines];
  
    console.log('[Main] Loaded', mainMachines.length, 'devices');
  }
  
/**
 * 3. ЗАГРУЗКА ДАННЫХ ПО ДЕНЬГАМ
 */
async function loadMainMoneyData(deviceIds, period) {
    console.log('[Main] Loading money data for period:', period);
    
    const { start, end } = getPeriodRange(period);
    const db = firebase.firestore();
  
    mainMoneyData = {};
  
    for (const fullId of deviceIds) {
      const shortId = fullId.replace('@omyvai.ru', '');
  
      try {
        // Загружаем операции expense для подсчёта дохода
        const expenseSnap = await db
          .collection('operation_expense')
          .where('machineId', '==', fullId)
          .where('startedAt', '>=', start)
          .where('startedAt', '<=', end)
          .get();
  
        let totalIncome = 0;
        let totalRevenue = 0;
        let totalChecks = 0;
  
        expenseSnap.forEach(doc => {
          const data = doc.data();
          const income = typeof data.income === 'number' ? data.income : parseFloat(data.income) || 0;
          const sum = typeof data.sum === 'number' ? data.sum : parseFloat(data.sum) || 0;
  
          totalIncome += income;
          totalRevenue += sum;
          totalChecks += 1;
        });
  
        mainMoneyData[shortId] = {
          income: totalIncome,
          revenue: totalRevenue,
          checks: totalChecks,
          margin: totalRevenue > 0 ? Math.round((totalIncome / totalRevenue) * 100) : 0,
        };
  
        console.log('[Main] Money data for', shortId, mainMoneyData[shortId]);
      } catch (e) {
        console.error('[Main] Failed to load money data for', shortId, e);
        mainMoneyData[shortId] = { income: 0, revenue: 0, checks: 0, margin: 0 };
      }
    }
  
    console.log('[Main] Money data loaded for', Object.keys(mainMoneyData).length, 'devices');
  } 
  
/**
 * 4. ЗАГРУЗКА ДАННЫХ ПО ОСТАТКАМ
 */
async function loadMainStockData(deviceIds) {
    console.log('[Main] Loading stock data...');
    
    const rtdb = firebase.database();
    mainStockData = {};
  
    for (const fullId of deviceIds) {
      const shortId = fullId.replace('@omyvai.ru', '');
  
      try {
        const stockSnap = await rtdb.ref(`devices_stock/${shortId}`).once('value');
        const stock = stockSnap.val();
  
        if (!stock) {
          mainStockData[shortId] = { minPercent: 0, daysLeft: null, isCritical: false };
          continue;
        }
  
        // Ищем минимальный процент заполнения среди всех баков
        let minPercent = 100;
        let minDaysLeft = Infinity;
        let hasValidData = false;
  
        Object.keys(stock).forEach(tankKey => {
          const tank = stock[tankKey];
          if (!tank || !tank.tank_item) return;
  
          // Извлекаем объём бака из tank_item (например, "TANK_PLASTERRA PT VL 150" -> 150)
          const tankItemStr = tank.tank_item || '';
          const volumeMatch = tankItemStr.match(/(\d+)\s*$/);
          const tankVolume = volumeMatch ? parseFloat(volumeMatch[1]) : 0;
          
          const currentQuantity = parseFloat(tank.tank_quantity) || 0;
  
          if (tankVolume > 0) {
            const percentFilled = (currentQuantity / tankVolume) * 100;
            minPercent = Math.min(minPercent, percentFilled);
            hasValidData = true;
          }
        });
  
        // Если нет валидных данных, ставим 0
        if (!hasValidData) {
          minPercent = 0;
        }
  
        mainStockData[shortId] = {
          minPercent: Math.round(minPercent),
          daysLeft: null, // Упрощённо, для точного прогноза нужен расчёт расхода
          isCritical: minPercent < 20,
        };
  
        console.log('[Main] Stock data for', shortId, mainStockData[shortId]);
      } catch (e) {
        console.error('[Main] Failed to load stock data for', shortId, e);
        mainStockData[shortId] = { minPercent: 0, daysLeft: null, isCritical: false };
      }
    }
  
    console.log('[Main] Stock data loaded for', Object.keys(mainStockData).length, 'devices');
  } 
  
/**
 * 5. РЕНДЕР KPI
 */
function renderMainKPI() {
    console.log('[Main] Rendering KPI...');
  
    // ========== БЛОК "ДЕНЬГИ" ==========
    const totalMoney = mainMachines.reduce((sum, m) => sum + m.money, 0);
    const totalChecks = mainMachines.reduce((sum, m) => sum + m.checks, 0);
    const totalMargin = mainMachines.length > 0 
      ? mainMachines.reduce((sum, m) => sum + m.margin, 0) / mainMachines.length 
      : 0;
  
    const todayMoneyEl = document.getElementById('today-money');
    const todayChecksEl = document.getElementById('today-checks');
    const weekMoneyEl = document.getElementById('week-money');
    const weekMarginEl = document.getElementById('week-margin');
    const monthMoneyEl = document.getElementById('month-money');
  
    if (todayMoneyEl) todayMoneyEl.textContent = `${totalMoney.toLocaleString('ru-RU')} ₽`;
    if (todayChecksEl) todayChecksEl.textContent = totalChecks;
    if (weekMoneyEl) weekMoneyEl.textContent = `${totalMoney.toLocaleString('ru-RU')} ₽`;
    if (weekMarginEl) weekMarginEl.textContent = Math.round(totalMargin);
    if (monthMoneyEl) monthMoneyEl.textContent = `${totalMoney.toLocaleString('ru-RU')} ₽`;
  
    // ========== БЛОК "СОСТОЯНИЕ" ==========
    const onlineCount = mainMachines.filter(m => m.isOnline).length;
    const offlineCount = mainMachines.filter(m => !m.isOnline).length;
    const totalCount = mainMachines.length;
    
    const avgUptime = mainMachines.length > 0
      ? mainMachines.reduce((sum, m) => sum + (m.uptime7d || 0), 0) / mainMachines.length
      : 0;
  
    const warningCount = mainMachines.filter(m => m.problems > 0).length;
  
    const onlineCountEl = document.getElementById('online-count');
    const totalCountEl = document.getElementById('total-count');
    const uptimeEl = document.getElementById('uptime');
    const offlineCountEl = document.getElementById('offline-count');
    const warningCountEl = document.getElementById('warning-count');
  
    if (onlineCountEl) onlineCountEl.textContent = onlineCount;
    if (totalCountEl) totalCountEl.textContent = totalCount;
    if (uptimeEl) uptimeEl.textContent = avgUptime.toFixed(1);
    if (offlineCountEl) offlineCountEl.textContent = offlineCount;
    if (warningCountEl) warningCountEl.textContent = warningCount;
  
    // ========== БЛОК "ОСТАТОК" ==========
    const avgStock = mainMachines.length > 0
      ? mainMachines.reduce((sum, m) => sum + m.stock, 0) / mainMachines.length
      : 0;
  
    const criticalCount = mainMachines.filter(m => m.isCritical).length;
    const refillCount = mainMachines.filter(m => m.stock < 50 && !m.isCritical).length;
  
    const avgStockEl = document.getElementById('avg-stock');
    const criticalCountEl = document.getElementById('critical-count');
    const refillCountEl = document.getElementById('refill-count');
  
    if (avgStockEl) avgStockEl.textContent = Math.round(avgStock);
    if (criticalCountEl) criticalCountEl.textContent = criticalCount;
    if (refillCountEl) refillCountEl.textContent = refillCount;
  
    console.log('[Main] KPI rendered:', {
      money: totalMoney,
      checks: totalChecks,
      online: onlineCount,
      total: totalCount,
      avgStock: avgStock.toFixed(1),
      critical: criticalCount,
    });
  }
  
/**
 * 6. РЕНДЕР ТАБЛИЦЫ
 */
function renderMainTable() {
    console.log('[Main] Rendering main table...');
    
    const tbody = document.getElementById('table-body');
    if (!tbody) {
      console.error('[Main] table-body not found');
      return;
    }
  
    const list = Array.isArray(mainFilteredMachines) ? mainFilteredMachines : [];
  
    tbody.innerHTML = '';
  
    if (list.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="16" style="text-align:center; padding:40px; color:var(--text-muted)">
            Нет данных по аппаратам
          </td>
        </tr>
      `;
      return;
    }
  
    const rowsHtml = list.map((device) => {
      const deviceId = device.id;
      const location = device.location || '';
      const lat = device.lat ?? null;
      const lng = device.lng ?? null;
  
      // Деньги
      const moneyColor = device.money > 0 ? '#10b981' : '#ef4444';
      const marginColor = device.margin > 50 ? '#10b981' : device.margin > 20 ? '#f97316' : '#ef4444';
  
      // Статус связи
      const statusText = device.isOnline ? 'Онлайн' : 'Офлайн';
      const statusColor = device.isOnline ? '#10b981' : '#ef4444';
  
      const ping = mainPingByDeviceId[deviceId];
      const lastPingText = ping?.lastPingText || '—';
  
      // Uptime
      const uptimeColor = device.uptime7d >= 98 ? '#10b981' : device.uptime7d >= 95 ? '#f97316' : '#ef4444';
  
      // Проблемы
      const problemsText = device.problems > 0 ? device.problems : '—';
      const problemsColor = device.problems > 0 ? '#ef4444' : 'var(--text-muted)';
  
      // Остатки
      const stockColor = device.isCritical ? '#ef4444' : device.stock < 50 ? '#f97316' : '#10b981';
      const forecastText = device.forecast !== null ? `${device.forecast} дн.` : '—';
  
      const safeLocation = location.replace(/'/g, "\\'");
  
      return `
        <tr>
          <!-- ID -->
          <td class="col-id">${deviceId}</td>
  
          <!-- Локация + кнопка карты -->
          <td class="col-location">
            <div class="location-cell">
              <span>${location}</span>
              ${
                lat != null && lng != null
                  ? `
                <button
                  class="map-btn"
                  title="Открыть на карте"
                  onclick="openMap(${lat}, ${lng}, '${safeLocation}')"
                ></button>
              `
                  : ''
              }
            </div>
          </td>
  
          <!-- Деньги: доход -->
          <td style="font-weight:600; color:${moneyColor}; font-size:11px;">
            ${device.money.toLocaleString('ru-RU')} ₽
          </td>
  
          <!-- Чеков -->
          <td style="font-size:11px; color:var(--text-muted)">
            ${device.checks}
          </td>
  
          <!-- Маржа -->
          <td style="font-weight:600; color:${marginColor}; font-size:11px;">
            ${device.margin}%
          </td>
  
          <!-- Кнопка "Подробнее" для денег -->
          <td>
            <span
              class="link-more"
              onclick="showMachineDetails('${deviceId}')"
            >
              Подробнее
            </span>
          </td>
  
          <!-- Услуг -->
          <td style="font-size:11px;">
            ${device.servicesCount}
          </td>
  
          <!-- Статус -->
          <td style="font-weight:600; color:${statusColor}; font-size:11px;">
            ${statusText}
          </td>
  
          <!-- Связь (последний пинг) -->
          <td style="font-size:11px; color:var(--text-muted)">
            ${lastPingText}
          </td>
  
          <!-- Uptime 7д -->
          <td style="font-weight:600; color:${uptimeColor}; font-size:11px;">
            ${device.uptime7d ? device.uptime7d.toFixed(1) : '0'}%
          </td>
  
          <!-- Проблемы -->
          <td style="font-weight:600; color:${problemsColor}; font-size:11px;">
            ${problemsText}
          </td>
  
          <!-- Кнопка "Подробнее" для состояния -->
          <td>
            <span
              class="link-more"
              onclick="showProblems('${deviceId}')"
            >
              Подробнее
            </span>
          </td>
  
          <!-- Остаток -->
          <td style="font-weight:600; color:${stockColor}; font-size:11px;">
            ${device.stock}%
          </td>
  
          <!-- Прогноз -->
          <td style="font-size:11px; color:var(--text-muted)">
            ${forecastText}
          </td>
  
          <!-- Кнопка "Подробнее" для остатков -->
          <td>
            <span
              class="link-more"
              onclick="showStockDetails('${deviceId}')"
            >
              Подробнее
            </span>
          </td>
  
          <!-- Настройки -->
          <td>
            <button 
              class="btn-small" 
              onclick="openSettings('${deviceId}')"
            >
              Настройки
            </button>
          </td>
        </tr>
      `;
    }).join('');
  
    tbody.innerHTML = rowsHtml;
  
    console.log('[Main] Table rendered with', list.length, 'devices');
}
  
/**
 * 7. НАСТРОЙКА ФИЛЬТРОВ
 */
/**
 * 7. НАСТРОЙКА ФИЛЬТРОВ
 */
function setupMainFilters() {
  const filterSelect = document.getElementById('filter-select');
  const searchInput = document.getElementById('search-input');
  const periodSelect = document.getElementById('period-select'); // ← ДОБАВЛЕНО

  console.log('[Main] setupMainFilters called'); // ← ЛОГ
  console.log('[Main] periodSelect found:', periodSelect); // ← ЛОГ

  if (filterSelect) {
      filterSelect.addEventListener('change', applyMainFilters);
      console.log('[Main] Filter listener added');
  }

  if (searchInput) {
      searchInput.addEventListener('input', applyMainFilters);
      console.log('[Main] Search listener added');
  }

  // ← ДОБАВЛЕНО: ОБРАБОТЧИК ПЕРИОДА
  if (periodSelect) {
      periodSelect.addEventListener('change', handlePeriodChange);
      console.log('[Main] Period listener added');
  } else {
      console.error('[Main] periodSelect NOT FOUND!');
  }
}

/**
* 9. ОБРАБОТКА ИЗМЕНЕНИЯ ПЕРИОДА
*/
async function handlePeriodChange(e) {
  const period = e.target.value;
  console.log('[Main] Period changed to:', period);

  try {
    showLoadingIndicator();

    // Получаем список устройств (он не меняется)
    const deviceIds = mainMachines.map(m => `${m.id}@omyvai.ru`);

    // Перезагружаем только данные по деньгам
    await loadMainMoneyData(deviceIds, period);

    // Обновляем объекты устройств с новыми данными
    mainMachines.forEach(device => {
      const money = mainMoneyData[device.id] || { income: 0, checks: 0, margin: 0 };
      device.money = money.income;
      device.checks = money.checks;
      device.margin = money.margin;
    });

    // Обновляем фильтрованный список
    mainFilteredMachines = [...mainMachines];

    // Перерисовываем KPI и таблицу
    renderMainKPI();
    renderMainTable();

    console.log('[Main] Data reloaded for period:', period);
  } catch (e) {
    console.error('[Main] Failed to reload data for period:', period, e);
    showErrorMessage('Не удалось загрузить данные за выбранный период');
  } finally {
    hideLoadingIndicator();
  }
}
 
/**
 * 8. ПРИМЕНЕНИЕ ФИЛЬТРОВ
 */
function applyMainFilters() {
    console.log('[Main] Applying filters...');
    
    const filterSelect = document.getElementById('filter-select');
    const searchInput = document.getElementById('search-input');
  
    const filterValue = filterSelect ? filterSelect.value : 'all';
    const searchTerm = (searchInput ? searchInput.value : '').toLowerCase().trim();
  
    mainFilteredMachines = mainMachines.filter(device => {
      // Поиск по ID или локации
      const matchesSearch = 
        device.id.toLowerCase().includes(searchTerm) ||
        (device.location || '').toLowerCase().includes(searchTerm);
  
      if (!matchesSearch) return false;
  
      // Фильтры
      switch (filterValue) {
        case 'all':
          return true;
          
        case 'problems':
          // Показываем аппараты с проблемами (офлайн или есть предупреждения)
          return !device.isOnline || device.problems > 0;
          
        case 'offline':
          // Только офлайн
          return !device.isOnline;
          
        case 'low-stock':
          // Низкий остаток (< 50%)
          return device.stock < 50;
          
        default:
          return true;
      }
    });
  
    console.log('[Main] Filtered:', mainFilteredMachines.length, 'of', mainMachines.length, 'devices');
    
    renderMainTable();
  }
  
  