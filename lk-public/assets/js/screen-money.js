import { showLoadingIndicator, hideLoadingIndicator, showErrorMessage, loadClientDevices, machines, getPeriodRange, formatDiffPercent, loadDeviceLocations, formatRuble, formatMarginPercent, formatChecks } from './basic.js';

let moneyServicesSummary = [
    {
      id: 'WASHER_FLUID',
      domService: 'washer',
      title: 'Стеклоомывающая жидкость',
      activeDevices: 0,
      totalDevices: 0,
      income: 0,
      incomeDiff: 0,
      revenue: 0,
      revenueDiff: 0,
      margin: 0,
      marginDiff: 0,
      checks: 0,
      checksDiff: 0,
      avgCheck: 0,
      avgCheckDiff: 0
    },
    {
      id: 'VACUUM_CLEANER',
      domService: 'vacuum',
      title: 'Пылесос',
      activeDevices: 0,
      totalDevices: 0,
      income: 0,
      incomeDiff: 0,
      revenue: 0,
      revenueDiff: 0,
      margin: 0,
      marginDiff: 0,
      checks: 0,
      checksDiff: 0,
      avgCheck: 0,
      avgCheckDiff: 0
    },
    {
      id: 'TARGETED_DELIVERY',
      domService: 'delivery',
      title: 'Адресная выдача',
      activeDevices: 0,
      totalDevices: 0,
      income: 0,
      incomeDiff: 0,
      revenue: 0,
      revenueDiff: 0,
      margin: 0,
      marginDiff: 0,
      checks: 0,
      checksDiff: 0,
      avgCheck: 0,
      avgCheckDiff: 0
    }
  ];

let moneyMachines;
let moneyFilteredMachines;


// Инициализация экрана "Деньги"
export function initMoneyScreen() {
    const moneyPeriod = document.getElementById('money-period');
    const period = moneyPeriod ? (moneyPeriod.value || '7d') : '7d';

    console.log('Money initMoneyScreen, initial period', period);

    if (moneyPeriod) {
        moneyPeriod.addEventListener('change', (e) => {
        const newPeriod = e.target.value;
        console.log('Money money-period changed ->', newPeriod);
        reloadMoneyData(newPeriod);
        });
    }

    initMoneyTableSection();
    reloadMoneyData(period);
}

// Таблица машин + фильтры
function initMoneyTableSection() {
    const filterSelect = document.querySelector('.table-section select#filter-select');
    const searchInput = document.querySelector('.table-section .search-input');
  
    if (filterSelect) {
      filterSelect.addEventListener('change', applyMoneyFilters);
    }
    if (searchInput) {
      searchInput.addEventListener('input', applyMoneyFilters);
    }
  
    moneyMachines = [];
    moneyFilteredMachines = [];
    renderMoneyMachinesTable(); // без applyMoneyFilters здесь
} 

function applyMoneyFilters() {
    console.log('[DEBUG] applyMoneyFilters before, moneyMachines =', moneyMachines?.length);

    const filterSelect = document.querySelector('.table-section #filter-select');
    const searchInput  = document.querySelector('.table-section .search-input');

    const filterValue = filterSelect ? filterSelect.value : 'all';
    const searchTerm  = searchInput ? searchInput.value.trim().toLowerCase() : '';

    // Фильтруем поверх актуального snapshot массива
    let filtered = Array.isArray(moneyMachines) ? [...moneyMachines] : [];

    // Поиск по ID и локации
    if (searchTerm) {
        filtered = filtered.filter(m =>
            m.id.toLowerCase().includes(searchTerm) ||
            (m.location && m.location.toLowerCase().includes(searchTerm))
        );
    }

    // Фильтр по доходности/проблемам
    switch (filterValue) {
        case 'high-income':      // >= 5000 руб доход
            filtered = filtered.filter(m => m.totalIncome >= 5000);
            break;
        case 'low-income':       // 0 < доход < 1000
            filtered = filtered.filter(m => m.totalIncome > 0 && m.totalIncome < 1000);
            break;
        case 'problems':         // статус не ok
            filtered = filtered.filter(m => m.status !== 'ok');
            break;
        case 'all':
        default:
            // без дополнительной фильтрации
            break;
    }

    moneyFilteredMachines = filtered;

    console.log('[DEBUG] applyMoneyFilters after, moneyFilteredMachines =', moneyFilteredMachines.length);
    renderMoneyMachinesTable();
}

function renderMoneyMachinesTable() {
    const tbody = document.getElementById('money-table-body');
    if (!tbody) return;
  
    // всегда очищаем содержимое перед рендером
    tbody.innerHTML = '';
  
    const list = Array.isArray(moneyFilteredMachines)
      ? moneyFilteredMachines
      : [];
  
    console.log('[Money] renderMoneyMachinesTable count =', list.length);
  
    if (list.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="12"
              style="text-align:center; padding:40px; color:var(--text-muted);">
            Нет аппаратов, подходящих под выбранный фильтр
          </td>
        </tr>`;
      return;
    }
  
    const rowsHtml = list
      .map(m => {
        const totalIncomeColor    = m.totalIncome    > 0 ? '#22c55e' : '#ef4444';
        const washerIncomeColor   = m.washerIncome   > 0 ? '#22c55e' : '#ef4444';
        const vacuumIncomeColor   = m.vacuumIncome   > 0 ? '#22c55e' : '#ef4444';
        const deliveryIncomeColor = m.deliveryIncome > 0 ? '#22c55e' : '#ef4444';
  
        const safeLocation = m.location || 'Адрес не указан';
        const safeLat = m.lat != null ? m.lat : 'null';
        const safeLng = m.lng != null ? m.lng : 'null';
  
        return `
          <tr>
            <td class="col-id">${m.id}</td>
            <td class="col-location">
              <div class="location-cell">
                <span>${safeLocation}</span>
                <button class="map-btn" title="Открыть на карте"
                  onclick="openMap(${safeLat}, ${safeLng}, '${safeLocation.replace(/'/g, "\\'")}')">
                  📍
                </button>
              </div>
            </td>
  
            <!-- Общий: Доход + Маржа -->
            <td>
              <div style="font-weight: 600; color: ${totalIncomeColor};">
                ${formatRuble(m.totalIncome)}
              </div>
              <div style="font-size: 10px; color: var(--text-muted);">
                ${formatMarginPercent(m.totalMarginPercent)}
              </div>
            </td>
  
            <!-- Общий: Выручка + Чеки -->
            <td>
              <div style="font-weight: 600; color: #22c55e;">
                ${formatRuble(m.totalRevenue)}
              </div>
              <div style="font-size: 10px; color: var(--text-muted);">
                ${formatChecks(m.totalChecks)}
              </div>
            </td>
  
            <!-- Стеклоомыватель: Доход + Маржа -->
            <td>
              <div style="font-weight: 600; color: ${washerIncomeColor};">
                ${formatRuble(m.washerIncome)}
              </div>
              <div style="font-size: 10px; color: var(--text-muted);">
                ${formatMarginPercent(m.washerMarginPercent)}
              </div>
            </td>
  
            <!-- Стеклоомыватель: Выручка + Чеки -->
            <td>
              <div style="font-weight: 600; color: #22c55e;">
                ${formatRuble(m.washerRevenue)}
              </div>
              <div style="font-size: 10px; color: var(--text-muted);">
                ${formatChecks(m.washerChecks)}
              </div>
            </td>
  
            <!-- Пылесос: Доход + Маржа -->
            <td>
              <div style="font-weight: 600; color: ${vacuumIncomeColor};">
                ${formatRuble(m.vacuumIncome)}
              </div>
              <div style="font-size: 10px; color: var(--text-muted);">
                ${formatMarginPercent(m.vacuumMarginPercent)}
              </div>
            </td>
  
            <!-- Пылесос: Выручка + Чеки -->
            <td>
              <div style="font-weight: 600; color: #22c55e;">
                ${formatRuble(m.vacuumRevenue)}
              </div>
              <div style="font-size: 10px; color: var(--text-muted);">
                ${formatChecks(m.vacuumChecks)}
              </div>
            </td>
  
            <!-- Адресная выдача: Доход + Маржа -->
            <td>
              <div style="font-weight: 600; color: ${deliveryIncomeColor};">
                ${formatRuble(m.deliveryIncome)}
              </div>
              <div style="font-size: 10px; color: var(--text-muted);">
                ${formatMarginPercent(m.deliveryMarginPercent)}
              </div>
            </td>
  
            <!-- Адресная выдача: Выручка + Чеки -->
            <td>
              <div style="font-weight: 600; color: #22c55e;">
                ${formatRuble(m.deliveryRevenue)}
              </div>
              <div style="font-size: 10px; color: var(--text-muted);">
                ${formatChecks(m.deliveryChecks)}
              </div>
            </td>
  
            <!-- Статус и операция -->
            <td>
              <span class="status-pill status-${m.status}">${m.statusText}</span>
            </td>
            <td style="font-size: 11px; color: var(--text-muted);">
              ${m.lastOpTime || ''} · ${m.lastOpService || ''} · ${
                (m.lastOpSum || 0).toLocaleString('ru-RU')
              } ₽
              <button class="link-more-button" style="margin-left: 8px;"
                onclick="showMachineDetails('${m.id}')">
                Подробнее
              </button>
            </td>
          </tr>
        `;
      })
      .join('');
  
    tbody.innerHTML = rowsHtml;
}

export function renderMoneyServicesKPI() {
    console.log('[Money] renderMoneyServicesKPI', moneyServicesSummary);
    const container = document.getElementById('money-services-kpi');
    if (!container) return;
  
    const cardsHtml = moneyServicesSummary.map(s => {
      const incomeDiff   = formatDiffPercent(s.incomeDiff);
      const revenueDiff  = formatDiffPercent(s.revenueDiff);
      const marginDiff   = formatDiffPercent(s.marginDiff);
      const checksDiff   = formatDiffPercent(s.checksDiff);
      const avgCheckDiff = formatDiffPercent(s.avgCheckDiff);
  
      return `
        <article class="kpi-card-detailed" data-service="${s.domService}">
          <div class="kpi-badge">${s.activeDevices} из ${s.totalDevices}</div>
          <div class="kpi-title">${s.title}</div>
  
          <div class="kpi-main-metric">
            <div class="kpi-main-metric-label">Доход</div>
            <div class="kpi-main-metric-row">
              <div class="kpi-main-metric-value">
                ${s.income.toLocaleString('ru-RU')} ₽
              </div>
              <div class="kpi-main-metric-diff ${incomeDiff.cls}">
                ${incomeDiff.text}
              </div>
            </div>
          </div>
  
          <div class="kpi-metric">
            <div class="kpi-metric-label">Выручка</div>
            <div class="kpi-metric-content">
              <div class="kpi-metric-value">
                ${s.revenue.toLocaleString('ru-RU')} ₽
              </div>
              <div class="kpi-metric-diff ${revenueDiff.cls}">
                ${revenueDiff.text}
              </div>
            </div>
          </div>
  
          <div class="kpi-metric">
            <div class="kpi-metric-label">Маржа</div>
            <div class="kpi-metric-content">
              <div class="kpi-metric-value">
                ${s.margin.toLocaleString('ru-RU')} ₽
              </div>
              <div class="kpi-metric-diff ${marginDiff.cls}">
                ${marginDiff.text}
              </div>
            </div>
          </div>
  
          <div class="kpi-metric">
            <div class="kpi-metric-label">Чеков</div>
            <div class="kpi-metric-content">
              <div class="kpi-metric-value">
                ${s.checks.toLocaleString('ru-RU')}
              </div>
              <div class="kpi-metric-diff ${checksDiff.cls}">
                ${checksDiff.text}
              </div>
            </div>
          </div>
  
          <div class="kpi-metric">
            <div class="kpi-metric-label">Средний чек</div>
            <div class="kpi-metric-content">
              <div class="kpi-metric-value">
                ${s.avgCheck.toLocaleString('ru-RU')} ₽
              </div>
              <div class="kpi-metric-diff ${avgCheckDiff.cls}">
                ${avgCheckDiff.text}
              </div>
            </div>
          </div>
        </article>
      `;
    }).join('');
  
    container.innerHTML = cardsHtml;
}

// вспомогательная функция: какой предыдущий период брать
function getPrevPeriod(period) {
    switch (period) {
      case 'today':
        return 'yesterday';
      case 'yesterday':
        return null;          // можно не сравнивать
      case '7d':
        return 'prev7d';      // нужно будет поддержать в getPeriodRange
      case '30d':
        return 'prev30d';
      default:
        return null;
    }
}
  
async function reloadMoneyData(period) {
  try {
    showLoadingIndicator();

    const currentResult = await loadFleetOperations(period);
    const opsCurrent = currentResult.operations;
    const totalDevices = currentResult.totalDevices;
    console.log('DEBUG reloadMoneyData opsCurrent sample', opsCurrent.slice(0, 3));

    const prevPeriod = getPrevPeriod(period);
    let opsPrev = [];

    if (prevPeriod) {
      const prevResult = await loadFleetOperations(prevPeriod);
      opsPrev = prevResult.operations;
      console.log('DEBUG reloadMoneyData opsPrev sample', opsPrev.slice(0, 3));
    }

    await recalcMoneyAggregates(opsCurrent, opsPrev, period, totalDevices);

    renderMoneyServicesKPI();
    applyMoneyFilters();
  } catch (e) {
    console.error('Failed to reload money data', e);
    showErrorMessage('Не удалось загрузить данные по деньгам');
  } finally {
    hideLoadingIndicator();
  }
}

async function loadFleetOperations(period) {
  console.log('[Money] loadFleetOperations period =', period);

  const deviceIds = await loadClientDevices();
  console.log('[Money] client devices (canonical) =', deviceIds);

  const allOps = [];

  for (const id of deviceIds) {
    try {
      const ops = await fetchOperationsForDevice(id, period);
      console.log('[Money] device', id, 'ops count =', ops.length);
      allOps.push(...ops);
    } catch (e) {
      console.error('Failed to load operations for device in fleet', id, e);
    }
  }

  console.log('[Money] Total fleet operations loaded for client:', allOps.length);

  // возвращаем и операции, и реальное количество устройств клиента
  return {
    operations: allOps,
    totalDevices: deviceIds.length,
  };
}

async function fetchOperationsForDevice(deviceId, period = '7d') {
    console.log('[Money] fetchOperationsForDevice', deviceId, 'period =', period);
  
    // deviceId уже должен приходить в виде ven_00001@omyvai.ru
    const fullDeviceId = deviceId;
  
    const { start, end } = getPeriodRange(period);
    console.log(
      '[Money] Firestore query', fullDeviceId,
      'from', start.toISOString(),
      'to', end.toISOString()
    );
  
    const db = firebase.firestore();
  
    const arrivalSnap = await db
      .collection('operation_arrival')
      .where('machineId', '==', fullDeviceId)
      .where('startedAt', '>=', start)
      .where('startedAt', '<=', end)
      .get();
  
    const expenseSnap = await db
      .collection('operation_expense')
      .where('machineId', '==', fullDeviceId)
      .where('startedAt', '>=', start)
      .where('startedAt', '<=', end)
      .get();
  
    const operations = [];
  
    arrivalSnap.forEach((doc) => {
      const d = doc.data();
      operations.push({
        id: doc.id,
        type: 'arrival',
        deviceId: fullDeviceId,
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
        income: 0
      });
    });
  
    expenseSnap.forEach((doc) => {
      const d = doc.data();
      const incomeRaw = d.income;
      const incomeParsed = incomeRaw != null ? parseFloat(incomeRaw) : NaN;
      const safeIncome = isFinite(incomeParsed) ? incomeParsed : 0;
  
      operations.push({
        id: doc.id,
        type: 'expense',
        deviceId: fullDeviceId,
        createdAt: d.createdAt,
        startedAt: d.startedAt,
        finishedAt: d.finishedAt,
        serviceType: d.serviceType || 'WASHER_FLUID',
        nomenclature: d.nomenclature || '',
        sum: parseFloat(d.sum || '0') || 0,
        quantity: parseFloat(d.quantity || '0') || 0,
        units: d.units || '',
        price: parseFloat(d.price_new || d.price || '0') || 0,
        paymentMethod: d.paymentMethod || '',
        status: 'success',
        transactionNumber: d.transaction_number || '',
        income: safeIncome
      });
    });
  
    return operations;
}

function calcDiffPercent(current, prev) {
  if (!prev || prev === 0) return 0;
  return Math.round((current - prev) / prev * 100);
}
  
async function recalcMoneyAggregates(opsCurrent, opsPrev, period, totalDevices) {
  console.log(
    '[Money] recalcMoneyAggregates period =',
    period,
    'opsCurrent =',
    opsCurrent ? opsCurrent.length : 0,
    'opsPrev =',
    opsPrev ? opsPrev.length : 0
  );

  // 0. Загружаем конфигурацию модулей для всех устройств клиента
  const deviceIds = await loadClientDevices();
  const servicesConfigCount = await loadServicesConfigForFleet(deviceIds);
  console.log('[Money] servicesConfigCount =', servicesConfigCount);

  // 0. Если за период нет операций — обнуляем всё и выходим
  if (!opsCurrent || opsCurrent.length === 0) {
    moneyServicesSummary = [
      {
        id: 'WASHER_FLUID',
        domService: 'washer',
        title: 'Стеклоомывающая жидкость',
        activeDevices: servicesConfigCount.WASHER_FLUID || 0,
        totalDevices,
        income: 0,
        incomeDiff: 0,
        revenue: 0,
        revenueDiff: 0,
        margin: 0,
        marginDiff: 0,
        checks: 0,
        checksDiff: 0,
        avgCheck: 0,
        avgCheckDiff: 0,
      },
      {
        id: 'VACUUM_CLEANER',
        domService: 'vacuum',
        title: 'Пылесос',
        activeDevices: servicesConfigCount.VACUUM_CLEANER || 0,
        totalDevices,
        income: 0,
        incomeDiff: 0,
        revenue: 0,
        revenueDiff: 0,
        margin: 0,
        marginDiff: 0,
        checks: 0,
        checksDiff: 0,
        avgCheck: 0,
        avgCheckDiff: 0,
      },
      {
        id: 'TARGETED_DELIVERY',
        domService: 'delivery',
        title: 'Адресная выдача',
        activeDevices: servicesConfigCount.TARGETED_DELIVERY || 0,
        totalDevices,
        income: 0,
        incomeDiff: 0,
        revenue: 0,
        revenueDiff: 0,
        margin: 0,
        marginDiff: 0,
        checks: 0,
        checksDiff: 0,
        avgCheck: 0,
        avgCheckDiff: 0,
      },
    ];

    moneyMachines = [];
    moneyFilteredMachines = [];
    console.log('[Money] no operations for period, moneyMachines cleared');
    return;
  }

  // 1. Агрегаты по услугам (текущий период)
  const servicesAgg = {
    WASHER_FLUID: {
      income: 0,
      revenue: 0,
      margin: 0,
      checks: 0,
      devices: new Set(),
    },
    VACUUM_CLEANER: {
      income: 0,
      revenue: 0,
      margin: 0,
      checks: 0,
      devices: new Set(),
    },
    TARGETED_DELIVERY: {
      income: 0,
      revenue: 0,
      margin: 0,
      checks: 0,
      devices: new Set(),
    },
  };

  // 1.1 Агрегаты по услугам (предыдущий период)
  const prevServicesAgg = {
    WASHER_FLUID:      { income: 0, revenue: 0, checks: 0 },
    VACUUM_CLEANER:    { income: 0, revenue: 0, checks: 0 },
    TARGETED_DELIVERY: { income: 0, revenue: 0, checks: 0 },
  };

  if (Array.isArray(opsPrev) && opsPrev.length > 0) {
    opsPrev.forEach(op => {
      const service = op.serviceType || '';
      const revenue = Number(op.sum) || 0;
      const income  = Number(op.income) || 0;

      let bucket = null;
      if (service === 'WASHER_FLUID') bucket = prevServicesAgg.WASHER_FLUID;
      else if (service === 'VACUUM_CLEANER') bucket = prevServicesAgg.VACUUM_CLEANER;
      else if (service === 'TARGETED_DELIVERY') bucket = prevServicesAgg.TARGETED_DELIVERY;

      if (!bucket) return;

      bucket.revenue += revenue;
      bucket.income  += income;
      bucket.checks  += 1;
    });
  }

  // 2. Агрегаты по аппаратам (текущий период)
  const machinesAgg = {};

  opsCurrent.forEach(op => {
    const devId = op.deviceId || '';
    const service = op.serviceType || '';

    if (!devId || !service) {
      console.warn('[Money] skip op without dev/service', op);
      return;
    }

    if (!machinesAgg[devId]) {
      machinesAgg[devId] = {
        id: devId,

        totalIncome: 0,
        totalRevenue: 0,
        totalChecks: 0,

        washerIncome: 0,
        washerRevenue: 0,
        washerChecks: 0,

        vacuumIncome: 0,
        vacuumRevenue: 0,
        vacuumChecks: 0,

        deliveryIncome: 0,
        deliveryRevenue: 0,
        deliveryChecks: 0,

        totalMarginPercent: null,
        washerMarginPercent: null,
        vacuumMarginPercent: null,
        deliveryMarginPercent: null,
      };
    }

    const mAgg = machinesAgg[devId];
    const revenue = Number(op.sum) || 0;
    const income  = Number(op.income) || 0;

    mAgg.totalRevenue += revenue;
    mAgg.totalIncome  += income;
    mAgg.totalChecks  += 1;

    if (service === 'WASHER_FLUID') {
      mAgg.washerRevenue += revenue;
      mAgg.washerIncome  += income;
      mAgg.washerChecks  += 1;

      servicesAgg.WASHER_FLUID.revenue += revenue;
      servicesAgg.WASHER_FLUID.income  += income;
      servicesAgg.WASHER_FLUID.checks  += 1;
      servicesAgg.WASHER_FLUID.devices.add(devId);
    } else if (service === 'VACUUM_CLEANER') {
      mAgg.vacuumRevenue += revenue;
      mAgg.vacuumIncome  += income;
      mAgg.vacuumChecks  += 1;

      servicesAgg.VACUUM_CLEANER.revenue += revenue;
      servicesAgg.VACUUM_CLEANER.income  += income;
      servicesAgg.VACUUM_CLEANER.checks  += 1;
      servicesAgg.VACUUM_CLEANER.devices.add(devId);
    } else if (service === 'TARGETED_DELIVERY') {
      mAgg.deliveryRevenue += revenue;
      mAgg.deliveryIncome  += income;
      mAgg.deliveryChecks  += 1;

      servicesAgg.TARGETED_DELIVERY.revenue += revenue;
      servicesAgg.TARGETED_DELIVERY.income  += income;
      servicesAgg.TARGETED_DELIVERY.checks  += 1;
      servicesAgg.TARGETED_DELIVERY.devices.add(devId);
    }
  });

  // 3. Маржа в %
  Object.values(machinesAgg).forEach(mAgg => {
    mAgg.totalMarginPercent =
      mAgg.totalRevenue > 0
        ? Math.round((mAgg.totalIncome / mAgg.totalRevenue) * 100)
        : null;

    mAgg.washerMarginPercent =
      mAgg.washerRevenue > 0
        ? Math.round((mAgg.washerIncome / mAgg.washerRevenue) * 100)
        : null;

    mAgg.vacuumMarginPercent =
      mAgg.vacuumRevenue > 0
        ? Math.round((mAgg.vacuumIncome / mAgg.vacuumRevenue) * 100)
        : null;

    mAgg.deliveryMarginPercent =
      mAgg.deliveryRevenue > 0
        ? Math.round((mAgg.deliveryIncome / mAgg.deliveryRevenue) * 100)
        : null;
  });

  // 4. Адреса
  const deviceIdsForLocations = Object.keys(machinesAgg).map(id =>
    id.replace('@omyvai.ru', '')
  );
  console.log('Loading locations for devices:', deviceIdsForLocations);

  const locations = await loadDeviceLocations(deviceIdsForLocations);
  console.log('Locations loaded:', locations);

  // 5. KPI по услугам с diff и totalDevices
  moneyServicesSummary = [
    {
      id: 'WASHER_FLUID',
      domService: 'washer',
      title: 'Стеклоомывающая жидкость',
      activeDevices: servicesConfigCount.WASHER_FLUID || 0,  // ✅ ПРАВИЛЬНО!
      totalDevices,
  
      income: servicesAgg.WASHER_FLUID.income,
      incomeDiff: calcDiffPercent(
        servicesAgg.WASHER_FLUID.income,
        prevServicesAgg.WASHER_FLUID.income
      ),
  
      revenue: servicesAgg.WASHER_FLUID.revenue,
      revenueDiff: calcDiffPercent(
        servicesAgg.WASHER_FLUID.revenue,
        prevServicesAgg.WASHER_FLUID.revenue
      ),
  
      margin: servicesAgg.WASHER_FLUID.income,
      marginDiff: calcDiffPercent(
        servicesAgg.WASHER_FLUID.income,
        prevServicesAgg.WASHER_FLUID.income
      ),
  
      checks: servicesAgg.WASHER_FLUID.checks,
      checksDiff: calcDiffPercent(
        servicesAgg.WASHER_FLUID.checks,
        prevServicesAgg.WASHER_FLUID.checks
      ),
  
      avgCheck:
        servicesAgg.WASHER_FLUID.checks > 0
          ? Math.round(
              servicesAgg.WASHER_FLUID.revenue /
              servicesAgg.WASHER_FLUID.checks
            )
          : 0,
      avgCheckDiff: calcDiffPercent(
        servicesAgg.WASHER_FLUID.checks > 0
          ? servicesAgg.WASHER_FLUID.revenue / servicesAgg.WASHER_FLUID.checks
          : 0,
        prevServicesAgg.WASHER_FLUID.checks > 0
          ? prevServicesAgg.WASHER_FLUID.revenue / prevServicesAgg.WASHER_FLUID.checks
          : 0
      ),
    },
    {
      id: 'VACUUM_CLEANER',
      domService: 'vacuum',
      title: 'Пылесос',
      activeDevices: servicesConfigCount.VACUUM_CLEANER || 0,  // ✅ ПРАВИЛЬНО!
      totalDevices,
  
      income: servicesAgg.VACUUM_CLEANER.income,
      incomeDiff: calcDiffPercent(
        servicesAgg.VACUUM_CLEANER.income,
        prevServicesAgg.VACUUM_CLEANER.income
      ),
  
      revenue: servicesAgg.VACUUM_CLEANER.revenue,
      revenueDiff: calcDiffPercent(
        servicesAgg.VACUUM_CLEANER.revenue,
        prevServicesAgg.VACUUM_CLEANER.revenue
      ),
  
      margin: servicesAgg.VACUUM_CLEANER.income,
      marginDiff: calcDiffPercent(
        servicesAgg.VACUUM_CLEANER.income,
        prevServicesAgg.VACUUM_CLEANER.income
      ),
  
      checks: servicesAgg.VACUUM_CLEANER.checks,
      checksDiff: calcDiffPercent(
        servicesAgg.VACUUM_CLEANER.checks,
        prevServicesAgg.VACUUM_CLEANER.checks
      ),
  
      avgCheck:
        servicesAgg.VACUUM_CLEANER.checks > 0
          ? Math.round(
              servicesAgg.VACUUM_CLEANER.revenue /
              servicesAgg.VACUUM_CLEANER.checks
            )
          : 0,
      avgCheckDiff: calcDiffPercent(
        servicesAgg.VACUUM_CLEANER.checks > 0
          ? servicesAgg.VACUUM_CLEANER.revenue / servicesAgg.VACUUM_CLEANER.checks
          : 0,
        prevServicesAgg.VACUUM_CLEANER.checks > 0
          ? prevServicesAgg.VACUUM_CLEANER.revenue / prevServicesAgg.VACUUM_CLEANER.checks
          : 0
      ),
    },
    {
      id: 'TARGETED_DELIVERY',
      domService: 'delivery',
      title: 'Адресная выдача',
      activeDevices: servicesConfigCount.TARGETED_DELIVERY || 0,  // ✅ ПРАВИЛЬНО!
      totalDevices,
  
      income: servicesAgg.TARGETED_DELIVERY.income,
      incomeDiff: calcDiffPercent(
        servicesAgg.TARGETED_DELIVERY.income,
        prevServicesAgg.TARGETED_DELIVERY.income
      ),
  
      revenue: servicesAgg.TARGETED_DELIVERY.revenue,
      revenueDiff: calcDiffPercent(
        servicesAgg.TARGETED_DELIVERY.revenue,
        prevServicesAgg.TARGETED_DELIVERY.revenue
      ),
  
      margin: servicesAgg.TARGETED_DELIVERY.income,
      marginDiff: calcDiffPercent(
        servicesAgg.TARGETED_DELIVERY.income,
        prevServicesAgg.TARGETED_DELIVERY.income
      ),
  
      checks: servicesAgg.TARGETED_DELIVERY.checks,
      checksDiff: calcDiffPercent(
        servicesAgg.TARGETED_DELIVERY.checks,
        prevServicesAgg.TARGETED_DELIVERY.checks
      ),
  
      avgCheck:
        servicesAgg.TARGETED_DELIVERY.checks > 0
          ? Math.round(
              servicesAgg.TARGETED_DELIVERY.revenue /
              servicesAgg.TARGETED_DELIVERY.checks
            )
          : 0,
      avgCheckDiff: calcDiffPercent(
        servicesAgg.TARGETED_DELIVERY.checks > 0
          ? servicesAgg.TARGETED_DELIVERY.revenue /
            servicesAgg.TARGETED_DELIVERY.checks
          : 0,
        prevServicesAgg.TARGETED_DELIVERY.checks > 0
          ? prevServicesAgg.TARGETED_DELIVERY.revenue /
            prevServicesAgg.TARGETED_DELIVERY.checks
          : 0
      ),
    },
  ];

  // 6. Таблица по аппаратам (только по текущему периоду)
  moneyMachines = Object.keys(machinesAgg).map(deviceId => {
    const agg = machinesAgg[deviceId];
    const deviceIdClean = deviceId.replace('@omyvai.ru', '');

    const baseMachine = machines.find(m => m.id === deviceIdClean);

    const lat = baseMachine?.lat ?? null;
    const lng = baseMachine?.lng ?? null;
    const status = baseMachine?.status ?? 'ok';
    const statusText = baseMachine?.statusText ?? 'Онлайн';

    const location = locations[deviceIdClean] || 'Адрес не указан';

    const deviceOps = opsCurrent.filter(
      op => op.deviceId === deviceId && op.startedAt
    );
    const sortedOps = deviceOps.sort((a, b) => {
      const timeA = a.startedAt ? a.startedAt.toMillis() : 0;
      const timeB = b.startedAt ? b.startedAt.toMillis() : 0;
      return timeB - timeA;
    });

    const lastOp = sortedOps[0];
    let lastOpTime = '';
    let lastOpService = '';
    let lastOpSum = 0;

    if (lastOp && lastOp.startedAt) {
      const date = lastOp.startedAt.toDate();
      console.log('[Money] lastOp for', deviceId, 'date =', date.toISOString());

      const now = new Date();
      const isToday = date.toDateString() === now.toDateString();

      if (isToday) {
        lastOpTime = date.toLocaleTimeString('ru-RU', {
          hour: '2-digit',
          minute: '2-digit',
        });
      } else {
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        const isYesterday =
          date.toDateString() === yesterday.toDateString();

        if (isYesterday) {
          lastOpTime =
            'Вчера ' +
            date.toLocaleTimeString('ru-RU', {
              hour: '2-digit',
              minute: '2-digit',
            });
        } else {
          lastOpTime =
            date.toLocaleDateString('ru-RU', {
              day: '2-digit',
              month: '2-digit',
            }) +
            ' ' +
            date.toLocaleTimeString('ru-RU', {
              hour: '2-digit',
              minute: '2-digit',
            });
        }
      }

      const serviceNames = {
        WASHER_FLUID: 'Стеклоомыватель',
        VACUUM_CLEANER: 'Пылесос',
        TARGETED_DELIVERY: 'Адресная',
      };

      lastOpService =
        serviceNames[lastOp.serviceType] || lastOp.serviceType;
      lastOpSum = Number(lastOp.sum) || 0;
    }

    return {
      id: deviceIdClean,
      location,
      lat,
      lng,

      totalIncome: agg.totalIncome,
      totalMarginPercent: agg.totalMarginPercent,
      totalRevenue: agg.totalRevenue,
      totalChecks: agg.totalChecks,

      washerIncome: agg.washerIncome,
      washerMarginPercent: agg.washerMarginPercent,
      washerRevenue: agg.washerRevenue,
      washerChecks: agg.washerChecks,

      vacuumIncome: agg.vacuumIncome,
      vacuumMarginPercent: agg.vacuumMarginPercent,
      vacuumRevenue: agg.vacuumRevenue,
      vacuumChecks: agg.vacuumChecks,

      deliveryIncome: agg.deliveryIncome,
      deliveryMarginPercent: agg.deliveryMarginPercent,
      deliveryRevenue: agg.deliveryRevenue,
      deliveryChecks: agg.deliveryChecks,

      status,
      statusText,
      lastOpTime,
      lastOpService,
      lastOpSum,
    };
  });

  moneyFilteredMachines = [...moneyMachines];

  console.log(
    '[Money] recalcMoneyAggregates done, moneyMachines =',
    moneyMachines.length
  );
  console.log('[DEBUG] after recalc, moneyMachines =', moneyMachines.length);
  console.log(
    '[DEBUG] after recalc, moneyFilteredMachines =',
    moneyFilteredMachines.length
  );
}

/**
 * Загружает модули для всех устройств клиента и подсчитывает, 
 * сколько устройств имеют каждую услугу
 * @param {Array<string>} deviceIds - массив ID устройств клиента
 * @returns {Promise<Object>} объект с подсчетом устройств по услугам
 */
async function loadServicesConfigForFleet(deviceIds) {
  console.log('[Money] loadServicesConfigForFleet', deviceIds);
  
  const servicesCount = {
    WASHER_FLUID: 0,
    VACUUM_CLEANER: 0,
    TARGETED_DELIVERY: 0
  };
  
  const rtdb = firebase.database();
  
  for (const deviceId of deviceIds) {
    try {
      // Убираем @omyvai.ru если есть
      const shortDeviceId = deviceId.replace('@omyvai.ru', '');
      
      // Загружаем модули устройства
      const modulesRef = rtdb.ref(`devices_setting/${shortDeviceId}/modules`);
      const snapshot = await modulesRef.once('value');
      const modules = snapshot.val();
      
      if (!modules) {
        console.warn(`[Money] No modules found for device ${deviceId}`);
        continue;
      }
      
      // Преобразуем в массив если это объект
      const modulesList = Array.isArray(modules) ? modules : Object.values(modules);
      
      console.log(`[Money] Device ${shortDeviceId} modules:`, modulesList);
      
      // Проверяем какие услуги подключены
      modulesList.forEach(module => {
        if (!module || !module.service_name) return;
        
        const serviceName = module.service_name;
        
        // Маппинг service_name из Firebase на serviceName в коде
        switch(serviceName) {
          case 'WASHER_FLUID':
            servicesCount.WASHER_FLUID++;
            break;
          case 'VACUUM_CLEANER':
            servicesCount.VACUUM_CLEANER++;
            break;
          case 'TARGETED_DELIVERY':
            servicesCount.TARGETED_DELIVERY++;
            break;
          default:
            console.warn(`[Money] Unknown service type: ${serviceName}`);
        }
      });
      
    } catch (e) {
      console.error(`[Money] Failed to load modules for device ${deviceId}`, e);
    }
  }
  
  console.log('[Money] services count by config:', servicesCount);
  return servicesCount;
}
