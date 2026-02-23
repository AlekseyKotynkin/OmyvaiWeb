// assets/js/screen-stock-device.js

const SERVICE_IDS = {
    WASHER: 'WASHER_FLUID',
    VACUUM: 'VACUUM_CLEANER',
    DELIVERY: 'TARGETED_DELIVERY',
}; 

/**
 * Инициализация экрана "Управление остатками" для конкретного автомата
 * Вызывать после того, как в main вставлен renderMachineStockScreen(machine)
 */
export async function initStockDeviceScreen(deviceId) {
    try {
      console.log('[StockDevice] initStockDeviceScreen', deviceId);
  
      const modulesByService = await loadDeviceModulesByService(deviceId);
      const container = document.getElementById('stock-service-sections');
  
      if (!container) {
        console.warn('[StockDevice] #stock-service-sections not found');
        return;
      }
  
      const parts = [];
  
      // Блок стеклоомывателя
      if (modulesByService[SERVICE_IDS.WASHER]) {
        const tanksData = await loadTanksData(deviceId);
        const kpiData = calculateWasherKPI(tanksData);
        
        parts.push(renderWasherTanksSection(tanksData, deviceId));
      }
  
      // Блок пылесоса
      if (modulesByService[SERVICE_IDS.VACUUM]) {
        parts.push(renderVacuumSection());
      }
  
      // Блок адресной выдачи
      if (modulesByService[SERVICE_IDS.DELIVERY]) {

        parts.push(renderDeliverySection());
      }
  
      // Отображение результата
      if (parts.length === 0) {
        container.innerHTML = `
          <div style="padding: 40px; text-align: center; color: var(--text-muted);">
            Для этого автомата не настроены сервисные модули (омыватель, пылесос, адресная выдача).
          </div>
        `;
      } else {
        container.innerHTML = parts.join('\n');
      }

      initTankButtons();
    } catch (e) {
      console.error('[StockDevice] Failed to init stock screen', e);
    }
  }
  
/**
 * Чтение devices_setting/{shortDeviceId}/modules и построение словаря по servicename
 */
async function loadDeviceModulesByService(deviceId) {
    const rtdb = firebase.database();
  
    const shortDeviceId = deviceId.replace('omyvai.ru', '');
    const modulesRef = rtdb.ref(`devices_setting/${shortDeviceId}/modules`);
  
    console.log('[StockDevice] Loading modules for', shortDeviceId);
    const snapshot = await modulesRef.once('value');
    const rawModules = snapshot.val();
  
    console.log('[StockDevice] rawModules', rawModules);
  
    if (!rawModules) {
      console.warn('[StockDevice] No modules for device', deviceId);
      return {};
    }
  
    const modulesList = Array.isArray(rawModules)
      ? rawModules
      : Object.values(rawModules);
  
    const modulesByService = {};
    modulesList.forEach((m, idx) => {
      if (!m) return;
  
      console.log('[StockDevice] module', idx, m);
  
      // ВАЖНО: у тебя поле service_name
      const serviceName = m.service_name;
  
      if (!serviceName) {
        console.warn('[StockDevice] module without service name', m);
        return;
      }
  
      modulesByService[serviceName] = m;
    });
  
    console.log('[StockDevice] modulesByService', modulesByService);
    return modulesByService;
}  

async function loadTankFromRTDB(deviceId, tankId) {
  const rtdb = firebase.database();
  const stockRef = rtdb.ref(`devices_stock/${deviceId}/${tankId}`);
  const snapshot = await stockRef.once('value');
  return snapshot.val() || null;
}

async function updateTankInRTDB(deviceId, tankId, updates) {
  const rtdb = firebase.database();
  const stockRef = rtdb.ref(`devices_stock/${deviceId}/${tankId}`);
  await stockRef.update(updates);
}

function renderWasherTanksSection(tanksData, deviceId) {
  if (!tanksData || tanksData.length === 0) {
    return `
      <section class="tanks-section">
        <div class="section-title">Ёмкости стеклоомывателя</div>
        <div style="padding: 20px; text-align: center; color: var(--text-muted);">
          Нет данных о ёмкостях
        </div>
      </section>
    `;
  }
  
  const tanksHtml = tanksData.map(tank => renderTankCard(tank, deviceId)).join('');
  
  return `
    <section class="tanks-section">
      <div class="section-title">Ёмкости стеклоомывателя</div>
      <div class="tanks-grid">
        ${tanksHtml}
      </div>
    </section>
  `;
}

function renderVacuumSection() {
    return `
      <section class="vacuum-section">
        <div class="section-title">Пылесос — расходные материалы</div>
        
        <div class="vacuum-grid">
          
          <!-- Карточка общего состояния -->
          <div class="vacuum-card vacuum-summary">
            <div class="vacuum-card-title">Общее состояние</div>
            
            <div class="vacuum-metric">
              <div class="vacuum-label">Моточасы осталось:</div>
              <div class="vacuum-value" style="color: #22c55e; font-size: 18px;">180 ч</div>
            </div>
  
            <div class="vacuum-progress-bar">
              <div class="vacuum-progress-fill" style="width: 75%; background: #22c55e;"></div>
            </div>
            <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">75 % ресурса</div>
  
            <div class="vacuum-metric">
              <div class="vacuum-label">Прогноз замены:</div>
              <div class="vacuum-value">≈ 6 дней</div>
              <div style="font-size: 10px; color: var(--text-muted);">Расход: 30 ч/день</div>
            </div>
  
            <div class="vacuum-metric">
              <div class="vacuum-label">Последнее обслуживание:</div>
              <div class="vacuum-value">15.12.2025</div>
              <div style="font-size: 10px; color: var(--text-muted);">14 дней назад</div>
            </div>
          </div>
  
          <!-- Фильтр HEPA -->
          <div class="vacuum-card">
            <div class="vacuum-card-title">Фильтр HEPA</div>
            
            <div class="vacuum-metric">
              <div class="vacuum-label">Состояние:</div>
              <div class="vacuum-value" style="color: #22c55e;">Хорошее</div>
            </div>
  
            <div class="vacuum-metric">
              <div class="vacuum-label">Моточасы:</div>
              <div class="vacuum-value">420 ч / 600 ч</div>
            </div>
  
            <div class="vacuum-progress-bar">
              <div class="vacuum-progress-fill" style="width: 70%; background: #22c55e;"></div>
            </div>
            <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">70 % ресурса</div>
  
            <div class="vacuum-metric">
              <div class="vacuum-label">До замены:</div>
              <div class="vacuum-value">≈ 180 ч (6 дней)</div>
            </div>
  
            <button class="btn-replace" onclick="replaceComponent('hepa')">Зафиксировать замену</button>
          </div>
  
          <!-- Мешок/контейнер -->
          <div class="vacuum-card">
            <div class="vacuum-card-title">Мешок для мусора</div>
            
            <div class="vacuum-metric">
              <div class="vacuum-label">Состояние:</div>
              <div class="vacuum-value" style="color: #f97316;">Требует замены</div>
            </div>
  
            <div class="vacuum-metric">
              <div class="vacuum-label">Заполнен:</div>
              <div class="vacuum-value" style="color: #f97316;">85 %</div>
            </div>
  
            <div class="vacuum-progress-bar">
              <div class="vacuum-progress-fill" style="width: 85%; background: #f97316;"></div>
            </div>
            <div style="font-size: 11px; color: #f97316; margin-top: 4px;">Рекомендуется замена</div>
  
            <div class="vacuum-metric">
              <div class="vacuum-label">Моточасы с замены:</div>
              <div class="vacuum-value">145 ч</div>
            </div>
  
            <button class="btn-replace" onclick="replaceComponent('bag')">Зафиксировать замену</button>
          </div>
  
          <!-- Щётка -->
          <div class="vacuum-card">
            <div class="vacuum-card-title">Щётка</div>
            
            <div class="vacuum-metric">
              <div class="vacuum-label">Состояние:</div>
              <div class="vacuum-value" style="color: #22c55e;">Хорошее</div>
            </div>
  
            <div class="vacuum-metric">
              <div class="vacuum-label">Моточасы:</div>
              <div class="vacuum-value">280 ч / 400 ч</div>
            </div>
  
            <div class="vacuum-progress-bar">
              <div class="vacuum-progress-fill" style="width: 70%; background: #22c55e;"></div>
            </div>
            <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">70 % ресурса</div>
  
            <div class="vacuum-metric">
              <div class="vacuum-label">До замены:</div>
              <div class="vacuum-value">≈ 120 ч (4 дня)</div>
            </div>
  
            <button class="btn-replace" onclick="replaceComponent('brush')">Зафиксировать замену</button>
          </div>
  
        </div>
      </section>
    `;
  }
  
  function renderDeliverySection() {
    return `
      <section class="delivery-section">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <div class="section-title" style="margin-bottom: 0;">Адресная выдача</div>
          <div style="font-size: 11px; color: var(--text-muted);">
            <span style="font-weight: 600; color: var(--text);">Ячеек: 30</span> · 
            Занято: <span style="color: #f97316;">18</span> · 
            Пусто: <span style="color: #22c55e;">12</span>
          </div>
        </div>
  
        <!-- Сетка ячеек -->
        <div class="cells-grid">
          <!-- Ячейка 1: Занята -->
          <div class="cell-item cell-occupied" onclick="showCellDetails(1)">
            <div class="cell-number">1</div>
            <div class="cell-status">Занята</div>
            <div class="cell-info">Заказ #4521</div>
            <div class="cell-time">2 дня</div>
          </div>
  
          <!-- Ячейка 2: Свободна -->
          <div class="cell-item cell-empty">
            <div class="cell-number">2</div>
            <div class="cell-status">Свободна</div>
          </div>
  
          <!-- Ячейка 3: Занята -->
          <div class="cell-item cell-occupied" onclick="showCellDetails(3)">
            <div class="cell-number">3</div>
            <div class="cell-status">Занята</div>
            <div class="cell-info">Заказ #4518</div>
            <div class="cell-time">4 дня</div>
          </div>
  
          <!-- Ячейка 4: Свободна -->
          <div class="cell-item cell-empty">
            <div class="cell-number">4</div>
            <div class="cell-status">Свободна</div>
          </div>
  
          <!-- Ячейка 5: Занята, просрочена -->
          <div class="cell-item cell-overdue" onclick="showCellDetails(5)">
            <div class="cell-number">5</div>
            <div class="cell-status">Просрочена</div>
            <div class="cell-info">Заказ #4502</div>
            <div class="cell-time">8 дней!</div>
          </div>
  
          <!-- Ячейка 6: Занята -->
          <div class="cell-item cell-occupied" onclick="showCellDetails(6)">
            <div class="cell-number">6</div>
            <div class="cell-status">Занята</div>
            <div class="cell-info">Заказ #4520</div>
            <div class="cell-time">3 дня</div>
          </div>
  
          <!-- Ячейка 7: Свободна -->
          <div class="cell-item cell-empty">
            <div class="cell-number">7</div>
            <div class="cell-status">Свободна</div>
          </div>
  
          <!-- Ячейка 8: Занята -->
          <div class="cell-item cell-occupied" onclick="showCellDetails(8)">
            <div class="cell-number">8</div>
            <div class="cell-status">Занята</div>
            <div class="cell-info">Заказ #4519</div>
            <div class="cell-time">3 дня</div>
          </div>
  
          <!-- Ячейка 9: Свободна -->
          <div class="cell-item cell-empty">
            <div class="cell-number">9</div>
            <div class="cell-status">Свободна</div>
          </div>
  
          <!-- Ячейка 10: Свободна -->
          <div class="cell-item cell-empty">
            <div class="cell-number">10</div>
            <div class="cell-status">Свободна</div>
          </div>
  
          <!-- Ячейка 11: Занята -->
          <div class="cell-item cell-occupied" onclick="showCellDetails(11)">
            <div class="cell-number">11</div>
            <div class="cell-status">Занята</div>
            <div class="cell-info">Заказ #4517</div>
            <div class="cell-time">5 дней</div>
          </div>
  
          <!-- Ячейка 12: Свободна -->
          <div class="cell-item cell-empty">
            <div class="cell-number">12</div>
            <div class="cell-status">Свободна</div>
          </div>
  
          <!-- Ячейка 13: Занята -->
          <div class="cell-item cell-occupied" onclick="showCellDetails(13)">
            <div class="cell-number">13</div>
            <div class="cell-status">Занята</div>
            <div class="cell-info">Заказ #4516</div>
            <div class="cell-time">5 дней</div>
          </div>
  
          <!-- Ячейка 14: Свободна -->
          <div class="cell-item cell-empty">
            <div class="cell-number">14</div>
            <div class="cell-status">Свободна</div>
          </div>
  
          <!-- Ячейка 15: Занята -->
          <div class="cell-item cell-occupied" onclick="showCellDetails(15)">
            <div class="cell-number">15</div>
            <div class="cell-status">Занята</div>
            <div class="cell-info">Заказ #4515</div>
            <div class="cell-time">6 дней</div>
          </div>
  
          <!-- Ячейка 16: Свободна -->
          <div class="cell-item cell-empty">
            <div class="cell-number">16</div>
            <div class="cell-status">Свободна</div>
          </div>
  
          <!-- Ячейка 17: Занята -->
          <div class="cell-item cell-occupied" onclick="showCellDetails(17)">
            <div class="cell-number">17</div>
            <div class="cell-status">Занята</div>
            <div class="cell-info">Заказ #4514</div>
            <div class="cell-time">6 дней</div>
          </div>
  
          <!-- Ячейка 18: Свободна -->
          <div class="cell-item cell-empty">
            <div class="cell-number">18</div>
            <div class="cell-status">Свободна</div>
          </div>
  
          <!-- Ячейка 19: Свободна -->
          <div class="cell-item cell-empty">
            <div class="cell-number">19</div>
            <div class="cell-status">Свободна</div>
          </div>
  
          <!-- Ячейка 20: Свободна -->
          <div class="cell-item cell-empty">
            <div class="cell-number">20</div>
            <div class="cell-status">Свободна</div>
          </div>
  
          <!-- Ячейка 21: Занята -->
          <div class="cell-item cell-occupied" onclick="showCellDetails(21)">
            <div class="cell-number">21</div>
            <div class="cell-status">Занята</div>
            <div class="cell-info">Заказ #4513</div>
            <div class="cell-time">7 дней</div>
          </div>
  
          <!-- Ячейка 22: Свободна -->
          <div class="cell-item cell-empty">
            <div class="cell-number">22</div>
            <div class="cell-status">Свободна</div>
          </div>
  
          <!-- Ячейка 23: Занята -->
          <div class="cell-item cell-occupied" onclick="showCellDetails(23)">
            <div class="cell-number">23</div>
            <div class="cell-status">Занята</div>
            <div class="cell-info">Заказ #4512</div>
            <div class="cell-time">1 день</div>
          </div>
  
          <!-- Ячейка 24: Свободна -->
          <div class="cell-item cell-empty">
            <div class="cell-number">24</div>
            <div class="cell-status">Свободна</div>
          </div>
  
          <!-- Ячейка 25: Занята -->
          <div class="cell-item cell-occupied" onclick="showCellDetails(25)">
            <div class="cell-number">25</div>
            <div class="cell-status">Занята</div>
            <div class="cell-info">Заказ #4511</div>
            <div class="cell-time">1 день</div>
          </div>
  
          <!-- Ячейка 26: Свободна -->
          <div class="cell-item cell-empty">
            <div class="cell-number">26</div>
            <div class="cell-status">Свободна</div>
          </div>
  
          <!-- Ячейка 27: Занята -->
          <div class="cell-item cell-occupied" onclick="showCellDetails(27)">
            <div class="cell-number">27</div>
            <div class="cell-status">Занята</div>
            <div class="cell-info">Заказ #4510</div>
            <div class="cell-time">2 дня</div>
          </div>
  
          <!-- Ячейка 28: Свободна -->
          <div class="cell-item cell-empty">
            <div class="cell-number">28</div>
            <div class="cell-status">Свободна</div>
          </div>
  
          <!-- Ячейка 29: Занята -->
          <div class="cell-item cell-occupied" onclick="showCellDetails(29)">
            <div class="cell-number">29</div>
            <div class="cell-status">Занята</div>
            <div class="cell-info">Заказ #4509</div>
            <div class="cell-time">2 дня</div>
          </div>
  
          <!-- Ячейка 30: Занята -->
          <div class="cell-item cell-occupied" onclick="showCellDetails(30)">
            <div class="cell-number">30</div>
            <div class="cell-status">Занята</div>
            <div class="cell-info">Заказ #4508</div>
            <div class="cell-time">3 дня</div>
          </div>
  
        </div>
  
        <!-- Легенда -->
        <div class="cells-legend">
          <div class="legend-item">
            <div class="legend-color" style="background: rgba(34, 197, 94, 0.15); border: 1px solid rgba(34, 197, 94, 0.3);"></div>
            <span>Свободна</span>
          </div>
          <div class="legend-item">
            <div class="legend-color" style="background: rgba(249, 115, 22, 0.15); border: 1px solid rgba(249, 115, 22, 0.3);"></div>
            <span>Занята</span>
          </div>
          <div class="legend-item">
            <div class="legend-color" style="background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.3);"></div>
            <span>Просрочена (&gt;7 дней)</span>
          </div>
        </div>
      </section>
    `;
  }   

/**
 * Загрузка данных баков стеклоомывателя
 */
async function loadTanksData(deviceId) {
  const rtdb = firebase.database();
  const shortDeviceId = deviceId.replace('@omyvai.ru', '').replace('.omyvai.ru', '');
  
  const stockRef = rtdb.ref(`devices_stock/${shortDeviceId}`);
  const snapshot = await stockRef.once('value');
  const stockData = snapshot.val();
  
  console.log('[StockDevice] stockData', stockData);
  
  if (!stockData) return [];
  
  const tanks = [];
  
  for (const key of Object.keys(stockData)) {
      if (key.startsWith('tank')) {
          const tankData = stockData[key];
          
          const capacity = parseTankCapacity(tankData.tank_item);
          const current = parseFloat(tankData.tank_quantity) || 0;
          const percentage = capacity > 0 ? Math.round((current / capacity) * 100) : 0;
          
          // Получаем данные о последней дозаправке
          const lastRefill = await loadLastRefill(shortDeviceId, key);
          
          // ✅ РАССЧИТЫВАЕМ РЕАЛЬНЫЙ РАСХОД из maintenance_expense
          const consumptionStats = await calculateDailyConsumptionFromMaintenance(deviceId, key, 7);
          const dailyConsumption = consumptionStats.dailyConsumption;
          const forecastDays = dailyConsumption > 0 ? Math.round(current / dailyConsumption) : 0;
          
          const tankType = detectTankType(tankData.tank_name);
          
          tanks.push({
              id: key,
              name: key.replace('tank_', 'Бак '),
              fluidName: tankData.tank_name || '',
              capacity,
              current,
              percentage,
              sum: tankData.tank_sum || 0,
              type: tankType,
              status: current > 0 ? 'active' : 'inactive',
              lastRefill,
              dailyConsumption: dailyConsumption.toFixed(1),
              forecastDays,
              operationsCount: consumptionStats.operationsCount // Дополнительная статистика
          });
      }
  }
  
  return tanks;
}
  
/**
 * Парсинг вместимости из названия бака
 * "TANK_PLASTERRA PT VL 150" → 150
 */
function parseTankCapacity(tankItem) {
    if (!tankItem) return 300; // по умолчанию
    
    const match = tankItem.match(/(\d+)$/);
    return match ? parseInt(match[1]) : 300;
  }

/**
 * Определение типа жидкости из названия
 */
function detectTankType(tankName) {
    if (!tankName) return 'unknown';
    
    const name = tankName.toLowerCase();
    
    if (name.includes('концентрат') && name.includes('90')) {
      return 'concentrate_minus90';
    }
    if (name.includes('концентрат') && name.includes('30')) {
      return 'concentrate_minus30';
    }
    if (name.includes('основ')) {
      return 'main';
    }
    
    return 'unknown';
  }
  
/**
 * Загрузка последнего прихода по складскому месту из Firestore
 */
async function loadLastRefill(deviceId, storagePlace) {
  try {
    const db = firebase.firestore();
    
    // Запрос последнего прихода по storagePlace
    const snapshot = await db.collection('operation_arrival')
      .where('storagePlace', '==', storagePlace)
      .orderBy('finishedAt', 'desc')
      .limit(1)
      .get();
    
    if (snapshot.empty) {
      console.log('[StockDevice] No arrivals found for', storagePlace);
      return null;
    }
    
    const arrival = snapshot.docs[0].data();
    
    // Конвертируем Firestore Timestamp в миллисекунды
    const date = arrival.finishedAt?.toMillis 
      ? arrival.finishedAt.toMillis() 
      : (arrival.createdAt?.toMillis ? arrival.createdAt.toMillis() : null);
    
    return {
      date,
      amount: parseFloat(arrival.quantity) || 0,
      nomenclature: arrival.nomenclature || '',
      price: parseFloat(arrival.price) || 0
    };
  } catch (e) {
    // Обработка ошибки доступа
    if (e.code === 'permission-denied') {
      console.warn('[StockDevice] No read access to operation_arrival for', storagePlace);
      return null;
    }
    
    // Если нет индекса
    if (e.code === 'failed-precondition') {
      console.error('[StockDevice] Missing Firestore index for operation_arrival query. Create it in console:', e.message);
      return null;
    }
    
    // Другие ошибки
    console.warn('[StockDevice] Failed to load last refill:', e);
    return null;
  }
}

/**
 * Расчёт общих KPI для омывателя
 */
function calculateWasherKPI(tanksData) {
  if (!tanksData || tanksData.length === 0) {
    return {
      totalPercentage: 0,
      lastRefillDate: null,
      avgConsumption: 0,
      forecastDays: 0
    };
  }
  
  // Общий процент (средневзвешенный по вместимости)
  let totalCurrent = 0;
  let totalCapacity = 0;
  let lastDate = null;
  
  tanksData.forEach(tank => {
    totalCurrent += tank.current;
    totalCapacity += tank.capacity;
    
    if (tank.lastRefill && tank.lastRefill.date) {
      if (!lastDate || tank.lastRefill.date > lastDate) {
        lastDate = tank.lastRefill.date;
      }
    }
  });
  
  const totalPercentage = totalCapacity > 0 
    ? Math.round((totalCurrent / totalCapacity) * 100) 
    : 0;
  
  // Средний расход и прогноз (заглушка, позже добавим расчёт из продаж)
  const avgConsumption = 48; // л/день
  const forecastDays = avgConsumption > 0 
    ? Math.round(totalCurrent / avgConsumption) 
    : 0;
  
  return {
    totalPercentage,
    lastRefillDate: lastDate,
    avgConsumption,
    forecastDays,
    totalCurrent,
    totalCapacity
  };
}

/**
 * Форматирование даты
 */
function formatDate(timestamp) {
  if (!timestamp) return 'Нет данных';
  
  const date = new Date(timestamp);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  
  return `${day}.${month}.${year}`;
}

/**
 * Расчёт дней назад
 */
function daysAgo(timestamp) {
    if (!timestamp) return '';
    
    const now = Date.now();
    const diff = now - timestamp;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return 'сегодня';
    if (days === 1) return '1 день назад';
    if (days < 5) return `${days} дня назад`;
    return `${days} дней назад`;
}

function renderTankCard(tank, deviceId) {
  const statusColor = tank.status === 'active' ? '#22c55e' : '#94a3b8';
  const statusText = tank.status === 'active' ? 'Активен' : 'Пуст';
  const fillColor = tank.percentage > 50 ? '#22c55e' : tank.percentage > 20 ? '#f97316' : '#ef4444';
  
  const dailyConsumption = parseFloat(tank.dailyConsumption) || 0;
  const forecastDays = tank.forecastDays || 0;
  
  // Формируем текст прогноза
  let forecastText = '—';
  let consumptionText = 'Нет данных о расходе';
  
  if (dailyConsumption > 0) {
      // Форматируем прогноз в днях
      if (forecastDays === 0) {
          forecastText = 'Менее 1 дня';
      } else if (forecastDays === 1) {
          forecastText = '≈ 1 день';
      } else if (forecastDays < 5) {
          forecastText = `≈ ${forecastDays} дня`;
      } else {
          forecastText = `≈ ${forecastDays} дней`;
      }
      
      // Форматируем расход
      consumptionText = `Расход: ${dailyConsumption} л/день`;
      
      if (tank.operationsCount > 0) {
          consumptionText += ` • ${tank.operationsCount} опер.`;
      }
  } else {
      forecastText = 'Недостаточно данных';
  }
  
  let lastRefillText = '—';
  if (tank.lastRefill) {
      const refillDate = formatDate(tank.lastRefill.date);
      const refillAmount = tank.lastRefill.amount;
      lastRefillText = `${refillDate} • ${refillAmount} л`;
  }
  
  return `
      <div class="tank-card">
          <div class="tank-header">
              <div class="tank-title">${tank.name}</div>
              <div class="tank-status" style="color: ${statusColor};">${statusText}</div>
          </div>
          
          <div class="tank-info">
              <div class="tank-type">
                  <div class="tank-label">Номенклатура</div>
                  <div class="tank-value">${tank.fluidName}</div>
              </div>
              
              <div class="tank-capacity">
                  <div class="tank-label">Емкость</div>
                  <div class="tank-value">${tank.capacity} л</div>
              </div>
          </div>
          
          <div class="tank-current">
              <div class="tank-progress-bar">
                  <div class="tank-progress-fill" style="width: ${tank.percentage}%; background: ${fillColor};"></div>
              </div>
              <div class="tank-current-info">
                  <div style="font-weight: 700; font-size: 18px; color: ${fillColor};">${tank.percentage}%</div>
                  <div style="font-size: 12px; color: var(--text-muted);">${tank.current} л</div>
              </div>
          </div>
          
          <div class="tank-forecast">
              <div class="tank-label">Прогноз:</div>
              <div class="tank-value">${forecastText}</div>
              <div style="font-size: 10px; color: var(--text-muted);">${consumptionText}</div>
          </div>
          
          <div class="tank-actions">
              <button class="btn-refill" data-action="refill" data-device="${deviceId}" data-tank="${tank.id}">
                  📥 Дозаправить
              </button>
              <button class="btn-drain" data-action="drain" data-device="${deviceId}" data-tank="${tank.id}">
                  💧 Слить
              </button>
          </div>
          
          <div class="tank-last-refill">
              <div style="font-size: 10px; color: var(--text-muted);">Последняя дозаправка</div>
              <div style="font-size: 11px; font-weight: 600;">${lastRefillText}</div>
          </div>
      </div>
  `;
}
  
/* ---------- МОДАЛЬНОЕ ОКНО СЛИВА ---------- */
function showDrainModal(deviceId, tankId) {
  console.log('[StockDevice] showDrainModal', deviceId, tankId);
  
  // Формируем правильный путь: devices_stock/{deviceId}/{tankId}
  const shortDeviceId = deviceId.replace('@omyvai.ru', '').replace('.omyvai.ru', '');
  const tankRef = rtdb.ref(`devices_stock/${shortDeviceId}/${tankId}`);
  
  tankRef.once('value', (snapshot) => {
      const tankData = snapshot.val();
      
      if (!tankData || !tankData.tank_name) {
          alert('Бак пуст, нечего сливать');
          return;
      }
      
      // Преобразуем в числа
      const currentQuantity = parseFloat(tankData.tank_quantity) || 0;
      const currentSum = parseFloat(tankData.tank_sum) || 0;
      
      if (currentQuantity <= 0) {
          alert('Бак пуст, нечего сливать');
          return;
      }
      
      const modalHtml = `
          <div id="drainModal" class="modal">
              <div class="modal-content" style="min-width: 400px; max-width: 450px;">
                  <span class="close" id="closeDrainBtn">&times;</span>
                  <h3 style="margin-bottom: 20px; color: var(--accent-error);">💧 Слить жидкость</h3>
                  
                  <div class="settings-grid" style="grid-template-columns: 1fr; gap: 16px;">
                      <div class="settings-field">
                          <label class="settings-label">Бак</label>
                          <div style="font-size: 13px; color: var(--text-soft); padding: 4px 0;">
                              ${tankId} <span style="opacity: 0.5;">(${deviceId})</span>
                          </div>
                      </div>
                      
                      <div style="padding: 12px; background: rgba(59, 130, 246, 0.1); border-radius: 8px; font-size: 13px;">
                          <strong>Текущее состояние:</strong><br>
                          Номенклатура: <strong>${tankData.tank_name || 'Не указано'}</strong><br>
                          Объем: <strong>${currentQuantity} л</strong><br>
                          Сумма: <strong>${currentSum.toFixed(2)} ₽</strong>
                      </div>
                      
                      <div class="settings-field">
                          <label class="settings-label" for="drainVolume">Объем для слива, л</label>
                          <input type="number" id="drainVolume" class="settings-input" 
                                 placeholder="0.0" min="0" max="${currentQuantity}" step="0.1">
                          <small style="font-size: 11px; color: var(--text-muted);">
                              Максимум: ${currentQuantity} л
                          </small>
                      </div>
                      
                      <div class="settings-field">
                          <label class="settings-label" for="drainReason">Причина слива</label>
                          <select id="drainReason" class="service-select" style="width: 100%;">
                              <option value="quality">Некачественная жидкость</option>
                              <option value="contamination">Загрязнение</option>
                              <option value="freeze">Замерзание</option>
                              <option value="expired">Истек срок годности</option>
                              <option value="maintenance">Техническое обслуживание</option>
                              <option value="other">Другое</option>
                          </select>
                      </div>
                      
                      <div class="settings-field">
                          <label class="settings-label" for="drainComment">Комментарий</label>
                          <textarea id="drainComment" class="settings-input" 
                                    style="min-height: 60px; resize: vertical; padding: 8px;" 
                                    placeholder="Дополнительная информация (необязательно)"></textarea>
                      </div>
                      
                      <input type="hidden" id="drain-device-id" value="${deviceId}">
                      <input type="hidden" id="drain-tank-id" value="${tankId}">
                  </div>
                  
                  <div class="modal-actions" style="margin-top: 24px;">
                      <button class="btn-secondary" id="cancelDrainBtn">Отмена</button>
                      <button class="btn-primary" id="confirmDrainBtn" 
                              style="background: rgba(239, 68, 68, 0.1); border-color: var(--accent-error); color: var(--accent-error);">
                          💧 Слить
                      </button>
                  </div>
              </div>
          </div>
      `;
      
      const modalDiv = document.createElement('div');
      modalDiv.innerHTML = modalHtml;
      document.body.appendChild(modalDiv.firstElementChild);
      
      const modal = document.getElementById('drainModal');
      modal.classList.remove('hidden');
      
      document.getElementById('closeDrainBtn').addEventListener('click', closeDrainModal);
      document.getElementById('cancelDrainBtn').addEventListener('click', closeDrainModal);
      document.getElementById('confirmDrainBtn').addEventListener('click', confirmDrain);
      
      modal.addEventListener('click', (e) => {
          if (e.target.id === 'drainModal') closeDrainModal();
      });
  });
}

function closeDrainModal() {
  const modal = document.getElementById('drainModal');
  if (modal) {
    modal.remove();
  }
}

async function confirmDrain() {
  try {
      // Получаем данные из формы
      const deviceId = document.getElementById('drain-device-id')?.value;
      const tankId = document.getElementById('drain-tank-id')?.value;
      const drainQuantity = parseFloat(document.getElementById('drainVolume')?.value);
      const drainReason = document.getElementById('drainReason')?.value;
      const drainComment = document.getElementById('drainComment')?.value.trim();
      
      // Валидация
      if (!deviceId || !tankId) {
          alert('Ошибка: не указан бак или устройство');
          return;
      }
      
      if (!drainQuantity || drainQuantity <= 0) {
          alert('Введите корректное количество для слива');
          return;
      }
      
      // Читаем текущие данные бака
      const shortDeviceId = deviceId.replace('@omyvai.ru', '').replace('.omyvai.ru', '');
      const tankRef = rtdb.ref(`devices_stock/${shortDeviceId}/${tankId}`);
      const snapshot = await tankRef.once('value');
      const tankData = snapshot.val();
      
      if (!tankData || !tankData.tank_name) {
          alert('Бак пуст, нечего сливать');
          return;
      }
      
      const currentQuantity = parseFloat(tankData.tank_quantity) || 0;
      const currentSum = parseFloat(tankData.tank_sum) || 0;
      
      // Проверка достаточности объема
      if (drainQuantity > currentQuantity) {
          alert(`Недостаточно жидкости. В баке только ${currentQuantity} л`);
          return;
      }
      
      // Расчет новых значений
      const newQuantity = currentQuantity - drainQuantity;
      const pricePerLiter = currentQuantity > 0 ? currentSum / currentQuantity : 0;
      const drainSum = drainQuantity * pricePerLiter;
      const newSum = currentSum - drainSum;
      
      // Формируем текст подтверждения с переводом причины
      const reasonTranslations = {
          'quality': 'Некачественная жидкость',
          'contamination': 'Загрязнение',
          'freeze': 'Замерзание',
          'expired': 'Истек срок годности',
          'maintenance': 'Техническое обслуживание',
          'other': 'Другое'
      };
      const reasonText = reasonTranslations[drainReason] || drainReason;
      
      const confirmText = newQuantity === 0 
          ? `Вы уверены, что хотите слить ВСЮ жидкость?\n\n` +
            `Номенклатура: ${tankData.tank_name}\n` +
            `Объем слива: ${drainQuantity} л\n` +
            `Сумма слива: ${drainSum.toFixed(2)} ₽\n` +
            `Причина: ${reasonText}\n` +
            `${drainComment ? 'Комментарий: ' + drainComment : ''}\n\n` +
            `Бак будет полностью очищен.`
          : `Подтвердите операцию слива:\n\n` +
            `Номенклатура: ${tankData.tank_name}\n` +
            `Объем слива: ${drainQuantity} л\n` +
            `Сумма слива: ${drainSum.toFixed(2)} ₽\n` +
            `Причина: ${reasonText}\n` +
            `${drainComment ? 'Комментарий: ' + drainComment : ''}\n\n` +
            `Останется в баке:\n` +
            `Объем: ${newQuantity.toFixed(2)} л\n` +
            `Сумма: ${newSum.toFixed(2)} ₽`;
      
      // Запрос подтверждения
      if (!confirm(confirmText)) {
          return;
      }
      
      // Формируем обновления для RTDB
      const updates = {};
      
      if (newQuantity === 0) {
          // Бак опустошен полностью - очищаем только номенклатуру
          updates[`devices_stock/${shortDeviceId}/${tankId}/tank_name`] = null;
          updates[`devices_stock/${shortDeviceId}/${tankId}/tank_quantity`] = 0;
          updates[`devices_stock/${shortDeviceId}/${tankId}/tank_sum`] = 0;
      } else {
          // Частичный слив - обновляем только количество и сумму
          updates[`devices_stock/${shortDeviceId}/${tankId}/tank_quantity`] = parseFloat(newQuantity.toFixed(2));
          updates[`devices_stock/${shortDeviceId}/${tankId}/tank_sum`] = parseFloat(newSum.toFixed(2));
      }
      
      // Применяем обновления
      await rtdb.ref().update(updates);
      
      // Закрываем модальное окно
      closeDrainModal();
      
      // Обновляем отображение баков
      await initStockDeviceScreen(deviceId);
      
      // Показываем уведомление об успехе
      alert(`Слив выполнен успешно!\n\nСлито: ${drainQuantity} л на сумму ${drainSum.toFixed(2)} ₽`);
      
  } catch (error) {
      console.error('Ошибка при сливе:', error);
      alert('Произошла ошибка при выполнении операции слива');
  }
}

/* ---------- ИНИЦИАЛИЗАЦИЯ ОБРАБОТЧИКОВ СОБЫТИЙ ---------- */
function initTankButtons() {
  console.log('[StockDevice] Initializing tank buttons');
  
  document.querySelectorAll('.btn-drain').forEach(btn => {
      btn.addEventListener('click', function() {
          const deviceId = this.dataset.device;
          const tankId = this.dataset.tank;
          
          console.log('[StockDevice] Drain button clicked', deviceId, tankId);
          showDrainModal(deviceId, tankId); // ← Правильный порядок: сначала deviceId, потом tankId
      });
  });
  
  document.querySelectorAll('.btn-refill').forEach(btn => {
      btn.addEventListener('click', function() {
          const deviceId = this.dataset.device;
          const tankId = this.dataset.tank;
          
          console.log('[StockDevice] Refill button clicked', deviceId, tankId);
          showRefillModal(deviceId, tankId);
      });
  });
}

/* ---------- МОДАЛЬНОЕ ОКНО ПОПОЛНЕНИЯ ---------- */
async function showRefillModal(deviceId, tankId) {
  console.log('StockDevice showRefillModal', deviceId, tankId);

  // 1. Загружаем номенклатуру
  let nomenclatureItems = [];
  try {
    nomenclatureItems = await loadNomenclature();
  } catch (e) {
    console.error('StockDevice Failed to load nomenclature', e);
    alert('Не удалось загрузить номенклатуру для дозаправки');
    return;
  }

  // 2. Собираем options (только стеклоомыватели)
  const optionsHtml = nomenclatureItems
    .filter(item => item.category === 'WASHER_FLUID')
    .map(item => {
      const label = `${item.name} (${item.unit})`;
      // value = nomenclature_id, data-name = человекочитаемое имя
      return `<option value="${item.nomenclatureid}" data-name="${item.name}">${label}</option>`;
    })
    .join('');

  const modalHtml = `
    <div id="refillModal" class="modal">
      <div class="modal-content" style="min-width: 400px; max-width: 450px;">
        <span class="close" id="closeRefillBtn">&times;</span>
        <h3 style="margin-bottom: 20px; color: var(--accent);">Дозаправить</h3>

        <div class="settings-grid" style="grid-template-columns: 1fr; gap: 16px;">
          <div class="settings-field">
            <label class="settings-label">Бак</label>
            <div style="font-size: 13px; color: var(--text-soft); padding: 4px 0;">
              ${tankId} <span style="opacity: 0.5;">(${deviceId})</span>
            </div>
          </div>

          <div class="settings-field">
            <label class="settings-label" for="refillVolume">Объём, литров</label>
            <input type="number" id="refillVolume" class="settings-input" placeholder="0.0" min="0" step="0.1">
          </div>

          <div class="settings-field">
            <label class="settings-label" for="refillNomenclature">Номенклатура</label>
            <select id="refillNomenclature" class="service-select" style="width: 100%;">
              ${optionsHtml}
            </select>
          </div>

          <div class="settings-field">
            <label class="settings-label" for="refillPrice">Цена закупки, ₽/л</label>
            <input type="number" id="refillPrice" class="settings-input" placeholder="0.00" min="0" step="0.01">
          </div>

          <div class="settings-field">
            <label class="settings-label" for="refillComment">Комментарий</label>
            <textarea id="refillComment" class="settings-input" style="min-height: 60px; resize: vertical; padding: 8px;" placeholder="..."></textarea>
          </div>
        </div>

        <div class="modal-actions" style="margin-top: 24px;">
          <button class="btn-secondary" id="cancelRefillBtn">Отмена</button>
          <button class="btn-primary" id="confirmRefillBtn">Сохранить</button>
        </div>
      </div>
    </div>
  `;

  const modalDiv = document.createElement('div');
  modalDiv.innerHTML = modalHtml;
  document.body.appendChild(modalDiv.firstElementChild);

  const modal = document.getElementById('refillModal');
  modal.classList.remove('hidden');

  document.getElementById('closeRefillBtn').addEventListener('click', closeRefillModal);
  document.getElementById('cancelRefillBtn').addEventListener('click', closeRefillModal);

  document
    .getElementById('confirmRefillBtn')
    .addEventListener('click', async () => {
      const ok = confirm('Подтвердите дозаправку бака');
      if (!ok) return;
      await confirmRefill(deviceId, tankId);
    });

  modal.addEventListener('click', (e) => {
    if (e.target.id === 'refillModal') {
      closeRefillModal();
    }
  });
}

function closeRefillModal() {
  const modal = document.getElementById('refillModal');
  if (modal) modal.remove();
}

function generateTransactionNumber(deviceId) {
  const shortId = deviceId.replace('@omyvai.ru', '').replace('omyvai.ru', '');
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const yyyy = now.getFullYear();
  const MM = pad(now.getMonth() + 1);
  const dd = pad(now.getDate());
  const HH = pad(now.getHours());
  const mm = pad(now.getMinutes());
  const ss = pad(now.getSeconds());

  // ven_00001_20260201_110000_arrival_001
  return `${shortId}_${yyyy}${MM}${dd}_${HH}${mm}${ss}_arrival_001`;
}

async function confirmRefill(deviceId, tankId) {
  try {
    const volume = parseFloat(document.getElementById('refillVolume').value);
    const selectedNomenclatureId =
      document.getElementById('refillNomenclature')?.value || null;
    const price = parseFloat(document.getElementById('refillPrice').value) || 0;
    const comment = document.getElementById('refillComment').value || '';

    if (!volume || volume <= 0) {
      alert('Введите объём дозаправки');
      return;
    }

    if (!price || price <= 0) {
      const ok = confirm(
        'Цена закупки не указана или равна 0. Продолжить без цены?',
      );
      if (!ok) return;
    }

    // 1. Загружаем текущий бак из RTDB
    const shortDeviceId = deviceId.replace('@omyvai.ru', '').replace('omyvai.ru', '');
    const tank = await loadTankFromRTDB(shortDeviceId, tankId);

    const currentVolume = parseFloat(tank?.tank_quantity || '0'); // литры
    const currentSum = parseFloat(tank?.tank_sum || '0');         // ₽
    const currentName = tank?.tank_name || '';

    const isEmpty = currentVolume <= 0;

    // 2. Определяем название номенклатуры
    let nomenclatureName = currentName;

    if (isEmpty) {
      if (!selectedNomenclatureId) {
        alert('Выберите номенклатуру');
        return;
      }

      const select = document.getElementById('refillNomenclature');
      const opt = select.options[select.selectedIndex];
      const selectedName = opt.dataset.name; // 'Концентрат -90°C серия А'

      nomenclatureName = selectedName;
    } else {
      // бак не пуст — не даём менять тип жидкости, оставляем текущее имя
      nomenclatureName = currentName;
    }

    // 3. Считаем новые остатки и стоимость
    const addedVolume = volume;
    const addedSum = volume * price;

    const newVolume = currentVolume + addedVolume;
    const newSum = currentSum + addedSum;

    // 4. Обновляем RTDB (devices_stock)
    const rtdbUpdates = {
      tank_quantity: String(newVolume),
      tank_sum: String(newSum),
    };

    if (isEmpty && nomenclatureName) {
      rtdbUpdates.tank_name = nomenclatureName;
    }

    await updateTankInRTDB(shortDeviceId, tankId, rtdbUpdates);

    // 5. Сохраняем приход в Firestore (operation_arrival)
    const db = firebase.firestore();
    const sum = addedSum;
    const transactionNumber = generateTransactionNumber(deviceId);

    await db.collection('operation_arrival').add({
      machineId: `${shortDeviceId}@omyvai.ru`,
      storagePlace: tankId,
      nomenclature: nomenclatureName,
      quantity: String(addedVolume),
      price: String(price),
      sum: String(sum),
      units: 'литр',
      serviceType: 'WASHER_FLUID',
      paymentMethod: 'cash',
      transaction_number: transactionNumber,
      startedAt: firebase.firestore.FieldValue.serverTimestamp(),
      finishedAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      comment,
      operatorEmail: window.currentOperator?.email || 'unknown',
    });

    console.log(
      '[StockDevice] Refill operation saved successfully',
      deviceId,
      tankId,
      addedVolume,
      newVolume,
      newSum,
      nomenclatureName,
    );

    closeRefillModal();
    await initStockDeviceScreen(deviceId);
    alert('Дозаправка сохранена');
  } catch (error) {
    console.error('[StockDevice] Error during refill operation', error);
    alert(error.message || 'Ошибка при дозаправке');
  }
}

// Firestore
async function loadNomenclature() {
  const db = firebase.firestore();
  const snapshot = await db
    .collection('nomenclature')
    .orderBy('nomenclature_name')
    .get();

  const items = [];
  snapshot.forEach(doc => {
    const data = doc.data();
    items.push({
      id: doc.id,
      nomenclatureid: data.nomenclature_id,
      name: data.nomenclature_name,
      category: data.nomenclature_category,
      type: data.nomenclature_type,
      unit: data.nomenclature_unit,
      comment: data.nomenclature_comment ?? '',
    });
  });

  return items;
}

/**
 * Рассчитывает средний дневной расход жидкости из бака на основе данных maintenance_expense
 * @param {string} deviceId - ID устройства (например, "ven_00001")
 * @param {string} tankId - ID бака (например, "tank_1")
 * @param {number} days - Период для анализа (по умолчанию 7 дней)
 * @returns {Promise<Object>} - { dailyConsumption, totalQuantity, operationsCount }
 */
async function calculateDailyConsumptionFromMaintenance(deviceId, tankId, days = 7) {
  try {
      const db = firebase.firestore();
      const shortDeviceId = deviceId.replace('@omyvai.ru', '').replace('.omyvai.ru', '');
      
      // Формируем ID точки обслуживания: washer_fluid_tank_1_pump
      const maintenancePointId = `washer_fluid_${tankId}_pump`;
      
      // Получаем дату начала периода
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      const startTimestamp = firebase.firestore.Timestamp.fromDate(startDate);
      
      // Путь к коллекции: maintenance_expense/ven_00001/washer_fluid_tank_1_pump
      const collectionPath = `maintenance_expense/${shortDeviceId}/${maintenancePointId}`;
      
      console.log('[StockDevice] Fetching consumption data from:', collectionPath);
      
      // Запрос к документам за последние N дней
      const snapshot = await db.collection(collectionPath)
          .where('timestamp', '>=', startTimestamp)
          .orderBy('timestamp', 'desc')
          .get();
      
      if (snapshot.empty) {
          console.log('[StockDevice] No maintenance data found for consumption calculation');
          return {
              dailyConsumption: 0,
              totalQuantity: 0,
              operationsCount: 0
          };
      }
      
      // Суммируем расход жидкости
      let totalQuantity = 0;
      let operationsCount = 0;
      
      snapshot.forEach(doc => {
          const data = doc.data();
          const quantity = parseFloat(data.duration_quantity) || 0;
          
          if (quantity > 0) {
              totalQuantity += quantity;
              operationsCount++;
          }
      });
      
      // Расчет среднего дневного расхода
      const dailyConsumption = totalQuantity / days;
      
      console.log(`[StockDevice] Consumption stats for ${tankId}:`, {
          period: `${days} days`,
          totalQuantity: totalQuantity.toFixed(2),
          operationsCount,
          dailyConsumption: dailyConsumption.toFixed(2)
      });
      
      return {
          dailyConsumption,
          totalQuantity,
          operationsCount
      };
      
  } catch (error) {
      console.error('[StockDevice] Failed to calculate consumption:', error);
      return {
          dailyConsumption: 0,
          totalQuantity: 0,
          operationsCount: 0
      };
  }
}

/* ---------- Глобальный экспорт для старых onclick, если нужно ---------- */

if (typeof window !== 'undefined') {
    window.initStockDeviceScreen = initStockDeviceScreen;
}
