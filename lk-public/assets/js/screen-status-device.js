/**
 * screen-status-device.js
 * Детальный экран состояния конкретного устройства
 * - KPI по связи, аппаратным проблемам, ПО
 * - Логи устройства с фильтрацией
 * - Метрики и статистика
 */

// ============================================================================
// ИМПОРТЫ
// ============================================================================
import {
  formatPercent,
  formatPingMs,
  formatSignalQuality,
  LOG_REASON_DEFS,
  HARDWARE_STATUS_THRESHOLDS
} from './basic.js';
// Общие функции из screen-status.js
import {
  loadDeviceMetrics,
  calculateSoftwareUptime
} from './screen-status.js';

// ============================================================================
// ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ
// ============================================================================
let currentLogs = [];
let presenceState = {};

/**
 * Кеш для последней версии (чтобы не загружать при каждом обновлении)
 */
let latestVersionCache = {
  version: null,
  timestamp: null,
  ttl: 5 * 60 * 1000, // 5 минут
};

// ============================================================================
// 1. ЗАГРУЗКА ЛОГОВ
// ============================================================================

/**
 * Загружает логи устройства за период
 * @param {string} deviceId - ID устройства
 * @param {number} limit - Максимальное количество логов (по умолчанию 200)
 * @returns {Promise<void>}
 */
export async function loadDeviceLogs(deviceId, limit = 200) {
    console.log('[StatusDevice] 📥 Loading logs for', deviceId, 'limit', limit);
    
    const db = firebase.firestore();
    
    try {
      const snap = await db
        .collection('devices_presence_history')
        .doc(deviceId)
        .collection('events')
        .orderBy('ts', 'desc')
        .limit(limit)
        .get();
      
      if (snap.empty) {
        console.log('[StatusDevice] No logs found');
        currentLogs = [];
        renderLogsTable();
        return;
      }
      
      currentLogs = snap.docs.map(mapPresenceEventToLogDevice);
      
      console.log('[StatusDevice] ✅ Loaded', currentLogs.length, 'logs');
      
      // Рендерим таблицу логов
      renderLogsTable();
      
    } catch (error) {
      console.error('[StatusDevice] ❌ Failed to load logs', error);
      currentLogs = [];
      renderLogsTable();
    }
}
  
  /**
   * Маппит событие presence из Firestore в формат лога
   * @param {Object} doc - Firestore документ
   * @returns {Object} Объект лога { id, ts, type, component, message, reason }
   */
  function mapPresenceEventToLogDevice(doc) {
    const data = doc.data();
    
    // Получаем определение лога из LOGREASONDEFS
    const def = LOG_REASON_DEFS[data.reason] || LOG_REASON_DEFS['default'];
    
    // Формируем сообщение: если есть комментарий, используем его, иначе из определения
    const message = data.comment 
      ? data.comment.trim() 
      : def.message;
    
    return {
      id: doc.id,
      ts: data.ts, // Firestore Timestamp
      type: def.type, // 'info', 'warning', 'error', 'debug'
      component: def.componentLabel, // '📱 Приложение', '🔧 Оборудование', etc.
      message: message,
      reason: data.reason // Сохраняем оригинальный reason для отладки
    };
  } 
  
  // ============================================================================
  // 2. ОТОБРАЖЕНИЕ ЛОГОВ
  // ============================================================================
  
  /**
   * Рендерит таблицу логов
   * ПЕРЕНЕСТИ ИЗ: basic.js → renderLogsTable()
   */
  export function renderLogsTable() {
    const tbody = document.querySelector('.logs-table tbody');
    if (!tbody) return;

    const typeFilter = document.getElementById('log-type-filter')?.value || 'all';
    const componentFilter = document.getElementById('log-component-filter')?.value || 'all';
    const pageSize = parseInt(document.getElementById('log-page-size')?.value || '50', 10);
    const searchInput = document.querySelector('.logs-controls .search-input');
    const searchValue = (searchInput?.value || '').toLowerCase();

    let logs = currentLogs.slice();

    if (typeFilter !== 'all') {
        logs = logs.filter(l => l.type === typeFilter);
    }
    if (componentFilter !== 'all') {
        logs = logs.filter(l => {
            switch (componentFilter) {
                case 'connection': return l.component === 'Связь';
                case 'software': return l.component === 'ПО';
                case 'pump': return l.component === 'Насосы';
                case 'sensor': return l.component === 'Датчики';
                case 'heater': return l.component === 'Нагреватель';
                case 'payment': return l.component === 'Платежи';
                default: return true;
            }
        });
    }
    if (searchValue) {
        logs = logs.filter(l =>
            (l.message || '').toLowerCase().includes(searchValue)
        );
    }

    logs = logs.slice(0, pageSize);

    const rowsHtml = logs.map(log => {
        const { date, time } = formatLogTime(log.ts);
    
        const typeClass = {
            error: 'log-error',
            warning: 'log-warning',
            info: 'log-info',
            debug: 'log-debug'
        }[log.type] || 'log-info';
    
        const typeLabel = log.type.toUpperCase();
    
        return `
            <tr>
                <td>
                    <div style="font-weight: 600;">${date}</div>
                    <div style="font-size: 10px; color: var(--text-muted);">${time}</div>
                </td>
                <td><span class="log-badge ${typeClass}">${typeLabel}</span></td>
                <td style="font-weight: 600;">${log.component}</td>
                <td>${log.message}</td>
            </tr>
        `;
    }).join('');

    tbody.innerHTML = rowsHtml || `
        <tr>
            <td colspan="5" style="text-align:center; color: var(--text-muted); padding: 16px;">
                Записей не найдено по выбранным фильтрам
            </td>
        </tr>
    `;
   }
  
  /**
   * Форматирует время лога
   * @param {Object} ts - Firestore Timestamp
   * @returns {Object} { date, time }
   */
  function formatLogTime(ts) {
    const d = ts.toDate();
    const date = d.toLocaleDateString('ru-RU');
    const time = d.toLocaleTimeString('ru-RU', { hour12: false });
    return { date, time };
}
  
  /**
   * Инициализирует фильтры логов
   * ПЕРЕНЕСТИ ИЗ: basic.js → initLogsControls()
   */
  export function initLogsControls() { 
    const typeSelect = document.getElementById('log-type-filter');
    const componentSelect = document.getElementById('log-component-filter');
    const pageSizeSelect = document.getElementById('log-page-size');
    const searchInput = document.querySelector('.logs-controls .search-input');

    [typeSelect, componentSelect, pageSizeSelect].forEach(el => {
        if (!el) return;
        el.addEventListener('change', renderLogsTable);
    });

    if (searchInput) {
        searchInput.addEventListener('input', renderLogsTable);
    }
  }
  
  /**
   * Скачивает логи в CSV
   * ПЕРЕНЕСТИ ИЗ: basic.js → downloadLogs()
   */
  export function downloadLogs() { 
    const csvHeader = 'id;ts;type;component;message\n';
    const csvBody = currentLogs.map(l =>
        `${l.id};${l.ts.toDate().toISOString()};${l.type};${l.component};"${(l.message || '').replace(/"/g, '""')}"`
    ).join('\n');

    const blob = new Blob([csvHeader + csvBody], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'logs.csv';
    a.click();
    URL.revokeObjectURL(url);
  }
  
  // ============================================================================
  // 3. KPI КАРТОЧКИ - CONNECTION
  // ============================================================================
  
  /**
   * Обновляет KPI карточку "Связь"
   * ПЕРЕНЕСТИ ИЗ: basic.js → renderDeviceConnectionKpi()
   */
  export async function renderDeviceConnectionKpi(presence, deviceId) {
    const card = document.querySelector('.kpi-card[data-category="connection"]');
    if (!card) return;

    const statusEl = card.querySelector('.kpi-main-metric-value');
    const state = presence?.state || 'offline';
    statusEl.classList.remove('kpi-status-online', 'kpi-status-offline');
    card.classList.remove('kpi-online', 'kpi-offline');

    if (state === 'online') {
        statusEl.textContent = 'Онлайн';
        statusEl.classList.add('kpi-status-online');
        card.classList.add('kpi-online');
    } else {
        statusEl.textContent = 'Офлайн';
        statusEl.classList.add('kpi-status-offline');
        card.classList.add('kpi-offline');
    }

    const m = await loadDeviceMetrics(deviceId);
    if (!m) return;

    const prev = await loadLastMetricsSnapshot(deviceId);
    const prevPing = prev?.lastPingMs;
    const pingDiff = (m.lastPingMs != null && prevPing != null)
        ? m.lastPingMs - prevPing
        : null;

    const metrics = card.querySelectorAll('.kpi-metric');

    // 0. Последний пинг
    {
        const valueEl = metrics[0]?.querySelector('.kpi-metric-value');
        const diffEl  = metrics[0]?.querySelector('.kpi-metric-diff');
        if (valueEl) valueEl.textContent = formatPingMs(m.lastPingMs);

        if (diffEl) {
            const visualDiff = pingDiff != null ? -pingDiff : null;
            applyDiff(diffEl, visualDiff);
        }
    }

    // 1. Uptime 7 дней
    {
        const valueEl = metrics[1]?.querySelector('.kpi-metric-value');
        const diffEl  = metrics[1]?.querySelector('.kpi-metric-diff');
        if (valueEl) valueEl.textContent = formatPercent(m.uptime7d);
        applyDiff(diffEl, m.deltaUptime7d);
    }

    // 2. Uptime 30 дней
    {
        const valueEl = metrics[2]?.querySelector('.kpi-metric-value');
        const diffEl  = metrics[2]?.querySelector('.kpi-metric-diff');
        if (valueEl) valueEl.textContent = formatPercent(m.uptime30d);
        applyDiff(diffEl, m.deltaUptime30d);
    }

    // 3. Обрывы связи (7д)
    {
        const valueEl = metrics[3]?.querySelector('.kpi-metric-value');
        const diffEl  = metrics[3]?.querySelector('.kpi-metric-diff');
        if (valueEl) valueEl.textContent = (m.disconnects7d ?? '—') + ' раз';
        applyDiff(diffEl, -m.deltaDisconnects7d);
    }

    // 4. Качество сигнала
    {
        const valueEl = metrics[4]?.querySelector('.kpi-metric-value');
        if (valueEl) valueEl.textContent = formatSignalQuality(m.signalQuality);
    }
   }
  
  /**
   * Подписывается на обновления presence устройства
   * ПЕРЕНЕСТИ ИЗ: basic.js → subscribeDevicePresence()
   */
  export function subscribeDevicePresence(deviceId) { 
    const rtdb = firebase.database();
    const ref = rtdb.ref('devices_presence/' + deviceId);
    ref.on('value', (snap) => {
        const data = snap.val() || {};
        presenceState[deviceId] = data;
        renderDeviceConnectionKpi(data, deviceId);
    });
  }
 
  /**
   * Загружает последний снимок метрик
   * ПЕРЕНЕСТИ ИЗ: basic.js → loadLastMetricsSnapshot()
   */
async function loadLastMetricsSnapshot(deviceId) {
    const db = firebase.firestore();
    const snap = await db
      .collection('devices_metrics_history')
      .doc(deviceId)
      .collection('snapshots')
      .orderBy('snapshotAt', 'desc')
      .limit(1)
      .get();
  
    if (snap.empty) return null;
    return snap.docs[0].data();
}

  /**
   * Применяет diff к элементу метрики
   * @param {HTMLElement} el - Элемент для обновления
   * @param {number} diff - Разница значения
   */
  function applyDiff(el, diff) {
    if (!el) return;
    if (diff == null) {
      el.textContent = '—';
      el.classList.remove('positive', 'negative');
      return;
    }
    const sign = diff > 0 ? '+' : '';
    el.textContent = sign + diff.toFixed(2); // или 1 знак
    el.classList.toggle('positive', diff >= 0);
    el.classList.toggle('negative', diff < 0);
}
  
  // ============================================================================
  // 4. KPI КАРТОЧКИ - HARDWARE
  // ============================================================================
  
  /**
   * Обновляет KPI карточку "Аппаратные проблемы"
   * ПЕРЕНЕСТИ ИЗ: basic.js → updateHardwareKpiCard()
   */
  export function updateHardwareKpiCard(machineId) {
    console.log('Updating hardware KPI for machine:', machineId);

    // Получаем логи для машины (предполагается, что они уже загружены в currentLogs)
    const logs = currentLogs || [];

    // Рассчитываем статистику за 7 дней и 24 часа
    const stats7d = aggregateHardwareStats(logs, 7);
    const stats24h = aggregateHardwareStats(logs, 1);

    // Определяем общий статус за 7 дней
    const overallStatus = calculateHardwareStatus(logs);

    // Находим KPI-карточку оборудования
    const hwCard = document.querySelector('.kpi-card[data-category="hardware"]');
    if (!hwCard) {
        console.warn('Hardware KPI card not found');
        return;
    }

    // 1. Обновляем общий статус (главная метрика)
    const mainValue = hwCard.querySelector('.kpi-main-metric-value');
    if (mainValue) {
        mainValue.textContent = overallStatus.label;
        mainValue.className = 'kpi-main-metric-value ' + overallStatus.class;
    }

    // 2. Обновляем текущий статус узлов (анализируем последние ошибки)
    const currentStatusValue = hwCard.querySelectorAll('.kpi-metric-value')[0];
    if (currentStatusValue) {
        const recentErrors = stats24h.errorsList.slice(-3); // Последние 3 ошибки за сутки
        if (recentErrors.length > 0) {
            const components = recentErrors.map(log => {
                const def = LOG_REASON_DEFS[log.reason];
                return def ? def.message : 'Неизвестная проблема';
            }).join(', ');
            currentStatusValue.textContent = `Проблемы: ${components}`;
            currentStatusValue.style.color = '#e74c3c';
        } else {
            currentStatusValue.textContent = 'Все основные узлы в норме';
            currentStatusValue.style.color = '#27ae60';
        }
    }

    // 3. Критические ошибки за сутки / 7 дн
    const criticalValue = hwCard.querySelectorAll('.kpi-metric-value')[1];
    if (criticalValue) {
        criticalValue.textContent = `${stats24h.errors} / ${stats7d.errors}`;
        criticalValue.style.color = stats24h.errors > 0 ? '#e74c3c' : '#7f8c8d';
    }

    // 4. Предупреждения за сутки / 7 дн
    const warningsValue = hwCard.querySelectorAll('.kpi-metric-value')[2];
    if (warningsValue) {
        warningsValue.textContent = `${stats24h.warnings} / ${stats7d.warnings}`;
        warningsValue.style.color = stats24h.warnings > 0 ? '#f39c12' : '#7f8c8d';
    }

    // 5. Сервисные события за сутки / 7 дн
    const serviceValue = hwCard.querySelectorAll('.kpi-metric-value')[3];
    if (serviceValue) {
        serviceValue.textContent = `${stats24h.info} / ${stats7d.info}`;
    }

    // 6. До обслуживания (загружаем из devices_maintenance)
    const maintenanceValue = hwCard.querySelectorAll('.kpi-metric-value')[4];
    if (maintenanceValue) {
        // Загружаем данные обслуживания
        loadDeviceMaintenanceSummary(machineId)
            .then(maintenanceData => {
                const status = formatMaintenanceStatus(maintenanceData);
                maintenanceValue.textContent = status.text;
                maintenanceValue.style.color = status.color;
                
                // Опционально: добавляем класс для стилизации
                if (status.class) {
                    maintenanceValue.className = 'kpi-metric-value ' + status.class;
                }
                
                console.log('Maintenance status updated:', status);
            })
            .catch(error => {
                console.error('Failed to update maintenance status:', error);
                maintenanceValue.textContent = '— · ошибка загрузки';
                maintenanceValue.style.color = '#ef4444';
            });
    }
   }
  
  /**
   * Агрегирует статистику аппаратных проблем за период
   * ПЕРЕНЕСТИ ИЗ: basic.js → aggregateHardwareStats()
   */
  function aggregateHardwareStats(logs, periodDays) {
    const now = Date.now();
    const periodMs = periodDays * 24 * 60 * 60 * 1000;
    const startTime = now - periodMs;

    // Фильтруем логи за период
    const periodLogs = logs.filter(log => {
        const logTime = log.ts?.toMillis ? log.ts.toMillis() : log.ts;
        return logTime >= startTime;
    });

    // Фильтруем только оборудование
    const hwLogs = periodLogs.filter(log => {
        const def = LOG_REASON_DEFS[log.reason] || LOG_REASON_DEFS.default;
        return def.componentLabel === 'Оборудование';
    });

    // Разделяем по типам
    const errors = hwLogs.filter(log => {
        const def = LOG_REASON_DEFS[log.reason];
        return def && def.type === 'error';
    });

    const warnings = hwLogs.filter(log => {
        const def = LOG_REASON_DEFS[log.reason];
        return def && def.type === 'warning';
    });

    const info = hwLogs.filter(log => {
        const def = LOG_REASON_DEFS[log.reason];
        return def && def.type === 'info';
    });

    return {
        total: hwLogs.length,
        errors: errors.length,
        warnings: warnings.length,
        info: info.length,
        errorsList: errors,
        warningsList: warnings,
        infoList: info,
    };
}
  
  /**
   * Рассчитывает общий статус оборудования
   * ПЕРЕНЕСТИ ИЗ: basic.js → calculateHardwareStatus()
   */
  function calculateHardwareStatus(logs7days) {
    // Фильтруем только логи оборудования за 7 дней
    const hwLogs = logs7days.filter(log => {
        const def = LOG_REASON_DEFS[log.reason] || LOG_REASON_DEFS.default;
        return def.componentLabel === 'Оборудование';
    });

    // Считаем ошибки и предупреждения
    const errors = hwLogs.filter(log => {
        const def = LOG_REASON_DEFS[log.reason];
        return def && def.type === 'error';
    }).length;

    const warnings = hwLogs.filter(log => {
        const def = LOG_REASON_DEFS[log.reason];
        return def && def.type === 'warning';
    }).length;

    // Определяем статус по порогам
    if (errors >= HARDWARE_STATUS_THRESHOLDS.ERROR_CRITICAL) {
        return {
            status: 'critical',
            label: 'Критично',
            class: 'kpi-status-critical',
            errors: errors,
            warnings: warnings,
        };
    }

    if (errors > 0 || warnings >= HARDWARE_STATUS_THRESHOLDS.WARNING_HIGH) {
        return {
            status: 'warning',
            label: 'Есть предупреждения',
            class: 'kpi-status-warning',
            errors: errors,
            warnings: warnings,
        };
    }

    if (warnings >= HARDWARE_STATUS_THRESHOLDS.WARNING_LOW) {
        return {
            status: 'attention',
            label: 'Внимание',
            class: 'kpi-status-attention',
            errors: errors,
            warnings: warnings,
        };
    }

    return {
        status: 'ok',
        label: 'Норма',
        class: 'kpi-status-ok',
        errors: errors,
        warnings: warnings,
    };
}
  
  /**
   * Загружает данные обслуживания устройства
   * ПЕРЕНЕСТИ ИЗ: basic.js → loadDeviceMaintenanceSummary()
   */
  async function loadDeviceMaintenanceSummary(deviceId) {
    try {
        const ref = firebase.database().ref(`devices_maintenance/${deviceId}/_summary`);
        const snapshot = await ref.once('value');
        const data = snapshot.val();
        
        if (!data) {
            console.warn('Нет данных обслуживания для', deviceId);
            return null;
        }
        
        console.log('Loaded maintenance data for', deviceId, data);
        return data;
    } catch (error) {
        console.error('Ошибка загрузки данных обслуживания для', deviceId, error);
        return null;
    }
}
  
  /**
   * Форматирует статус обслуживания
   * ПЕРЕНЕСТИ ИЗ: basic.js → formatMaintenanceStatus()
   */
  function formatMaintenanceStatus(maintenanceData) {
    if (!maintenanceData) {
        return {
            text: '— · данные не загружены',
            color: '#95a5a6',
            class: '',
        };
    }
    
    const hoursLeft = parseFloat(maintenanceData.hours_left || 0);
    let daysLeft = parseInt(maintenanceData.estimated_days_left || 0);
    
    // Пороги для определения статуса
    const THRESHOLD_CRITICAL = 24;    // < 24 часов - критично (красный)
    const THRESHOLD_WARNING = 72;     // < 72 часов (3 дня) - скоро (жёлтый)
    const QUARTERLY_HOURS = 90 * 8;   // 90 дней * 8 часов работы в день = 720 часов
    
    // Если просрочено
    if (hoursLeft <= 0) {
        return {
            text: '0 ч · обслуживание просрочено',
            color: '#ef4444',  // красный
            class: 'kpi-metric-critical',
        };
    }
    
    // Критично (< 24 часов)
    if (hoursLeft < THRESHOLD_CRITICAL) {
        return {
            text: `${Math.round(hoursLeft)} ч · срочно`,
            color: '#ef4444',  // красный
            class: 'kpi-metric-critical',
        };
    }
    
    // Скоро обслуживание (24-72 часа)
    if (hoursLeft < THRESHOLD_WARNING) {
        return {
            text: `${Math.round(hoursLeft)} ч · ≈ ${Math.ceil(hoursLeft / 24)} дн`,
            color: '#f59e0b',  // жёлтый
            class: 'kpi-metric-warning',
        };
    }
    
    // Если estimated_days_left = 0, но часов много - пересчитываем
    if (daysLeft === 0 && hoursLeft > 0) {
        // Если часов больше квартала (720 ч), показываем символ бесконечности
        if (hoursLeft >= QUARTERLY_HOURS) {
            return {
                text: `${Math.round(hoursLeft)} ч · ∞`,
                color: '#22c55e',  // зелёный
                class: 'kpi-metric-ok',
            };
        }
        
        // Иначе считаем дни из расчёта 8 часов работы в день
        const estimatedDays = Math.floor(hoursLeft / 8);
        
        if (estimatedDays > 0) {
            return {
                text: `${Math.round(hoursLeft)} ч · ≈ ${estimatedDays} дн`,
                color: '#22c55e',
                class: 'kpi-metric-ok',
            };
        }
        
        // Если меньше 8 часов, но больше 3 (порог warning уже прошли)
        return {
            text: `${Math.round(hoursLeft)} ч · < 1 дн`,
            color: '#22c55e',
            class: 'kpi-metric-ok',
        };
    }
    
    // Норма (зелёный) - есть корректное значение daysLeft
    return {
        text: `${Math.round(hoursLeft)} ч · ≈ ${daysLeft} дн`,
        color: '#22c55e',  // зелёный
        class: 'kpi-metric-ok',
    };
}
  
  // ============================================================================
  // 5. KPI КАРТОЧКИ - SOFTWARE
  // ============================================================================
  
  /**
   * Обновляет KPI карточку "ПО"
   * ПЕРЕНЕСТИ ИЗ: basic.js → updateSoftwareKpiCard()
   */
  export async function updateSoftwareKpiCard(machineId) {
    console.log('Updating software KPI for machine:', machineId);
  
    let appVersion = 'Неизвестно';
    let latestVersionInfo = null;
  
    try {
      const swCard = document.querySelector('.kpi-card[data-category="software"]');
      if (!swCard) {
        console.warn('Software KPI card not found');
        return;
      }
  
      // 1. Версия ПО
      try {
        const versionRef = firebase.database().ref(`devices_setting/${machineId}/software_version`);
        const versionSnap = await versionRef.once('value');
        appVersion = versionSnap.val() || 'Неизвестно';
      } catch (error) {
        console.error('Failed to load app version:', error);
      }
  
      const versionValue = swCard.querySelector('.kpi-main-metric-value');
      if (versionValue) {
        versionValue.textContent = appVersion !== 'Неизвестно' ? `v${appVersion}` : 'Неизвестно';
      }
  
      // 2. Статус обновлений
      const updateStatus = swCard.querySelectorAll('.kpi-metric-value')[0];
      if (updateStatus) {
        try {
          latestVersionInfo = await fetchLatestVersion();
          const latestVersion = latestVersionInfo.version;
  
          const comparison = compareVersions(appVersion, latestVersion);
  
          if (comparison >= 0) {
            updateStatus.textContent = 'Актуальная';
            updateStatus.style.color = '#22c55e';
            updateStatus.style.cursor = 'default';
            updateStatus.style.textDecoration = 'none';
            updateStatus.onclick = null;
          } else {
            updateStatus.textContent = `Доступна v${latestVersion}`;
            updateStatus.style.color = '#f59e0b';
  
            if (latestVersionInfo.downloadUrl) {
              updateStatus.style.cursor = 'pointer';
              updateStatus.style.textDecoration = 'underline';
              updateStatus.title = `Кликните для скачивания версии ${latestVersion}`;
  
              updateStatus.onclick = () => {
                let downloadUrl = latestVersionInfo.downloadUrl;
  
                const viewMatch = downloadUrl.match(/\/file\/d\/([^\/]+)\//);
                if (viewMatch) {
                  const fileId = viewMatch[1];
                  downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
                }
  
                console.log('Opening update download:', downloadUrl);
                window.open(downloadUrl, '_blank');
              };
            }
          }
        } catch (error) {
          console.warn('Failed to check update status:', error);
          updateStatus.textContent = 'Неизвестно';
          updateStatus.style.color = '#95a5a6';
          updateStatus.style.cursor = 'default';
          updateStatus.style.textDecoration = 'none';
          updateStatus.onclick = null;
        }
      }
  
      // 3–5. Статистика по ПО за 7 дней из devices_presence_history
      let uptime = null;
      try {
        uptime = await calculateSoftwareUptime(machineId, 7);
      } catch (e) {
        console.warn('Failed to calculate software uptime:', e);
        uptime = { hours: 0, percent: 0, errors: 0, reboots: 0 };
      }
  
      // 3. Ошибки ПО за 7 дней
      const errorsValue = swCard.querySelectorAll('.kpi-metric-value')[1];
      const errorsDiff  = swCard.querySelectorAll('.kpi-metric-diff')[0];
      if (errorsValue) {
        errorsValue.textContent = `${uptime.errors} раз`;
      }
      if (errorsDiff) {
        errorsDiff.textContent = uptime.errors === 0 ? '0' : `+${uptime.errors}`;
        errorsDiff.className = uptime.errors === 0
          ? 'kpi-metric-diff positive'
          : 'kpi-metric-diff negative';
      }
  
      // 4. Перезагрузки за 7 дней
      const rebootsValue = swCard.querySelectorAll('.kpi-metric-value')[2];
      const rebootsDiff  = swCard.querySelectorAll('.kpi-metric-diff')[1];
      if (rebootsValue) {
        rebootsValue.textContent = `${uptime.reboots} раз`;
      }
      if (rebootsDiff) {
        rebootsDiff.textContent = '0';
        rebootsDiff.className = 'kpi-metric-diff positive';
      }
  
      // 5. Время работы за 7 дней
      const uptimeValue = swCard.querySelectorAll('.kpi-metric-value')[3];
      if (uptimeValue) {
        if (!uptime || uptime.hours === 0) {
          uptimeValue.textContent = '—';
        } else {
          uptimeValue.textContent = `${uptime.hours} ч · ${uptime.percent} %`;
        }
      }
  
      // 6. Использование памяти
      const memoryValue = swCard.querySelectorAll('.kpi-metric-value')[4];
      if (memoryValue) {
        try {
          const metrics = await loadDeviceMetrics(machineId);
          const memoryPercent = metrics?.memoryUsagePercent ?? null;
  
          if (memoryPercent !== null) {
            memoryValue.textContent = `${Math.round(memoryPercent)} %`;
  
            if (memoryPercent >= 90) {
              memoryValue.style.color = '#ef4444';
            } else if (memoryPercent >= 75) {
              memoryValue.style.color = '#f59e0b';
            } else {
              memoryValue.style.color = '#22c55e';
            }
          } else {
            memoryValue.textContent = '—';
            memoryValue.style.color = '#95a5a6';
          }
        } catch (error) {
          console.warn('Failed to load memory metrics:', error);
          memoryValue.textContent = '—';
          memoryValue.style.color = '#95a5a6';
        }
      }
  
      console.log('Software KPI updated:', {
        currentVersion: appVersion,
        latestVersion: latestVersionInfo?.version || 'unknown',
        errors7d: uptime.errors,
        reboots7d: uptime.reboots,
        hours7d: uptime.hours,
        uptimePercent7d: uptime.percent,
      });
  
    } catch (error) {
      console.error('Error updating software KPI:', error);
    }
   }
   
  /**
   * Загружает последнюю версию ПО из Firestore
   * ПЕРЕНЕСТИ ИЗ: basic.js → fetchLatestVersion()
   */
  async function fetchLatestVersion() {
    try {
      const now = Date.now();
      
      // 1. Проверяем кэш (5 минут)
      if (latestVersionCache.version && 
          latestVersionCache.timestamp && 
          now - latestVersionCache.timestamp < latestVersionCache.ttl) {
        console.log('Using cached latest version:', latestVersionCache.version);
        return latestVersionCache.version;
      }
  
      console.log('Fetching latest version from Firestore...');
      
      // 2. Получаем последнюю версию из Firestore
      const db = firebase.firestore();
      const snapshot = await db
        .collection('app_versions')
        .orderBy('releaseDate', 'desc')
        .limit(1)
        .get();
  
      if (snapshot.empty) {
        throw new Error('No versions found in Firestore');
      }
  
      // 3. Парсим данные
      const doc = snapshot.docs[0];
      const data = doc.data();
      
      const versionInfo = {
        version: data.version || '0.0.1',
        downloadUrl: data.downloadUrl || null,
        releaseDate: data.releaseDate?.toDate() || new Date(),
        fetchedAt: new Date().toISOString(),
      };
  
      // 4. Сохраняем в кэш
      latestVersionCache.version = versionInfo;
      latestVersionCache.timestamp = now;
  
      console.log('Latest version loaded from Firestore:', versionInfo);
      return versionInfo;
      
    } catch (error) {
      console.error('Failed to fetch latest version from Firestore:', error);
      
      // 5. Fallback: возвращаем из кэша если есть, иначе дефолт
      if (latestVersionCache.version) {
        console.warn('Using stale cache due to fetch error');
        return latestVersionCache.version;
      }
      
      return {
        version: '0.0.1', // Fallback
        downloadUrl: null,
        error: error.message,
      };
    }
}
  
  /**
   * Сравнивает версии ПО
   * ПЕРЕНЕСТИ ИЗ: basic.js → compareVersions()
   */
  function compareVersions(v1, v2) {
    if (!v1 || v1 === 'Неизвестно') return -1;
    if (!v2) return 0;

    const parts1 = v1.replace(/^v/, '').split('.').map(Number);
    const parts2 = v2.replace(/^v/, '').split('.').map(Number);

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
        const p1 = parts1[i] || 0;
        const p2 = parts2[i] || 0;

        if (p1 > p2) return 1;
        if (p1 < p2) return -1;
    }

    return 0;
}
  
  /**
   * Рассчитывает uptime из логов
   * ПЕРЕНЕСТИ ИЗ: basic.js → calculateUptime()
   */
  function calculateUptime(logs) {
    if (!logs || logs.length === 0) return null;

    // Находим последний app_start или app_resume
    const sortedLogs = [...logs].sort((a, b) => {
        const timeA = a.ts?.toMillis ? a.ts.toMillis() : a.ts;
        const timeB = b.ts?.toMillis ? b.ts.toMillis() : b.ts;
        return timeB - timeA; // сортировка по убыванию (новые сверху)
    });

    const lastStart = sortedLogs.find(log => 
        log.reason === 'app_start' || log.reason === 'app_resume'
    );

    if (!lastStart) return null;

    const startTime = lastStart.ts?.toMillis ? lastStart.ts.toMillis() : lastStart.ts;
    const now = Date.now();
    const uptimeMs = now - startTime;
    const uptimeHours = Math.floor(uptimeMs / (1000 * 60 * 60));

    return uptimeHours;
}
  
  // ============================================================================
  // 6. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
  // ============================================================================
  
  /**
   * Показывает детали лога
   * @param {string} logId - ID лога
   */
  export function showLogDetails(logId) {
    const log = currentLogs.find(l => l.id === logId);
    if (!log) return;
    console.log('Log details:', log);
    // здесь потом сделаем модалку
   }
  
  // ============================================================================
  // 7. РЕГИСТРАЦИЯ ГЛОБАЛЬНЫХ ФУНКЦИЙ
  // ============================================================================
  
  if (typeof window !== 'undefined') {
    window.downloadLogs = downloadLogs;
    window.showLogDetails = showLogDetails;
  }
  