import { loadClientDevices, getPeriodRange, buildAddress, loadDeviceSettings  } from './basic.js';
import { formatLastPing, loadFullFleetStatus } from './screen-status.js';

const STOCK_SERVICES = ['WASHER_FLUID', 'VACUUM_CLEANER', 'TARGETED_DELIVERY'];

let stockDevices = [];
let stockFilteredDevices = [];
let pingByDeviceId = {};
let serviceDates = {};

let stockSummary = {
  WASHER_FLUID: {
    devicesWithService: 1,
    criticalNow: 1,
    criticalDiff: 0,
    needRefillNow: 1,
    needRefillDiff: 0,
    refillOpsNow: 12,
    refillOpsDiff: 0,
  },
  VACUUM_CLEANER: {
    devicesWithService: 1,
    criticalNow: 1,
    criticalDiff: 0,
    needRefillNow: 1,
    needRefillDiff: 0,
    refillOpsNow: 12,
    refillOpsDiff: 0,
  },
  TARGETED_DELIVERY: {
    devicesWithService: 1,
    criticalNow: 1,
    criticalDiff: 0,
    needRefillNow: 1,
    needRefillDiff: 0,
    refillOpsNow: 12,
    refillOpsDiff: 0,
  },
};

export async function reloadStockData(period = '7d') {
  try {
    const deviceIds = await loadClientDevices();
    const { start, end } = getPeriodRange(period);

    // 1. Подсчитываем, сколько устройств с каждой услугой
    const servicesCount = await countDevicesPerService(deviceIds);

    const perServiceNow = {
      WASHER_FLUID: { critical: 0, needRefill: 0 },
      VACUUM_CLEANER: { critical: 0, needRefill: 0 },
      TARGETED_DELIVERY: { critical: 0, needRefill: 0 },
    };

    const perServicePrev = {
      WASHER_FLUID: { critical: 0, needRefill: 0 },
      VACUUM_CLEANER: { critical: 0, needRefill: 0 },
      TARGETED_DELIVERY: { critical: 0, needRefill: 0 },
    };

    const refillNow = {
      WASHER_FLUID: 0,
      VACUUM_CLEANER: 0,
      TARGETED_DELIVERY: 0,
    };

    const refillPrev = {
      WASHER_FLUID: 0,
      VACUUM_CLEANER: 0,
      TARGETED_DELIVERY: 0,
    };

    // сюда собираем данные для таблицы
    const devicesStock = [];

    // 2. Обходим устройства для подсчёта критических состояний и операций
    for (const fullId of deviceIds) {
      const deviceStockInfo = await collectDeviceStockState(
        fullId,
        perServiceNow,
        perServicePrev
      );
      await collectDeviceRefillOps(fullId, start, end, refillNow, refillPrev);

      if (deviceStockInfo) {
        devicesStock.push(deviceStockInfo);
      }
    }

    // 3. Заполняем stockSummary с правильным devicesWithService
    STOCK_SERVICES.forEach(service => {
      const now = perServiceNow[service];
      const prev = perServicePrev[service];

      stockSummary[service].criticalNow = now.critical;
      stockSummary[service].criticalDiff = now.critical - prev.critical;

      stockSummary[service].needRefillNow = now.needRefill;
      stockSummary[service].needRefillDiff = now.needRefill - prev.needRefill;

      stockSummary[service].refillOpsNow = refillNow[service];
      stockSummary[service].refillOpsDiff = refillNow[service] - refillPrev[service];

      stockSummary[service].devicesWithService = servicesCount[service] || 0;
    });

    renderStockKPI();

    // 4. Возвращаем массив устройств для таблицы «Аппараты»
    return devicesStock;
  } catch (e) {
    console.error('Stock reload failed', e);
    return [];
  }
}

async function collectDeviceStockState(deviceId, perServiceNow, perServicePrev) {
  console.log('[Stock] collectDeviceStockState START', deviceId);

  try {
    const shortDeviceId = deviceId.replace('@omyvai.ru', '');
    const rtdb = firebase.database();
    const db = firebase.firestore();

    // 1. Читаем настройки
    const settingsSnap = await rtdb.ref(`devices_setting/${shortDeviceId}`).once('value');
    const settings = settingsSnap.val();
    if (!settings) {
      console.warn('[Stock] Нет настроек устройства', deviceId);
      return null;
    }

    const modules = settings.modules || {};
    const modulesList = Array.isArray(modules) ? modules : Object.values(modules);

    // Проверяем наличие каждого сервиса
    const hasWasher = modulesList.some(m => {
      if (!m || !m.service_name) return false;
      let serviceName = String(m.service_name).toUpperCase();
      if (serviceName === 'WASHERFLUID') serviceName = 'WASHER_FLUID';
      return serviceName === 'WASHER_FLUID';
    });

    const hasVacuum = modulesList.some(m => {
      if (!m || !m.service_name) return false;
      let serviceName = String(m.service_name).toUpperCase();
      return serviceName === 'VACUUM_CLEANER';
    });

    const hasDelivery = modulesList.some(m => {
      if (!m || !m.service_name) return false;
      let serviceName = String(m.service_name).toUpperCase();
      if (serviceName === 'TARGETEDDELIVERY') serviceName = 'TARGETED_DELIVERY';
      return serviceName === 'TARGETED_DELIVERY';
    });

    // 2. Читаем остатки баков для стеклоомывателя
    let deviceIsCritical = false;
    let deviceNeedsRefill = false;
    let minDaysLeft = Infinity;
    const tanksInfo = [];

    if (hasWasher) {
      const stockSnap = await rtdb.ref(`devices_stock/${shortDeviceId}`).once('value');
      const stock = stockSnap.val();

      if (stock) {
        // 3. Читаем расход за последние сутки для каждого бака
        const oneDayAgo = new Date();
        oneDayAgo.setDate(oneDayAgo.getDate() - 1);

        const consumptionByTank = {}; // { tank_1: litersPerDay, ... }

        for (const tankKey of Object.keys(stock)) {
          const tank = stock[tankKey];
          if (!tank || !tank.tank_item) continue;

          const pointId = `washer_fluid_${tankKey}_pump`;
          try {
            const expenseSnap = await db
              .collection('maintenance_expense')
              .doc(shortDeviceId)
              .collection(pointId)
              .where('timestamp', '>=', oneDayAgo)
              .get();

            let totalConsumption = 0;
            expenseSnap.forEach(doc => {
              const data = doc.data();
              const quantity = data.duration || data.quantity || 0;
              totalConsumption += quantity;
            });

            consumptionByTank[tankKey] = totalConsumption;
            console.log('[Stock]', deviceId, tankKey, 'расход за сутки:', totalConsumption);
          } catch (e) {
            console.error('[Stock] Ошибка чтения расхода', deviceId, pointId, e);
          }
        }

        // 4. Считаем прогноз по бакам
        Object.keys(stock).forEach(tankKey => {
          const tank = stock[tankKey];
          if (!tank || !tank.tank_item) return;

          // Извлекаем объём бака из tank_item (например, "TANK_PLASTERRA PT VL 150" -> 150)
          const tankItemStr = tank.tank_item || '';
          const volumeMatch = tankItemStr.match(/(\d+)\s*$/); // последнее число в строке
          const tankVolume = volumeMatch ? parseFloat(volumeMatch[1]) : 0;
          
          // Берём текущее количество и название жидкости из devices_stock
          const currentQuantity = parseFloat(tank.tank_quantity) || 0;
          const liquidName = tank.tank_name || 'Жидкость';
          
          const dailyConsumption = consumptionByTank[tankKey] || 0;

          let daysLeft = null;
          let percentFilled = tankVolume > 0 ? (currentQuantity / tankVolume) * 100 : 0;

          if (dailyConsumption > 0) {
            daysLeft = currentQuantity / dailyConsumption;
            minDaysLeft = Math.min(minDaysLeft, daysLeft);

            if (daysLeft <= 3) deviceIsCritical = true;
            if (daysLeft <= 7) deviceNeedsRefill = true;
          }

          tanksInfo.push({
            tankKey,
            liquidName,           // Название жидкости из devices_stock/tank_name
            currentQuantity,
            tankVolume,           // Извлечено из tank_item
            percentFilled,
            dailyConsumption,
            daysLeft,
          });

          console.log(
            '[Stock]',
            deviceId,
            tankKey,
            'liquid',
            liquidName,
            'item',
            tankItemStr,
            'volume',
            tankVolume,
            'quantity',
            currentQuantity,
            'percent',
            percentFilled.toFixed(1),
            'daily',
            dailyConsumption,
            'days',
            daysLeft ? daysLeft.toFixed(1) : 'N/A'
          );
        });
      }
    }

    // Обновляем агрегаты по услуге
    if (deviceIsCritical) {
      perServiceNow.WASHER_FLUID.critical += 1;
    }
    if (deviceNeedsRefill) {
      perServiceNow.WASHER_FLUID.needRefill += 1;
    }

    console.log('[Stock] collectDeviceStockState DONE', deviceId, {
      hasWasher,
      hasVacuum,
      hasDelivery,
      tanksCount: tanksInfo.length,
    });

    // 3. Адрес и координаты
    const location = settings.installation_address
      ? buildAddress(settings.installation_address)
      : '';

    const lat = settings.installation_address?.geo?.lat ?? null;
    const lng = settings.installation_address?.geo?.lng ?? null;

    // 4. Возвращаем объект для таблицы
    return {
      id: shortDeviceId,
      location,
      lat,
      lng,
      deviceIsCritical,
      deviceNeedsRefill,
      minDaysLeft: isFinite(minDaysLeft) ? minDaysLeft : null,
      
      hasVacuum,
      hasDelivery,
      
      washer: {
        tanks: tanksInfo,
      },
    };
  } catch (e) {
    console.error('[Stock] collectDeviceStockState ERROR', deviceId, e);
    return null;
  }
}

async function collectDeviceRefillOps(deviceId, start, end, refillNow, refillPrev) {
  try {
    const db = firebase.firestore();

    // Запрашиваем операции arrival для устройства в периоде
    const arrivalSnap = await db
      .collection('operation_arrival')
      .where('machineId', '==', deviceId)
      .where('startedAt', '>=', start)
      .where('startedAt', '<=', end)
      .get();

    // Группируем по serviceType и считаем уникальные устройства
    const servicesWithRefill = new Set();

    arrivalSnap.forEach(doc => {
      const data = doc.data();
      const serviceType = data.serviceType; // "WASHER_FLUID", "VACUUM_CLEANER", "TARGETED_DELIVERY"
      
      if (serviceType) {
        servicesWithRefill.add(serviceType);
      }
    });

    // Для каждого сервиса, который был дозаправлен, увеличиваем счётчик устройств
    servicesWithRefill.forEach(serviceType => {
      if (refillNow[serviceType] !== undefined) {
        refillNow[serviceType] += 1; // +1 устройство дозаправлено
      }
    });

    console.log('[Stock] collectDeviceRefillOps', deviceId, 'servicesWithRefill:', Array.from(servicesWithRefill));

  } catch (e) {
    console.error('[Stock] Ошибка при подсчёте операций для', deviceId, e);
  }
}

/**
 * Подсчитывает количество устройств с каждой услугой
 * @param {Array<string>} deviceIds - массив ID устройств (например, ["ven00001omyvai.ru"])
 * @returns {Promise<Object>} - объект вида { WASHER_FLUID: 2, VACUUM_CLEANER: 1, ... }
 */
async function countDevicesPerService(deviceIds) {
  console.log('[Stock] countDevicesPerService для', deviceIds.length, 'устройств');
  
  const servicesCount = {
    WASHER_FLUID: 0,
    VACUUM_CLEANER: 0,
    TARGETED_DELIVERY: 0,
  };

  const rtdb = firebase.database();

  for (const deviceId of deviceIds) {
    try {
      // убираем "@omyvai.ru" для получения короткого ID
      const shortDeviceId = deviceId.replace('@omyvai.ru', '');
      
      // читаем modules из devices_setting/<shortId>/modules
      const modulesRef = rtdb.ref(`devices_setting/${shortDeviceId}/modules`);
      const snapshot = await modulesRef.once('value');
      const modules = snapshot.val();

      if (!modules) {
        console.warn('[Stock] Нет modules для устройства', deviceId);
        continue;
      }

      // modules может быть массивом или объектом с числовыми ключами
      const modulesList = Array.isArray(modules) 
        ? modules 
        : Object.values(modules);

      modulesList.forEach(module => {
        if (!module || !module.service_name) return;

        const serviceName = module.service_name; // "WASHER_FLUID", "VACUUM_CLEANER", "TARGETED_DELIVERY"

        // приводим к единому формату (snake_case → UPPER_CASE)
        let normalized = serviceName;
        if (serviceName === 'TARGETED_DELIVERY') {
          normalized = 'TARGETED_DELIVERY';
        }

        if (servicesCount[normalized] !== undefined) {
          servicesCount[normalized] += 1;
        } else {
          console.warn('[Stock] Неизвестная услуга', serviceName, 'в устройстве', deviceId);
        }
      });
    } catch (e) {
      console.error('[Stock] Ошибка загрузки modules для', deviceId, e);
    }
  }

  console.log('[Stock] Подсчёт услуг:', servicesCount);
  return servicesCount;
}  

export function renderStockKPI() {
    renderServiceCard('WASHER_FLUID', 'washer');
    renderServiceCard('VACUUM_CLEANER', 'vacuum');
    renderServiceCard('TARGETED_DELIVERY', 'delivery');
}
  
function renderServiceCard(serviceId, category) {
  const card = document.querySelector(`.kpi-card[data-category="${category}"]`);
  if (!card) {
    console.warn('[Stock] Карточка не найдена:', category);
    return;
  }

  const data  = stockSummary[serviceId];
  if (!data) {
    console.warn('[Stock] Нет данных для сервиса:', serviceId);
    return;
  }

  const total = data.devicesWithService || 0;
  const makeLabel = (count) => `${count} из ${total}`;

  // Получаем все блоки .kpi-metric внутри карточки
  const metrics = card.querySelectorAll('.kpi-metric');
  
  if (metrics.length < 3) {
    console.warn('[Stock] Недостаточно .kpi-metric в карточке', category, 'найдено:', metrics.length);
    return;
  }

  // 1) Критично низкий
  const critValue = metrics[0].querySelector('.kpi-metric-value');
  if (critValue) {
    critValue.textContent = makeLabel(data.criticalNow);
  }

  // 2) Требуют дозаправки
  const needValue = metrics[1].querySelector('.kpi-metric-value');
  if (needValue) {
    needValue.textContent = makeLabel(data.needRefillNow);
  }

  // 3) Дозаправлено (7 дней)
  const opsValue = metrics[2].querySelector('.kpi-metric-value');
  if (opsValue) {
    opsValue.textContent = makeLabel(data.refillOpsNow);
  }

  console.log('[Stock] Отрендерена карточка', category, ':', {
    critical: makeLabel(data.criticalNow),
    needRefill: makeLabel(data.needRefillNow),
    refillOps: makeLabel(data.refillOpsNow)
  });
}

// вспомогательная функция для загрузки дат последнего обслуживания
async function loadServiceDatesForFleet(stockIds) {
  const result = {};

  for (const stockId of stockIds) {
    try {
      // stockId уже 'ven_00001' — используем его как есть
      const settings = await loadDeviceSettings(stockId);
      if (settings && settings.last_service) {
        result[stockId] = settings.last_service;
      }
    } catch (e) {
      console.error('Failed to load last service for', stockId, e);
    }
  }

  return result;
}

// helper: из fleet ID -> stock ID
function toStockIdFromFleetId(fleetId) {
  // 'ven00001' -> 'ven_00001@omyvai.ru'
  // если формат другой — подправь здесь
  const match = fleetId.match(/^ven(\d{5})$/);
  if (match) {
    return `ven_${match[1]}@omyvai.ru`;
  }
  // fallback: если уже в нужном формате — вернём как есть
  return fleetId;
}


export async function initStockScreen() {
  const periodSelect = document.getElementById('stock-period');
  const filterSelect = document.getElementById('stock-filter-select');
  const searchInput = document.getElementById('stock-search-input');

  const initialPeriod = periodSelect ? periodSelect.value : '7d';

  // 1. первичная загрузка остатков
  const initialDevices = await reloadStockData(initialPeriod);
  stockDevices = initialDevices || [];
  stockFilteredDevices = [...stockDevices];

  // 2. загрузка последних пингов (как на экране "Состояние")
  try {
    const fleet = await loadFullFleetStatus();
    pingByDeviceId = {};
    if (fleet && Array.isArray(fleet.devices)) {
      fleet.devices.forEach(d => {
        // d.deviceId = 'ven_00001'
        // d.isOnline = true/false
        // d.lastPing = timestamp
        pingByDeviceId[d.deviceId] = {
          isOnline: d.isOnline,
          lastPing: d.lastPing,
          lastPingText: formatLastPing(d.lastPing),
        };
      });
    }
  } catch (e) {
    console.error('Failed to load fleet status for stock screen', e);
    pingByDeviceId = {};
  }

// 3. загрузка дат последнего обслуживания
  try {
    const deviceIds = stockDevices.map(d => d.id);
    serviceDates = await loadServiceDatesForFleet(deviceIds);
  } catch (e) {
    console.error('Failed to load service dates for stock screen', e);
    serviceDates = {};
  }

  // 4. первый рендер таблицы с учетом новых полей
  renderStockDevicesTable();

  // 5. обработчики смены периода/фильтров/поиска

  if (periodSelect) {
    periodSelect.addEventListener('change', async (e) => {
      const period = e.target.value;

      // перезагружаем остатки
      const devices = await reloadStockData(period);
      stockDevices = devices || [];

      // после смены периода стоит обновить даты обслуживания для нового набора устройств
      try {
        const deviceIds = stockDevices.map(d => d.id);
        serviceDates = await loadServiceDatesForFleet(deviceIds);
      } catch (err) {
        console.error('Failed to reload service dates after period change', err);
        serviceDates = {};
      }

      // пинги можно не перезагружать каждый раз, но при желании можно повторить loadFullFleetStatus()
      // здесь достаточно пересчитать фильтры и перерисовать
      applyStockFilters();
    });
  }

  if (filterSelect) {
    filterSelect.addEventListener('change', applyStockFilters);
  }

  if (searchInput) {
    searchInput.addEventListener('input', applyStockFilters);
  }
}

function applyStockFilters() {
  const filterSelect = document.getElementById('stock-filter-select');
  const searchInput = document.getElementById('stock-search-input');

  const filter = filterSelect ? filterSelect.value : 'all';
  const search = (searchInput ? searchInput.value : '').toLowerCase();

  stockFilteredDevices = stockDevices.filter(dev => {
    const matchesSearch =
      dev.id.toLowerCase().includes(search) ||
      (dev.location || '').toLowerCase().includes(search);

    if (!matchesSearch) return false;

    const days = dev.minDaysLeft ?? Infinity;

    switch (filter) {
      case 'critical':
        return dev.deviceIsCritical;
      case 'low':
        return dev.deviceNeedsRefill;
      case 'today':
        return days <= 1;
      case 'tomorrow':
        return days > 1 && days <= 2;
      default:
        return true;
    }
  });

  renderStockDevicesTable();
}

/**
 * Рендер таблицы "Остатки по аппаратам"
 */
export function renderStockDevicesTable() {
  const tbody = document.getElementById('stock-devices-body');
  if (!tbody) return;

  const list = Array.isArray(stockFilteredDevices)
    ? stockFilteredDevices
    : Array.isArray(stockDevices)
      ? stockDevices
      : [];

  tbody.innerHTML = '';

  if (list.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="11" style="text-align:center; padding:40px; color:var(--text-muted)">
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

    // Статус связи и последний пинг
    const ping = pingByDeviceId[deviceId];
    const isOnline = ping && ping.isOnline;
    const statusText = isOnline ? 'Онлайн' : 'Офлайн';
    const statusColor = isOnline ? '#10b981' : '#ef4444';

    const lastPingText = ping && ping.lastPingText ? ping.lastPingText : '—';

    // Последнее обслуживание
    const lastServiceRaw = serviceDates[deviceId] || null;
    const lastServiceDisplay = lastServiceRaw || '—';

    // Баки стеклоомывателя - разделяем на два столбца
    let tank1Display = '—';
    let tank2Display = '—';
    
    if (device.washer && device.washer.tanks && device.washer.tanks.length > 0) {
      // Бак 1
      if (device.washer.tanks[0]) {
        const tank = device.washer.tanks[0];
        const liquidName = tank.liquidName || 'Жидкость';
        const percent = tank.percentFilled ? tank.percentFilled.toFixed(0) : '0';
        const quantity = tank.currentQuantity ? tank.currentQuantity.toFixed(1) : '0';
        const volume = tank.tankVolume ? tank.tankVolume.toFixed(1) : '0';
        const days = tank.daysLeft !== null ? tank.daysLeft.toFixed(0) : '—';
        
        const percentColor = tank.percentFilled < 20 ? '#ef4444' : tank.percentFilled < 50 ? '#f97316' : '#10b981';
        
        tank1Display = `
          <div style="font-size: 11px;">
            <div style="font-weight: 600; margin-bottom: 2px;">${liquidName}</div>
            <span style="color: ${percentColor}; font-weight: 600;">${percent}%</span> 
            (${quantity}/${volume} л)<br>
            <span style="color: var(--text-muted);">${days} дн.</span>
          </div>
        `;
      }
      
      // Бак 2
      if (device.washer.tanks[1]) {
        const tank = device.washer.tanks[1];
        const liquidName = tank.liquidName || 'Жидкость';
        const percent = tank.percentFilled ? tank.percentFilled.toFixed(0) : '0';
        const quantity = tank.currentQuantity ? tank.currentQuantity.toFixed(1) : '0';
        const volume = tank.tankVolume ? tank.tankVolume.toFixed(1) : '0';
        const days = tank.daysLeft !== null ? tank.daysLeft.toFixed(0) : '—';
        
        const percentColor = tank.percentFilled < 20 ? '#ef4444' : tank.percentFilled < 50 ? '#f97316' : '#10b981';
        
        tank2Display = `
          <div style="font-size: 11px;">
            <div style="font-weight: 600; margin-bottom: 2px;">${liquidName}</div>
            <span style="color: ${percentColor}; font-weight: 600;">${percent}%</span> 
            (${quantity}/${volume} л)<br>
            <span style="color: var(--text-muted);">${days} дн.</span>
          </div>
        `;
      }
    }

    // Пылесос и адресная выдача
    const vacuumDisplay = device.hasVacuum ? 'Активен' : '—';
    const deliveryDisplay = device.hasDelivery ? 'Активен' : '—';

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

        <!-- Статус связи -->
        <td style="font-weight:600; color:${statusColor}">
          ${statusText}
        </td>

        <!-- Последний пинг -->
        <td style="font-size:11px; color:var(--text-muted)">
          ${lastPingText}
        </td>

        <!-- Последнее обслуживание -->
        <td style="font-size:11px; color:var(--text-muted)">
          ${lastServiceDisplay}
        </td>

        <!-- Бак 1 -->
        <td style="font-size:11px; line-height: 1.4;">
          ${tank1Display}
        </td>

        <!-- Бак 2 -->
        <td style="font-size:11px; line-height: 1.4;">
          ${tank2Display}
        </td>

        <!-- Пылесос -->
        <td style="font-size:11px; color:var(--text-muted)">
          ${vacuumDisplay}
        </td>

        <!-- Адресная выдача -->
        <td style="font-size:11px; color:var(--text-muted)">
          ${deliveryDisplay}
        </td>

        <!-- Кнопка перехода в карточку аппарата -->
        <td>
          <span
            class="link-more"
            onclick="showStockDetails('${deviceId}')"
          >
            Подробнее
          </span>
        </td>
      </tr>
    `;
  }).join('');

  tbody.innerHTML = rowsHtml;
}
