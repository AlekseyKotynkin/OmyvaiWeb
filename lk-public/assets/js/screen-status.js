/**
 * screen-status.js
 * Экран состояния парка устройств
 * - Загрузка статуса всех устройств
 * - KPI по связи, аппаратным проблемам, ПО
 * - Таблица парка с фильтрацией
 */

// ============================================================================
// ИМПОРТЫ
// ============================================================================
import {
    formatPercent,
    formatPingMs,
    formatSignalQuality,
    formatUptime,
    loadClientDevices,
    loadDeviceSettings,      
    buildAddress,            
    showLoadingIndicator,    
    hideLoadingIndicator,   
    showErrorMessage,
    LOG_REASON_DEFS        
  } from './basic.js';
  
  // ============================================================================
  // ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ
  // ============================================================================
  let fleetData = null; // { devices: [], latestVersion: '', totalDevices: 0 }
  let filteredFleetDevices = [];
  let presenceState = {};
  
  // ============================================================================
  // 1. ЗАГРУЗКА ДАННЫХ ПАРКА
  // ============================================================================
  
  /**
   * Загружает полный статус парка устройств
   * ПЕРЕНЕСТИ ИЗ: basic.js → loadFullFleetStatus()
   */
  export async function loadFullFleetStatus() {
    console.log('Loading full fleet status...');
    
    try {
        // 1. Получаем список всех устройств из devices_presence
        const presenceRef = firebase.database().ref('devices_presence');
        const presenceSnap = await presenceRef.once('value');
        const presenceData = presenceSnap.val();
        
        if (!presenceData) {
            console.warn('No devices presence data found');
            return {
                devices: [],
                latestVersion: 'unknown',
                totalDevices: 0
            };
        }
        
        // 2. Получаем последнюю версию ПО
        const latestVersion = await loadLatestSoftwareVersion();
        
        // 3. Загружаем детали для каждого устройства
        const deviceIds = Object.keys(presenceData);
        const devicesDetails = await Promise.all(
            deviceIds.map(deviceId => loadDeviceDetailsForFleet(deviceId, presenceData[deviceId]))
        );
        
        // Фильтруем null значения
        const validDevices = devicesDetails.filter(d => d !== null);
        
        console.log(`Loaded details for ${validDevices.length} devices`);
        
        return {
            devices: validDevices,
            latestVersion,
            totalDevices: validDevices.length
        };
    } catch (err) {
        console.error('Error loading full fleet status:', err);
        return {
            devices: [],
            latestVersion: 'unknown',
            totalDevices: 0
        };
    }
   }
  
  /**
   * Загружает последнюю версию ПО из Firestore
   * ПЕРЕНЕСТИ ИЗ: basic.js → loadLatestSoftwareVersion()
   */
  async function loadLatestSoftwareVersion() {
    try {
        const snapshot = await firebase.firestore()
            .collection('app_versions')
            .orderBy('releaseDate', 'desc')
            .limit(1)
            .get();

        if (snapshot.docs.length > 0) {
            return snapshot.docs[0].data().version;
        }
        return '0.0.1'; // Дефолтная версия
    } catch (err) {
        console.error('Error loading latest software version:', err);
        return '0.0.1';
    }
}
  
  /**
   * Загружает детальную информацию по устройству для парка
   * ПЕРЕНЕСТИ ИЗ: basic.js → loadDeviceDetailsForFleet()
   */
  async function loadDeviceDetailsForFleet(deviceId, presenceData) {
    try {
      const isOnline = presenceData.state === 'online';
      const lastPing = presenceData.last_changed || 0;
  
      const metrics  = await loadDeviceMetrics(deviceId);
      const settings = await loadDeviceSettings(deviceId);
      const issues   = await loadDeviceIssuesFromLogs(deviceId, 7);
  
      // Для ПО: uptime, reboots, memory
      let reboots7d = 0;
      let uptimeHours = 0;
      let uptimePercent = 0;
      let memoryUsage = 0;
  
      if (metrics) {
        memoryUsage = metrics.memoryUsagePercent || 0;
      }
  
      // Загружаем uptime и reboots
      try {
        const uptimeData = await calculateSoftwareUptime(deviceId, 7);
        reboots7d = uptimeData.reboots || 0;
        uptimeHours = uptimeData.hours || 0;
        uptimePercent = uptimeData.percent || 0;
      } catch (err) {
        console.warn('Failed to load software uptime for', deviceId, err);
      }
  
      const installationAddress = settings?.installation_address;
      const locationText = settings?.location || buildAddress(installationAddress) || 'Не указано';
  
      return {
        deviceId,
        location: locationText,
        isOnline,
        lastPing,
        pingMs: metrics?.lastPingMs || 0,
        uptime7d: metrics?.uptime7d ?? null,
        uptime30d: metrics?.uptime30d ?? null,
        disconnects7d: metrics?.disconnects7d ?? 0,
        softwareVersion: settings?.software_version || '0.0.0',
        criticalIssues: issues.filter(i => i.level === 'ERROR').length,
        warnings: issues.filter(i => i.level === 'WARNING').length,
        issues: issues.slice(0, 3),
        lat: installationAddress?.geo?.lat,
        lng: installationAddress?.geo?.lng,
        hoursToService: null,
        daysToService: null,
        // для software KPI:
        reboots7d,
        uptimeHours,
        uptimePercent,
        memoryUsage
      };
    } catch (err) {
      console.error('Error loading details for', deviceId, err);
      return null;
    }
}  
  
  /**
   * Загружает метрики устройства (uptime, ping, etc.)
   * ПЕРЕНЕСТИ ИЗ: basic.js → loadDeviceMetrics()
   */
  export async function loadDeviceMetrics(deviceId) {
    const db = firebase.firestore();
    const doc = await db.collection('devices_metrics').doc(deviceId).get();
    if (!doc.exists) return null;
    const data = doc.data();
    return data;
}
  
  /**
   * Загружает проблемы устройства из логов за N дней
   * ПЕРЕНЕСТИ ИЗ: basic.js → loadDeviceIssuesFromLogs()
   */

  async function loadDeviceIssuesFromLogs(deviceId, daysBack = 7) {
    try {
      const db = firebase.firestore();
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysBack);
  
      const snap = await db
        .collection("devices_presence_history")
        .doc(deviceId)
        .collection("events")
        .where("ts", ">", cutoffDate)
        .orderBy("ts", "desc")
        .limit(50)
        .get();
  
      const issues = [];
  
      snap.forEach(doc => {
        const mapped = mapPresenceEventToLog(doc); // уже есть в basic.js
        // фильтруем только error / warning
        if (mapped.type === "error" || mapped.type === "warning") {
          issues.push({
            level: mapped.type === "error" ? "ERROR" : "WARNING",
            component: mapped.component || "",
            message: mapped.message || "",
            timestamp: mapped.ts?.toDate ? mapped.ts.toDate() : null
          });
        }
      });
  
      // оставляем 3 последних для таблицы флота
      return issues.slice(0, 3);
    } catch (err) {
      console.error("Error loading issues for", deviceId, err);
      return [];
    }
}
  
  /**
   * Рассчитывает Software Uptime за период
   * ПЕРЕНЕСТИ ИЗ: basic.js → calculateSoftwareUptime()
   */
  export async function calculateSoftwareUptime(deviceId, daysBack = 7) {
    const db = firebase.firestore();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBack);
  
    const snap = await db
      .collection('devices_presence_history')
      .doc(deviceId)
      .collection('events')
      .where('ts', '>=', cutoffDate)
      .orderBy('ts', 'asc')
      .get();
  
    if (snap.empty) {
      return { hours: 0, percent: 0, errors: 0, reboots: 0 };
    }
  
    const events = [];
    snap.forEach(doc => {
      const data = doc.data();
      events.push({
        ts: data.ts?.toDate ? data.ts.toDate() : new Date(data.ts),
        reason: data.reason?.toString(),
        state: (data.state || data.status)?.toString()
      });
    });
  
    const totalMs = daysBack * 24 * 60 * 60 * 1000;
    const periodStart = cutoffDate;
    const periodEnd = new Date();
  
    let runningSince = null;
    let workedMs = 0;
  
    const isStart = (e) => e.state === 'online' || e.reason === 'app_resume';
    const isStop = (e) => e.state === 'offline' || e.reason === 'app_stop' || e.reason === 'app_unexpected' || e.reason === 'app_manual';
  
    for (const e of events) {
      if (isStart(e)) {
        if (!runningSince) {
          runningSince = e.ts < periodStart ? periodStart : e.ts;
        }
      } else if (isStop(e)) {
        if (runningSince) {
          const stopTs = e.ts > periodEnd ? periodEnd : e.ts;
          if (stopTs > runningSince) {
            workedMs += (stopTs - runningSince);
          }
          runningSince = null;
        }
      }
    }
  
    if (runningSince && runningSince <= periodEnd) {
      workedMs += (periodEnd - runningSince);
    }
  
    const hours = workedMs / (1000 * 60 * 60);
    const percent = (workedMs / totalMs) * 100;
  
    const periodEvents = events.filter(e => e.ts >= periodStart && e.ts <= periodEnd);
  
    // Считаем только ошибки с component === 'software'
    const errorsCount = periodEvents.filter(e => {
      const def = LOG_REASON_DEFS[e.reason] || LOG_REASON_DEFS.default;
      return def.type === 'error' && def.componentLabel === 'software';
    }).length;
  
    const rebootsCount = periodEvents.filter(e => e.reason === 'app_resume').length;
  
    return {
      hours: Math.round(hours),
      percent: Math.round(percent),
      errors: errorsCount,
      reboots: rebootsCount
    };
}  
  
  // ============================================================================
  // 2. ИНИЦИАЛИЗАЦИЯ ЭКРАНА
  // ============================================================================
  
  /**
   * Инициализирует экран состояния парка
   * ПЕРЕНЕСТИ ИЗ: basic.js → initStatusScreen()
   */
  export async function initStatusScreen() { 
    console.log('Initializing status screen...');

    showLoadingIndicator();

    try {
        // 1. грузим общее состояние парка
        fleetData = await loadFullFleetStatus();          // {devices, latestVersion, totalDevices} [file:6]
        filteredFleetDevices = [...fleetData.devices];

        // 2. рендерим KPI‑карточки
        renderConnectionKPI(fleetData);
        renderHardwareKPI(fleetData);
        renderSoftwareKPI(fleetData);

        // 3. рендерим таблицу аппаратов
        renderFleetTable(filteredFleetDevices);

        // 4. фильтры и поиск
        setupStatusScreenFilters();

        // 5. подписка на обновления presence
        subscribeToFleetPresence();

    } catch (err) {
        console.error('Error initializing status screen:', err);
        showErrorMessage('Ошибка загрузки данных. Пожалуйста, обновите страницу.');
    } finally {
        hideLoadingIndicator();
    }
  }
  
  /**
   * Рендерит HTML экрана состояния
   * ПЕРЕНЕСТИ ИЗ: basic.js → renderStatusScreen()
   */
  export function renderStatusScreen() {
    return `
    <!-- ========== БЛОК 2: PAGE TITLE ========== -->
    <div class="main-top">
        <div>
            <div class="main-title">Состояние</div>
            <div class="main-subtitle">
                Техническое состояние и работоспособность всех аппаратов.
            </div>
        </div>
    </div>

    <!-- ========== БЛОК 3: KPI КАРТОЧКИ (3 штуки) ========== -->
    <section class="kpi-row">

        <!-- БЛОК 3.1: Карточка "Связь" -->
        <article class="kpi-card" data-category="connection">
            <div class="kpi-badge">—</div>
            <div class="kpi-title">Связь</div>
        
            <div class="kpi-main-metric">
                <div class="kpi-main-metric-label">Онлайн</div>
                <div class="kpi-main-metric-row">
                    <div class="kpi-main-metric-value">—</div>
                    <div class="kpi-main-metric-diff"></div>
                </div>
            </div>
        
            <div class="kpi-metric">
                <div class="kpi-metric-label">Последний пинг</div>
                <div class="kpi-metric-content">
                    <div class="kpi-metric-value">—</div>
                    <div class="kpi-metric-diff"></div>
                </div>
            </div>
        
            <div class="kpi-metric">
                <div class="kpi-metric-label">Uptime 7 дней</div>
                <div class="kpi-metric-content">
                    <div class="kpi-metric-value">—</div>
                    <div class="kpi-metric-diff"></div>
                </div>
            </div>
        
            <div class="kpi-metric">
                <div class="kpi-metric-label">Uptime 30 дней</div>
                <div class="kpi-metric-content">
                    <div class="kpi-metric-value">—</div>
                    <div class="kpi-metric-diff"></div>
                </div>
            </div>
        
            <div class="kpi-metric">
                <div class="kpi-metric-label">Обрывы связи (7д)</div>
                <div class="kpi-metric-content">
                    <div class="kpi-metric-value">—</div>
                    <div class="kpi-metric-diff"></div>
                </div>
            </div>
        </article>
      
        <!-- БЛОК 3.2: Карточка "Оборудование" -->
        <article class="kpi-card" data-category="hardware">
            <div class="kpi-badge">—</div>
            <div class="kpi-title">Оборудование</div>
        
            <div class="kpi-main-metric">
                <div class="kpi-main-metric-label">Текущий статус узлов</div>
                <div class="kpi-main-metric-row">
                    <div class="kpi-main-metric-value">—</div>
                    <div class="kpi-main-metric-diff"></div>
                </div>
            </div>
        
            <div class="kpi-metric">
                <div class="kpi-metric-label">Критические за сутки / 7 дн</div>
                <div class="kpi-metric-content">
                    <div class="kpi-metric-value">—</div>
                    <div class="kpi-metric-diff"></div>
                </div>
            </div>
        
            <div class="kpi-metric">
                <div class="kpi-metric-label">Предупреждения за сутки / 7 дн</div>
                <div class="kpi-metric-content">
                    <div class="kpi-metric-value">—</div>
                    <div class="kpi-metric-diff"></div>
                </div>
            </div>
        
            <div class="kpi-metric">
                <div class="kpi-metric-label">Сервисные события за сутки / 7 дн</div>
                <div class="kpi-metric-content">
                    <div class="kpi-metric-value">—</div>
                    <div class="kpi-metric-diff"></div>
                </div>
            </div>
        
            <div class="kpi-metric">
                <div class="kpi-metric-label">До обслуживания</div>
                <div class="kpi-metric-content">
                    <div class="kpi-metric-value">—</div>
                    <div class="kpi-metric-diff"></div>
                </div>
            </div>
        </article>      

        <!-- БЛОК 3.3: Карточка "ПО" -->
        <article class="kpi-card" data-category="software">
            <div class="kpi-badge">—</div>
            <div class="kpi-title">Программное обеспечение</div>
        
            <div class="kpi-main-metric">
                <div class="kpi-main-metric-label">Статус обновлений</div>
                <div class="kpi-main-metric-row">
                    <div class="kpi-main-metric-value">—</div>
                    <div class="kpi-main-metric-diff"></div>
                </div>
            </div>
        
            <div class="kpi-metric">
                <div class="kpi-metric-label">Ошибки (7 дней)</div>
                <div class="kpi-metric-content">
                    <div class="kpi-metric-value">—</div>
                    <div class="kpi-metric-diff"></div>
                </div>
            </div>
        
            <div class="kpi-metric">
                <div class="kpi-metric-label">Перезагрузки (7 дней)</div>
                <div class="kpi-metric-content">
                    <div class="kpi-metric-value">—</div>
                    <div class="kpi-metric-diff"></div>
                </div>
            </div>
        
            <div class="kpi-metric">
                <div class="kpi-metric-label">Время работы</div>
                <div class="kpi-metric-content">
                    <div class="kpi-metric-value">—</div>
                    <div class="kpi-metric-diff"></div>
                </div>
            </div>
        
            <div class="kpi-metric">
                <div class="kpi-metric-label">Использование памяти</div>
                <div class="kpi-metric-content">
                    <div class="kpi-metric-value">—</div>
                    <div class="kpi-metric-diff"></div>
                </div>
            </div>
        </article>
    </section>

    <!-- ========== БЛОК 4: ТАБЛИЦА АППАРАТОВ ========== -->
    <section class="table-section">
        
        <!-- БЛОК 4.1: Заголовок таблицы + фильтры -->
        <div class="table-header">
            <div class="table-title">Аппараты</div>
            <div class="table-controls">
                Фильтр:
                <select class="select" id="filter-select">
                    <option value="all">Все</option>
                    <option value="offline">Только офлайн</option>
                    <option value="critical">Критичные проблемы</option>
                    <option value="warnings">С предупреждениями</option>
                    <option value="outdated">Устаревшее ПО</option>
                </select>
                <input class="search-input" placeholder="Поиск по ID или локации" />
            </div>
        </div>

        <!-- БЛОК 4.2: Таблица с данными -->
        <div class="table-scroll">
            <table>
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Локация</th>
                        <th>Статус связи</th>
                        <th>Последний пинг</th>
                        <th>Uptime 7д</th>
                        <th>Uptime 30д</th>
                        <th>Проблемы</th>
                        <th>Версия ПО</th>
                        <th>Действия</th>
                    </tr>
                </thead>
                <tbody>
                    <!-- строки будут добавлены renderFleetTable(...) -->
                </tbody>
            </table>
        </div>

    </section>
    `;
}
  
  // ============================================================================
  // 3. KPI КАРТОЧКИ
  // ============================================================================
  
  /**
   * Рендерит KPI карточку "Связь"
   * ПЕРЕНЕСТИ ИЗ: basic.js → renderConnectionKPI()
   */
  function renderConnectionKPI(fleetData) {
    const kpi = calculateConnectionKPI(fleetData.devices);
    const card = document.querySelector('.kpi-card[data-category="connection"]');
    if (!card) return;
  
    const badge = card.querySelector('.kpi-badge');
    if (badge) {
      badge.textContent = kpi.total + ' ' + pluralize(kpi.total, 'аппарат', 'аппарата', 'аппаратов');
    }
  
    const mainValue = card.querySelector('.kpi-main-metric-value');
    if (mainValue) {
      mainValue.textContent = `${kpi.online} из ${kpi.total}`;
    }
  
    updateKPIMetric(card, 'Последний пинг', kpi.avgPing != null ? `${kpi.avgPing} мс` : '—');
    updateKPIMetric(card, 'Uptime 7 дней', `${kpi.avgUptime7d} %`);
    updateKPIMetric(card, 'Uptime 30 дней', `${kpi.avgUptime30d} %`);
    updateKPIMetric(card, 'Обрывы связи (7д)', `${kpi.disconnects7dTotal} раз`);
}   
  
  /**
   * Рендерит KPI карточку "Аппаратные проблемы"
   * ПЕРЕНЕСТИ ИЗ: basic.js → renderHardwareKPI()
   */
  function renderHardwareKPI(fleetData) {
    const kpi = calculateHardwareKPI(fleetData.devices);
    const card = document.querySelector('.kpi-card[data-category="hardware"]');
    if (!card) return;
  
    const badge = card.querySelector('.kpi-badge');
    if (badge) {
      badge.textContent = kpi.total + ' ' + pluralize(kpi.total, 'аппарат', 'аппарата', 'аппаратов');
    }
  
    // Основной статус
    const mainValue = card.querySelector('.kpi-main-metric-value');
    if (mainValue) {
      mainValue.textContent = kpi.overallStatus;
    }
  
    // Критические за сутки / 7 дн
    updateKPIMetric(card, 'Критические за сутки / 7 дн', `${kpi.critLastDay} / ${kpi.critLast7d}`);
  
    // Предупреждения за сутки / 7 дн
    updateKPIMetric(card, 'Предупреждения за сутки / 7 дн', `${kpi.warnLastDay} / ${kpi.warnLast7d}`);
  
    // Сервисные события за сутки / 7 дн
    updateKPIMetric(card, 'Сервисные события за сутки / 7 дн', `${kpi.serviceLastDay} / ${kpi.serviceLast7d}`);
  
    // До обслуживания
    updateKPIMetric(card, 'До обслуживания', `${kpi.avgHoursToService} ч · ≈ ${kpi.avgDaysToService} дн`);
}  
  
  /**
   * Рендерит KPI карточку "ПО"
   * ПЕРЕНЕСТИ ИЗ: basic.js → renderSoftwareKPI()
   */
  function renderSoftwareKPI(fleetData) {
    const kpi = calculateSoftwareKPI(fleetData.devices, fleetData.latestVersion);
    const card = document.querySelector('.kpi-card[data-category="software"]');
    if (!card) return;
  
    const badge = card.querySelector('.kpi-badge');
    if (badge) {
      badge.textContent = kpi.total + ' ' + pluralize(kpi.total, 'аппарат', 'аппарата', 'аппаратов');
    }
  
    // Основной статус
    const mainValue = card.querySelector('.kpi-main-metric-value');
    if (mainValue) {
      mainValue.textContent = kpi.statusText;
    }
  
    // Ошибки (7 дней)
    updateKPIMetric(card, 'Ошибки (7 дней)', `${kpi.errors7dTotal} раз`);
  
    // Перезагрузки (7 дней)
    updateKPIMetric(card, 'Перезагрузки (7 дней)', `${kpi.reboots7dTotal} раз`);
  
    // Время работы
    updateKPIMetric(card, 'Время работы', `${kpi.avgUptimeHours} ч · ${kpi.avgUptimePercent} %`);
  
    // Использование памяти
    updateKPIMetric(card, 'Использование памяти', `${kpi.avgMemoryUsage} %`);
}  
  
  /**
   * Обновляет метрику в KPI карточке
   * ПЕРЕНЕСТИ ИЗ: basic.js → updateKPIMetric()
   */
  function updateKPIMetric(card, label, value) {
    const metrics = card.querySelectorAll('.kpi-metric');
    for (const metric of metrics) {
        const metricLabel = metric.querySelector('.kpi-metric-label');
        if (metricLabel && metricLabel.textContent.trim() === label) {
            const valueEl = metric.querySelector('.kpi-metric-value');
            if (valueEl) valueEl.textContent = value != null ? String(value) : '—';
            break;
        }
    }
}
  
  // ============================================================================
  // 4. РАСЧЁТ KPI
  // ============================================================================
  
  /**
   * Рассчитывает KPI по связи
   * ПЕРЕНЕСТИ ИЗ: basic.js → calculateConnectionKPI()
   */
  function calculateConnectionKPI(devices) {
    const total = devices.length;
    if (total === 0) {
      return { total: 0, online: 0, offline: 0, avgUptime7d: 0, avgUptime30d: 0, avgPing: 0, disconnects7dTotal: 0 };
    }
  
    const online = devices.filter(d => d.isOnline).length;
    const offline = total - online;
  
    // uptime 7
    const validUptime7d = devices.map(d => d.uptime7d).filter(u => u != null && u !== undefined);
    const avgUptime7d = validUptime7d.length > 0
      ? (validUptime7d.reduce((sum, u) => sum + u, 0) / validUptime7d.length).toFixed(1)
      : '0';
  
    // uptime 30
    const validUptime30d = devices.map(d => d.uptime30d).filter(u => u != null && u !== undefined);
    const avgUptime30d = validUptime30d.length > 0
      ? (validUptime30d.reduce((sum, u) => sum + u, 0) / validUptime30d.length).toFixed(1)
      : '0';
  
    // пинг
    const validPings = devices.filter(d => d.isOnline && d.pingMs > 0).map(d => d.pingMs);
    const avgPing = validPings.length > 0
      ? Math.round(validPings.reduce((sum, p) => sum + p, 0) / validPings.length)
      : 0;
  
    // обрывы связи за 7 дней (суммарно по всем устройствам)
    const disconnects7dTotal = devices.reduce((sum, d) => sum + (d.disconnects7d || 0), 0);
  
    return {
      total,
      online,
      offline,
      avgUptime7d,
      avgUptime30d,
      avgPing,
      disconnects7dTotal  // добавляем
    };
} 
  
  /**
   * Рассчитывает KPI по аппаратным проблемам
   * ПЕРЕНЕСТИ ИЗ: basic.js → calculateHardwareKPI()
   */
  function calculateHardwareKPI(devices) {
    const total = devices.length;
  
    if (total === 0) {
      return {
        total: 0,
        overallStatus: 'Нет данных',
        critLastDay: 0,
        critLast7d: 0,
        warnLastDay: 0,
        warnLast7d: 0,
        serviceLastDay: 0,
        serviceLast7d: 0,
        avgHoursToService: 0,
        avgDaysToService: 0
      };
    }
  
    const noIssues = devices.filter(d => d.criticalIssues === 0 && d.warnings === 0).length;
    const critical = devices.filter(d => d.criticalIssues > 0).length;
    const warnings = devices.filter(d => d.criticalIssues === 0 && d.warnings > 0).length;
  
    // Статус: если есть критические — проблема, иначе все в норме
    let overallStatus = 'Все основные узлы в норме';
    if (critical > 0) {
      overallStatus = `Критичные проблемы на ${critical} из ${total}`;
    } else if (warnings > 0) {
      overallStatus = `Предупреждения на ${warnings} из ${total}`;
    }
  
    // Для подсчёта событий за сутки/7 дн нужны логи по каждому устройству
    // Если device.issues уже содержит события за 7 дней, можно разделить их по timestamp
  
    let critLastDay = 0;
    let critLast7d = 0;
    let warnLastDay = 0;
    let warnLast7d = 0;
    let serviceLastDay = 0;
    let serviceLast7d = 0;
  
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
  
    devices.forEach(device => {
      if (!device.issues) return;
      
      device.issues.forEach(issue => {
        const issueTime = issue.timestamp ? issue.timestamp.getTime() : 0;
        
        if (issue.level === 'ERROR') {
          critLast7d++;
          if (issueTime >= oneDayAgo) critLastDay++;
        } else if (issue.level === 'WARNING') {
          warnLast7d++;
          if (issueTime >= oneDayAgo) warnLastDay++;
        } else {
          // сервисные события (info/debug)
          serviceLast7d++;
          if (issueTime >= oneDayAgo) serviceLastDay++;
        }
      });
    });
  
    // До обслуживания: пока заглушка, реальные данные из devices_maintenance
    const avgHoursToService = 200;
    const avgDaysToService = Math.round(avgHoursToService / 8);
  
    return {
      total,
      overallStatus,
      critLastDay,
      critLast7d,
      warnLastDay,
      warnLast7d,
      serviceLastDay,
      serviceLast7d,
      avgHoursToService,
      avgDaysToService
    };
}  
  
  /**
   * Рассчитывает KPI по ПО
   * ПЕРЕНЕСТИ ИЗ: basic.js → calculateSoftwareKPI()
   */
  function calculateSoftwareKPI(devices, latestVersion) {
    const total = devices.length;
  
    if (total === 0) {
      return {
        total: 0,
        needsUpdate: 0,
        statusText: 'Нет данных',
        errors7dTotal: 0,
        reboots7dTotal: 0,
        avgUptimeHours: 0,
        avgUptimePercent: 0,
        avgMemoryUsage: 0
      };
    }
  
    const upToDate = devices.filter(d => d.softwareVersion === latestVersion).length;
    const needsUpdate = total - upToDate;
  
    // Формируем текст: сколько требуют обновления из общего числа
    let statusText = `${needsUpdate} из ${total}`;
  
    const errors7dTotal = devices.reduce((sum, d) => {
      if (!d.issues) return sum;
      return sum + d.issues.filter(i => {
        const comp = (i.component || '').toLowerCase();
        return i.level === 'ERROR' && comp === 'software';
      }).length;
    }, 0);
  
    const reboots7dTotal = devices.reduce((sum, d) => sum + (d.reboots7d || 0), 0);
  
    const validUptimes = devices.filter(d => d.uptimeHours != null);
    const avgUptimeHours = validUptimes.length > 0
      ? Math.round(validUptimes.reduce((sum, d) => sum + d.uptimeHours, 0) / validUptimes.length)
      : 0;
  
    const validPercents = devices.filter(d => d.uptimePercent != null);
    const avgUptimePercent = validPercents.length > 0
      ? Math.round(validPercents.reduce((sum, d) => sum + d.uptimePercent, 0) / validPercents.length)
      : 0;
  
    const validMemory = devices.filter(d => d.memoryUsage != null && d.memoryUsage > 0);
    const avgMemoryUsage = validMemory.length > 0
      ? Math.round(validMemory.reduce((sum, d) => sum + d.memoryUsage, 0) / validMemory.length)
      : 0;
  
    return {
      total,
      needsUpdate,
      statusText,  // "0 из 1" если все актуальны, "1 из 1" если все требуют обновления
      errors7dTotal,
      reboots7dTotal,
      avgUptimeHours,
      avgUptimePercent,
      avgMemoryUsage
    };
}  
  
  // ============================================================================
  // 5. ТАБЛИЦА ПАРКА
  // ============================================================================
  
  /**
   * Рендерит таблицу парка устройств
   * ПЕРЕНЕСТИ ИЗ: basic.js → renderFleetTable()
   */
  function renderFleetTable(devices) {
    const tbody = document.querySelector('.table-section tbody');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (devices.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="9" style="text-align:center;padding:40px;color:var(--text-muted);">
              Нет данных по аппаратам
            </td>
          </tr>`;
        return;
    }

    devices.forEach(device => {
        const row = createDeviceRow(device);
        tbody.appendChild(row);
    });

    console.log('Rendered', devices.length, 'devices in table');
}
  
  /**
   * Создаёт строку для устройства в таблице
   * ПЕРЕНЕСТИ ИЗ: basic.js → createDeviceRow()
   */
  function createDeviceRow(device) {
    const row = document.createElement('tr');
    
    // Статус связи
    const statusClass = device.isOnline ? 'status-ok' : 'status-error';
    const statusText = device.isOnline ? 'Онлайн' : 'Офлайн';
    
    // Время последнего пинга
    const lastPingText = formatLastPing(device.lastPing);
    const timeSinceText = formatTimeSince(device.lastPing);
    const pingColor = device.pingMs > 100 ? '#f97316' : 'var(--text-muted)';
    
    // Uptime цвета
    const uptime7dColor = getUptimeColor(device.uptime7d);
    const uptime30dColor = getUptimeColor(device.uptime30d);
    
    // Проблемы
    const issuesHtml = device.issues.length > 0
        ? device.issues.map(issue => {
            const badgeClass = issue.level === 'ERROR' ? 'issue-critical' : 'issue-warning';
            return `<span class="issue-badge ${badgeClass}">${issue.component || issue.message}</span>`;
        }).join('')
        : `<div style="font-size: 10px; color: var(--text-muted);">Нет проблем</div>`;
    
    // Версия ПО
    const versionColor = device.softwareVersion === fleetData.latestVersion ? '#22c55e' : '#f97316';
    const versionStatus = device.softwareVersion === fleetData.latestVersion ? 'Актуальная' : 'Требует обновления';
    const versionStatusColor = device.softwareVersion === fleetData.latestVersion ? 'var(--text-muted)' : '#f97316';
    
    row.innerHTML = `
        <td class="col-id">${device.deviceId}</td>
        <td class="col-location">
            <div class="location-cell">
                <span>${device.location || 'Не указано'}</span>
                ${device.lat && device.lng ? `
                    <button class="map-btn" title="Открыть на карте" 
                            onclick="openMap(${device.lat}, ${device.lng}, '${device.location}')">📍</button>
                ` : ''}
            </div>
        </td>
        <td><span class="status-pill ${statusClass}">${statusText}</span></td>
        <td>
            <div style="font-weight: 600;">${lastPingText}</div>
            <div style="font-size: 10px; color: ${pingColor};">${timeSinceText}</div>
        </td>
        <td>
            <div style="font-weight: 600; color: ${uptime7dColor};">${formatUptime(device.uptime7d)}</div>
        </td>
        <td>
            <div style="font-weight: 600; color: ${uptime30dColor};">${formatUptime(device.uptime30d)}</div>
        </td>
        <td>${issuesHtml}</td>
        <td>
            <div style="font-weight: 600; color: ${versionColor};">v${device.softwareVersion}</div>
            <div style="font-size: 10px; color: ${versionStatusColor};">${versionStatus}</div>
        </td>
        <td>
            <button class="link-more-button" onclick="showProblems('${device.deviceId}')">Подробнее</button>
        </td>
    `;
    
    return row;
}
  
  // ============================================================================
  // 6. ФИЛЬТРАЦИЯ И ПОИСК
  // ============================================================================
  
  /**
   * Настраивает фильтры для экрана состояния
   * ПЕРЕНЕСТИ ИЗ: basic.js → setupStatusScreenFilters()
   */
  function setupStatusScreenFilters() {
    const filterSelect = document.querySelector('#filter-select');
    const searchInput = document.querySelector('.table-section .search-input');
    const periodSelect = document.querySelector('#state-period');
    
    if (filterSelect) {
        filterSelect.addEventListener('change', applyFleetFilters);
    }
    
    if (searchInput) {
        searchInput.addEventListener('input', applyFleetFilters);
    }
    
    if (periodSelect) {
        periodSelect.addEventListener('change', (e) => {
            console.log('Period changed:', e.target.value);
            // TODO: Перезагрузить данные за выбранный период
        });
    }
}
  
  /**
   * Применяет фильтры к парку устройств
   * ПЕРЕНЕСТИ ИЗ: basic.js → applyFleetFilters()
   */
  function applyFleetFilters() {
    if (!fleetData || !fleetData.devices) return;
    
    const filterSelect = document.querySelector('#filter-select');
    const searchInput = document.querySelector('.table-section .search-input');
    
    const filterType = filterSelect?.value || 'all';
    const searchTerm = (searchInput?.value || '').toLowerCase().trim();
    
    // Фильтруем устройства
    filteredFleetDevices = fleetData.devices.filter(device => {
        // Поиск по ID или локации
        const matchesSearch = !searchTerm || 
            device.deviceId.toLowerCase().includes(searchTerm) ||
            (device.location && device.location.toLowerCase().includes(searchTerm));
        
        if (!matchesSearch) return false;
        
        // Применяем фильтр по типу
        switch (filterType) {
            case 'offline':
                return !device.isOnline;
            
            case 'critical':
                return device.criticalIssues > 0;
            
            case 'warnings':
                return device.warnings > 0 && device.criticalIssues === 0;
            
            case 'outdated':
                return device.softwareVersion !== fleetData.latestVersion;
            
            case 'all':
            default:
                return true;
        }
    });
    
    console.log(`Filtered devices: ${filteredFleetDevices.length} of ${fleetData.devices.length}`);
    
    // Перерисовываем таблицу
    renderFleetTable(filteredFleetDevices);
}
  
  // ============================================================================
  // 7. ФОРМАТИРОВАНИЕ ДАННЫХ
  // ============================================================================
  
  /**
   * Форматирует время последнего пинга
   * ПЕРЕНЕСТИ ИЗ: basic.js → formatLastPing()
   */
  export function formatLastPing(timestamp) {
    if (!timestamp) return '—';
    
    const now = Date.now();
    const diff = now - timestamp;
    const date = new Date(timestamp);
    
    // Если сегодня - показываем время
    const today = new Date();
    if (date.toDateString() === today.toDateString()) {
        return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    }
    
    // Если вчера
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
        return `Вчера ${date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
    }
    
    // Если давно - показываем дату
    return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
}
  
  /**
   * Форматирует время с момента последнего пинга
   * ПЕРЕНЕСТИ ИЗ: basic.js → formatTimeSince()
   */
  function formatTimeSince(timestamp) {
    if (!timestamp) return 'Нет данных';
    
    const now = Date.now();
    const diff = now - timestamp;
    
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (seconds < 60) return `${seconds} сек`;
    if (minutes < 60) return `${minutes} мин`;
    if (hours < 24) return `${hours} ч`;
    return `${days} дн`;
}
 
  /**
   * Возвращает класс для цвета uptime
   * ПЕРЕНЕСТИ ИЗ: basic.js → getUptimeColorClass()
   */
  function getUptimeColor(uptime) {
    if (uptime === null || uptime === undefined) return '#ef4444';
    if (uptime >= 98) return '#22c55e';
    if (uptime >= 95) return '#f97316';
    return '#ef4444';
}
  
  // ============================================================================
  // 8. ПОДПИСКА НА ОБНОВЛЕНИЯ (REALTIME)
  // ============================================================================
  
  /**
   * Подписывается на обновления presence парка
   * ПЕРЕНЕСТИ ИЗ: basic.js → subscribeToFleetPresence()
   */
  function subscribeToFleetPresence() {
    if (!fleetData || !fleetData.devices) return;
    console.log("Subscribing to fleet presence updates...");
  
    fleetData.devices.forEach(device => {
      const presenceRef = firebase.database().ref(`devices_presence/${device.deviceId}`);
  
      presenceRef.on('value', snapshot => {
        const presence = snapshot.val();
        if (!presence) return;
  
        const deviceInList = fleetData.devices.find(d => d.deviceId === device.deviceId);
        if (deviceInList) {
          const wasOnline = deviceInList.isOnline;
          deviceInList.isOnline = presence.state === 'online';
          deviceInList.lastPing = presence.last_changed || 0;        
  
          if (wasOnline !== deviceInList.isOnline) {
            console.log(`${device.deviceId} was ${wasOnline ? 'online' : 'offline'} now ${deviceInList.isOnline ? 'online' : 'offline'}`);
          }
  
          applyFleetFilters();
          renderConnectionKPI(fleetData); // ✅ правильное имя
        }
      });
    });
}
  
  /**
   * Загружает последнее событие presence для устройства
   * ПЕРЕНЕСТИ ИЗ: basic.js → fetchLastPresenceEvent()
   */
  async function fetchLastPresenceEvent(deviceId) {
    const db = firebase.firestore();
    const snapshot = await db
      .collection('devices_presence_history')
      .doc(deviceId)
      .collection('events')
      .orderBy('ts', 'desc')
      .limit(1)
      .get();
  
    if (snapshot.empty) return null;
  
    const doc = snapshot.docs[0];
    const data = doc.data();
  
    return {
      id: doc.id,
      state: data.state,
      reason: data.reason,
      ts: data.ts
    };
}
  
  /**
   * Предзагружает историю presence для устройств
   * ПЕРЕНЕСТИ ИЗ: basic.js → preloadPresenceHistory()
   */
  async function preloadPresenceHistory(deviceIds) {
    const promises = deviceIds.map(async (id) => {
        const lastEvent = await fetchLastPresenceEvent(id);
        if (!presenceState[id]) presenceState[id] = {};
        presenceState[id].lastEvent = lastEvent;
    });
    await Promise.all(promises);
}
  
  // ============================================================================
  // 9. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
  // ============================================================================
  
  /**
   * Маппит событие presence в формат лога
   * ПЕРЕНЕСТИ ИЗ: basic.js → mapPresenceEventToLog()
   */
  function mapPresenceEventToLog(doc) {
    const data = doc.data();
    const def = LOG_REASON_DEFS[data.reason] || LOG_REASON_DEFS.default;

    const message =
        (data.comment && data.comment.trim()) ||
        def.message;

    return {
        id: doc.id,
        ts: data.ts,
        type: def.type,               // info / warning / error / debug
        component: def.componentLabel, // уже готовый текст для колонки "Компонент"
        message,
    };
}
  
  /**
   * Pluralize для русского языка
   * ПЕРЕНЕСТИ ИЗ: basic.js → pluralize()
   */
  function pluralize(count, one, few, many) {
    const mod10 = count % 10;
    const mod100 = count % 100;
    
    if (mod10 === 1 && mod100 !== 11) return one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
    return many;
}
  
  /**
   * Обновляет таблицы устройств (callback)
   * ПЕРЕНЕСТИ ИЗ: basic.js → rerenderDevicesTables()
   */
  export function rerenderDevicesTables() {
    console.log('🔄 Updating devices tables...');
    
    try {
      if (typeof renderFleetTable === 'function' && filteredFleetDevices.length > 0) {
        renderFleetTable(filteredFleetDevices); // ⭐ Используй локальную переменную
      }
    } catch (e) {
      console.warn('Failed to render fleet table', e);
    }
    
    try {
      if (fleetData) {
        renderConnectionKPI(fleetData);
        renderHardwareKPI(fleetData);
        renderSoftwareKPI(fleetData);
      }
    } catch (e) {
      console.warn('Failed to update KPI', e);
    }
  }
  
  