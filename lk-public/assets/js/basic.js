import { initMoneyScreen } from './screen-money.js';

import { initMainScreen } from './screen-machine.js';

import {
  loadOperations,
  renderOperationsTable,
  showServicePricingTab,
  renderWasherPricingTable,
  savePricePosition,
  deletePosition,
  switchSeason,
  showAddPositionModal,
  closeAddPositionModal,
  confirmAddPosition,
  initRecipeInputs
} from './screen-money-device.js';

import {
  initStatusScreen,
  renderStatusScreen,
  loadFullFleetStatus,
  rerenderDevicesTables,
  formatLastPing
} from './screen-status.js';

import {
  loadDeviceLogs,
  renderLogsTable,
  initLogsControls,
  downloadLogs,
  updateHardwareKpiCard,
  updateSoftwareKpiCard,
  subscribeDevicePresence
} from './screen-status-device.js';

import { initStockDeviceScreen } from './screen-stock-device.js';

import { reloadStockData, renderStockKPI, initStockScreen } from './screen-stock.js';

import { renderBonusScreen, initBonusScreen } from './screen-bonus.js';

// Словарь для Журнал логов
let currentLogs = [];

// Агрегация по аппаратам (таблица) — пока пусто
let moneyMachines = [];
let moneyFilteredMachines = [];
// ============================================
// КОНСТАНТЫ ДЛЯ ОЦЕНКИ СОСТОЯНИЯ ОБОРУДОВАНИЯ
// ============================================
export const HARDWARE_STATUS_THRESHOLDS = {
    ERROR_CRITICAL: 3,      // >= 3 ошибок за 7 дней → Критично
    WARNING_HIGH: 5,        // >= 5 предупреждений → Есть предупреждения
    WARNING_LOW: 1,         // >= 1 предупреждения → Внимание
};

// Определения типов логов 
export const LOG_REASON_DEFS = {
    // === СВЯЗЬ (app_*) ===
    app_start: {
        type: 'info',
        componentLabel: 'Связь',
        message: 'Приложение запущено',
    },

    app_resume: {
        type: 'info',
        componentLabel: 'Связь',
        message: 'Приложение восстановило работу',
    },

    app_stop: {
        type: 'error',
        componentLabel: 'Связь',
        message: 'Приложение выключено',
    },

    app_unexpected: {
        type: 'error',
        componentLabel: 'Связь',
        message: 'Неожиданное завершение работы',
    },

    app_heartbeat: {
        type: 'debug',
        componentLabel: 'Связь',
        message: 'Heartbeat отправлен',
    },

    app_high_ping: {
        type: 'warning',
        componentLabel: 'Связь',
        message: 'Высокий пинг',
    },

    app_connection_lost: {
        type: 'error',
        componentLabel: 'Связь',
        message: 'Потеря соединения с сервером',
    },

    app_connection_restored: {
        type: 'info',
        componentLabel: 'Связь',
        message: 'Соединение восстановлено',
    },

    // === ОБОРУДОВАНИЕ (hw_*) ===
    hw_pump_failure: {
        type: 'error',
        componentLabel: 'Оборудование',
        message: 'Отказ насоса',
    },

    hw_pump_no_pressure: {
        type: 'error',
        componentLabel: 'Оборудование',
        message: 'Нет давления в системе',
    },

    hw_sensor_error: {
        type: 'error',
        componentLabel: 'Оборудование',
        message: 'Ошибка датчика',
    },

    hw_payment_offline: {
        type: 'error',
        componentLabel: 'Оборудование',
        message: 'Терминал оплаты не отвечает',
    },

    hw_nfc_error: {
        type: 'error',
        componentLabel: 'Оборудование',
        message: 'Ошибка NFC модуля',
    },

    hw_arduino_disconnected: {
        type: 'error',
        componentLabel: 'Оборудование',
        message: 'Потеря связи с контроллером',
    },

    hw_arduino_reconnected: {
        type: 'info',
        componentLabel: 'Оборудование',
        message: 'Связь с контроллером восстановлена',
    },

    hw_watchdog_reset: {
        type: 'warning',
        componentLabel: 'Оборудование',
        message: 'Перезагрузка контроллера',
    },

    hw_power_failure: {
        type: 'error',
        componentLabel: 'Оборудование',
        message: 'Отказ блока питания',
    },

    hw_voltage_low: {
        type: 'warning',
        componentLabel: 'Оборудование',
        message: 'Низкое напряжение питания',
    },

    hw_relay_failure: {
        type: 'error',
        componentLabel: 'Оборудование',
        message: 'Отказ реле',
    },

    hw_temperature_high: {
        type: 'warning',
        componentLabel: 'Оборудование',
        message: 'Высокая температура оборудования',
    },

    // === ПО (sw_*) ===
    sw_crash: {
        type: 'error',
        componentLabel: 'ПО',
        message: 'Критическая ошибка приложения',
    },

    sw_exception: {
        type: 'error',
        componentLabel: 'ПО',
        message: 'Необработанное исключение',
    },

    sw_database_error: {
        type: 'error',
        componentLabel: 'ПО',
        message: 'Ошибка базы данных',
    },

    sw_api_error: {
        type: 'warning',
        componentLabel: 'ПО',
        message: 'Ошибка API',
    },

    sw_update_failed: {
        type: 'error',
        componentLabel: 'ПО',
        message: 'Ошибка обновления ПО',
    },

    sw_update_completed: {
        type: 'info',
        componentLabel: 'ПО',
        message: 'Обновление ПО завершено',
    },

    default: {
        type: 'error',
        componentLabel: 'Внимание!!!',
        message: 'Неизвестное событие',
    },
};

const SERVICE_DEFS = [
  {
    id: 'WASHER_FLUID',
    checkboxId: 'service-washer',
    label: 'Стеклоомыватель'
  },
  {
    id: 'VACUUM_CLEANER',
    checkboxId: 'service-vacuum',
    label: 'Пылесос'
  },
  {
    id: 'TARGETED_DELIVERY',
    checkboxId: 'service-delivery',
    label: 'Адресная выдача'
  }
];

const presenceState = {};

// Функция рендеринга main-секции
function renderMainSection(title, subtitle, periodOptions = ['Сегодня', 'Вчера', '7 дней', '30 дней']) {
  const mainHtml = `
      <div class="main-top">
          <div>
              <div class="main-title">${title}</div>
              <div class="main-subtitle">${subtitle}</div>
          </div>
          <div class="main-filters">
              Период:
              <select class="select" id="period-select">
                  <option value="today">Сегодня</option>
                  <option value="yesterday">Вчера</option>
                  <option value="7d" selected>7 дней</option>
                  <option value="30d">30 дней</option>
              </select>     
          </div>
      </div>

      <!-- KPI -->
      <section class="kpi-row">
          <article class="kpi-card">
              <div class="kpi-title">Деньги</div>
              <div class="kpi-main">Сегодня: <span id="today-money">0 ₽</span> / <span id="today-checks">0</span> чеков</div>
              <div class="kpi-line">7 дней: <span id="week-money">0 ₽</span> • Маржа <span id="week-margin">0</span> %</div>
              <div class="kpi-line">За месяц: <span id="month-money">0 ₽</span> выручка</div>
              <div class="kpi-actions">
                  <span class="link-more" onclick="showDetails('money')">Подробнее</span>
              </div>
          </article>
          <article class="kpi-card">
              <div class="kpi-title">Состояние</div>
              <div class="kpi-main">Онлайн: <span id="online-count">0</span> / <span id="total-count">0</span></div>
              <div class="kpi-line">Uptime 7 дней: <span id="uptime">0</span> %</div>
              <div class="kpi-line">Проблемы: <span id="offline-count">0</span> офлайн, <span id="warning-count">0</span> предупреждения</div>
              <div class="kpi-actions">
                  <span class="link-more" onclick="showDetails('status')">Подробнее</span>
              </div>
          </article>
          <article class="kpi-card">
              <div class="kpi-title">Остаток</div>
              <div class="kpi-main">Средний остаток: <span id="avg-stock">0</span> %</div>
              <div class="kpi-line">Критично низкий: <span id="critical-count">0</span> аппарата</div>
              <div class="kpi-line">Нужно дозаправить <span id="refill-count">0</span> аппарата &lt; 2 дней</div>
              <div class="kpi-actions">
                  <span class="link-more" onclick="showDetails('stock')">Подробнее</span>
              </div>
          </article>
      </section>

      <!-- Таблица -->
      <section class="table-wrapper">
          <div class="table-header">
              <div class="table-title">Список аппаратов</div>
              <div class="table-controls">
                  <span>Фильтр:</span>
                  <select class="select" id="filter-select">
                      <option value="all">Все</option>
                      <option value="problems">Только с проблемами</option>
                      <option value="offline">Только офлайн</option>
                      <option value="low-stock">Низкий остаток</option>
                  </select>
                  <input class="search-input" id="search-input" placeholder="Поиск по ID или локации" />
              </div>
          </div>
          <div class="table-scroll">
              <table>
                  <thead>
                      <tr>
                          <th>ID</th>
                          <th>Локация</th>
                          <th>₽</th>
                          <th>Чеков</th>
                          <th>Маржа, ₽</th>
                          <th></th>
                          <th>Услуг</th>
                          <th>Статус</th>
                          <th>Связь</th>
                          <th>Uptime 7д</th>
                          <th>Проблемы</th>
                          <th></th>
                          <th>Остаток</th>
                          <th>Прогноз</th>
                          <th></th>
                          <th>Настройки</th>
                      </tr>
                  </thead>
                  <tbody id="table-body"></tbody>
              </table>
          </div>
      </section>
  `;
  return mainHtml;
}

function renderMoneyScreen() {
  return `
  <div class="main-top">
      <div>
          <div class="main-title">Деньги</div>
          <div class="main-subtitle">
              Общая детализация выручки по всем аппаратам и услугам.
          </div>
      </div>
      <div class="main-filters">
        <!-- существующий select периода -->
        <button class="btn-small" onclick="showDetails('bonus')">
          Бонусы
        </button>
      </div>
      <div class="main-filters">
          Период:
          <select class="select" id="money-period">
              <option value="today">Сегодня</option>
              <option value="yesterday">Вчера</option>
              <option value="7d">7 дней</option>
              <option value="30d">30 дней</option>
          </select>
      </div>
  </div>

  <!-- Карточки услуг -->
  <section class="kpi-row" id="money-services-kpi"></section>

  <section class="table-section">
      <div class="table-header">
          <div class="table-title">Аппараты</div>
          <div class="table-controls">
              Фильтр:
              <select class="select" id="filter-select">
                  <option value="all">Все аппараты</option>
                  <option value="high-income">Высокий доход (>50к ₽)</option>
                  <option value="low-income">Низкий доход (<10к ₽)</option>
                  <option value="problems">С проблемами</option>
              </select>
              <input class="search-input" placeholder="Поиск по ID или локации" />
          </div>
      </div>
      <div class="table-scroll">
          <table>
              <thead>
                  <tr>
                      <th>ID</th>
                      <th>Локация</th>
                      <th colspan="2">Общий</th>
                      <th colspan="2">Стеклоомыватель</th>
                      <th colspan="2">Пылесос</th>
                      <th colspan="2">Адресная выдача</th>
                      <th>Статус</th>
                      <th>Последняя операция</th>
                  </tr>
              </thead>
              <tbody id="money-table-body"></tbody>
          </table>
      </div>
  </section>
  `;
}

function renderMachineDetailsScreen(machine) {
  const deviceId = machine?.id || "";
  return `
      <!-- Заголовок -->
      <div class="page-title-block">
        <div>
          <div class="page-title">${deviceId} · Управление ценами</div>
          <div class="page-subtitle">—</div>
        </div>
        <div class="filters-row">
          Период:
          <select class="select" id="detail-period">
            <option value="today">Сегодня</option>
            <option value="yesterday">Вчера</option>
            <option value="7d" selected>7 дней</option>
            <option value="30d">30 дней</option>
          </select>
        </div>
      </div>

      <!-- Вкладки услуг -->
      <div class="tabs-container" id="service-tabs" style="display: flex; gap: 8px; margin-bottom: 16px; border-bottom: 1px solid var(--border); padding-bottom: 8px;">
        <!-- Заполняется в initMachineDetailsScreen -->
      </div>

      <!-- Контент активной вкладки (управление ценами) -->
      <div id="service-pricing-container">
        <!-- Таблица управления ценами текущей услуги -->
      </div>

      <!-- Модальное окно добавления позиции -->
      <div id="add-position-modal" class="modal hidden">
        <div class="modal-content">
          <h3>Добавить позицию · Стеклоомыватель</h3>

          <label>Артикул
            <input type="text" id="ap-article" placeholder="12345678">
          </label>

          <label>Название / Температура
            <input type="text" id="ap-name" placeholder="-10">
          </label>

          <label>Комментарий
            <input type="text" id="ap-comment" placeholder="лучшая цена">
          </label>

          <label>Ссылка
            <input type="url" id="ap-link" placeholder="https://omyvai.ru/generic.html">
          </label>

          <label>Цена, ₽
            <input type="number" id="ap-price" min="0" step="1">
          </label>

          <label>Новая цена, ₽
            <input type="number" id="ap-price-new" min="0" step="1">
          </label>

          <label class="field">
            <span>Рецепт, компонент 1 (%)</span>
            <input
              type="number"
              id="ap-recipe-1"
              min="0"
              max="100"
              step="1"
              value="99"
            >
          </label>
          
          <label class="field">
            <span>Рецепт, компонент 2 (%)</span>
            <input
              type="number"
              id="ap-recipe-2"
              readonly
            >
          </label>
        
          <label>Единица измерения
            <input type="text" id="ap-unit" value="литр">
          </label>

          <label>
            <input type="checkbox" id="ap-enabled" checked>
            Позиция активна
          </label>

          <div class="modal-actions">
            <button class="btn-secondary" onclick="closeAddPositionModal()">Отмена</button>
            <button class="btn-primary" onclick="confirmAddPosition()">Сохранить</button>
          </div>
        </div>
      </div>

      <!-- Общий список операций -->
      <section class="operations-section" style="margin-top: 32px;">
        <div class="operations-header">
          <div class="section-title" style="margin-bottom: 0;">Список операций</div>
          <div class="operations-controls">
            Услуга:
            <select class="select" id="service-filter">
              <option value="all">Все</option>
              <!-- Заполняется динамически -->
            </select>
            Статус:
            <select class="select" id="status-filter">
              <option value="all">Все</option>
              <option value="success">Успешные</option>
              <option value="cancelled">Отменённые</option>
            </select>
            Показать:
            <select class="select" id="page-size">
              <option value="25">25</option>
              <option value="50" selected>50</option>
              <option value="100">100</option>
            </select>
            <input class="search-input" id="operations-search" placeholder="Поиск по сумме или времени" />
          </div>
        </div>
        <div class="operations-scroll">
          <table class="operations-table">
            <thead>
              <tr>
                <th>№</th>
                <th>Дата и время</th>
                <th>Услуга</th>
                <th>Позиция</th>
                <th>Сумма</th>
                <th>Объём/Время</th>
                <th>Способ оплаты</th>
                <th>Статус</th>
                <th>Доход</th>
              </tr>
            </thead>
            <tbody id="operations-table-body">
              <!-- Заполняется loadOperations() -->
            </tbody>
          </table>
        </div>
      </section>
    `;
}
  
function renderMachineProblemsScreen(machine) {
    const deviceId = machine?.id || "";
    return `
        <!-- ========== БЛОК 2: PAGE TITLE ========== -->
        <div class="main-top">
            <div>
                <div class="page-title">${deviceId} · Диагностика</div>
                <div class="page-subtitle">АЗС №12, Калуга</div>
            </div>
        </div>

        <!-- ========== БЛОК 3: KPI КАРТОЧКИ (3 штуки) ========== -->
            <section class="kpi-row">
                
                <!-- БЛОК 3.1: Карточка "Связь" -->
                <article class="kpi-card" data-category="connection">
                <div class="kpi-title">Связь</div>
            
                <div class="kpi-main-metric">
                <div class="kpi-main-metric-label">Статус</div>
                <div class="kpi-main-metric-row">
                    <div class="kpi-main-metric-value" data-conn="status">—</div>
                </div>
                </div>
            
                <div class="kpi-metric" data-conn="ping">
                <div class="kpi-metric-label">Последний пинг</div>
                <div class="kpi-metric-content">
                    <div class="kpi-metric-value" data-conn-value>—</div>
                    <div class="kpi-metric-diff" data-conn-diff>—</div>
                </div>
                </div>
            
                <div class="kpi-metric" data-conn="uptime7d">
                <div class="kpi-metric-label">Uptime 7 дней</div>
                <div class="kpi-metric-content">
                    <div class="kpi-metric-value" data-conn-value>—</div>
                    <div class="kpi-metric-diff" data-conn-diff>—</div>
                </div>
                </div>
            
                <div class="kpi-metric" data-conn="uptime30d">
                <div class="kpi-metric-label">Uptime 30 дней</div>
                <div class="kpi-metric-content">
                    <div class="kpi-metric-value" data-conn-value>—</div>
                    <div class="kpi-metric-diff" data-conn-diff>—</div>
                </div>
                </div>
            
                <div class="kpi-metric" data-conn="disconnects7d">
                <div class="kpi-metric-label">Обрывы связи (7д)</div>
                <div class="kpi-metric-content">
                    <div class="kpi-metric-value" data-conn-value>—</div>
                    <div class="kpi-metric-diff" data-conn-diff>—</div>
                </div>
                </div>
            
                <div class="kpi-metric" data-conn="signalQuality">
                <div class="kpi-metric-label">Качество сигнала</div>
                <div class="kpi-metric-content">
                    <div class="kpi-metric-value" data-conn-value>—</div>
                </div>
                </div>
            </article>
          
            <!-- БЛОК 3.2: Карточка "Оборудование" -->
            <article class="kpi-card" data-category="hardware">
                <div class="kpi-title">Оборудование</div>
            
                <!-- 1. Общий статус железа (история за период) -->
                <div class="kpi-main-metric">
                <div class="kpi-main-metric-label">Общий статус железа (7 дн)</div>
                <div class="kpi-main-metric-row">
                    <!-- Норма / Есть предупреждения / Критично -->
                    <div class="kpi-main-metric-value kpi-status-ok">Норма</div>
                </div>
                </div>
            
                <!-- 2. Текущий статус узлов (здесь и сейчас) -->
                <div class="kpi-metric">
                <div class="kpi-metric-label">Текущий статус узлов</div>
                <div class="kpi-metric-content">
                    <!-- варианты текста:
                        "Все основные узлы в норме"
                        "Есть проблемы: насос 1, датчик уровня" -->
                    <div class="kpi-metric-value">Все основные узлы в норме</div>
                </div>
                </div>
            
                <!-- 3. Критические ошибки -->
                <div class="kpi-metric">
                <div class="kpi-metric-label">Критические за сутки / 7 дн</div>
                <div class="kpi-metric-content">
                    <!-- Например: "0 / 2" -->
                    <div class="kpi-metric-value">-</div>
                </div>
                </div>
            
                <!-- 4. Предупреждения -->
                <div class="kpi-metric">
                <div class="kpi-metric-label">Предупреждения за сутки / 7 дн</div>
                <div class="kpi-metric-content">
                    <!-- Например: "3 / 7" -->
                    <div class="kpi-metric-value">-</div>
                </div>
                </div>
            
                <!-- 5. Сервисные / информационные события -->
                <div class="kpi-metric">
                <div class="kpi-metric-label">Сервисные события за сутки / 7 дн</div>
                <div class="kpi-metric-content">
                    <!-- Например: "12 / 85" -->
                    <div class="kpi-metric-value">-</div>
                </div>
                </div>
            
                <!-- 6. До обслуживания по моточасам -->
                <div class="kpi-metric">
                <div class="kpi-metric-label">До обслуживания</div>
                <div class="kpi-metric-content">
                    <!-- варианты:
                        "120 ч · ≈ 25 дн"          — зелёный (норма)
                        "30 ч · ≈ 5 дн"            — жёлтый (скоро обслуживание)
                        "0 ч · обслуживание просрочено" — красный (срочно) -->
                        <div class="kpi-metric-value">-</div>
                </div>
                </div>
            </article>
               
            <!-- БЛОК 3.3: Карточка "ПО" -->
            <article class="kpi-card" data-category="software">
                <div class="kpi-title">Программное обеспечение</div>

                <div class="kpi-main-metric">
                    <div class="kpi-main-metric-label">Версия ПО</div>
                    <div class="kpi-main-metric-row">
                        <div class="kpi-main-metric-value">v2.4.8</div>
                    </div>
                </div>

                <div class="kpi-metric">
                    <div class="kpi-metric-label">Статус обновлений</div>
                    <div class="kpi-metric-content">
                        <div class="kpi-metric-value" style="color: #22c55e;">Актуальная</div>
                    </div>
                </div>

                <div class="kpi-metric">
                    <div class="kpi-metric-label">Ошибки (7 дней)</div>
                    <div class="kpi-metric-content">
                    <div class="kpi-metric-value">-</div>
                        <div class="kpi-metric-diff positive">−2</div>
                    </div>
                </div>

                <div class="kpi-metric">
                    <div class="kpi-metric-label">Перезагрузки (7 дней)</div>
                    <div class="kpi-metric-content">
                      <div class="kpi-metric-value">-</div>
                        <div class="kpi-metric-diff positive">0</div>
                    </div>
                </div>

                <div class="kpi-metric">
                    <div class="kpi-metric-label">Время работы</div>
                    <div class="kpi-metric-content">
                      <div class="kpi-metric-value">-</div>
                    </div>
                </div>

                <div class="kpi-metric">
                    <div class="kpi-metric-label">Использование памяти</div>
                    <div class="kpi-metric-content">
                      <div class="kpi-metric-value">-</div>
                    </div>
                </div>
            </article>

        </section>

        <!-- ========== БЛОК 5: НАСТРОЙКА УВЕДОМЛЕНИЙ ========== -->
        <section class="logs-section">
        <div class="logs-header">
            <div class="section-title" style="margin-bottom: 0;">Журнал логов</div>
            <div class="logs-controls">
                Тип:
                <select class="select" id="log-type-filter">
                    <option value="all">Все</option>
                    <option value="error">Ошибки</option>
                    <option value="warning">Предупреждения</option>
                    <option value="info">Информация</option>
                    <option value="debug">Отладка</option>
                </select>
                Компонент:
                <select class="select" id="log-component-filter">
                    <option value="all">Все</option>
                    <option value="connection">Связь</option>
                    <option value="pump">Насосы</option>
                    <option value="sensor">Датчики</option>
                    <option value="heater">Нагреватель</option>
                    <option value="software">ПО</option>
                    <option value="payment">Платежи</option>
                </select>
                Показать:
                <select class="select" id="log-page-size">
                    <option value="25">25</option>
                    <option value="50" selected>50</option>
                    <option value="100">100</option>
                </select>
                <input class="search-input" placeholder="Поиск по тексту лога" />
                <button class="header-btn" onclick="downloadLogs()">⬇ Скачать логи</button>
            </div>
        </div>
        
        <div class="logs-scroll">
            <table class="logs-table">
                <thead>
                    <tr>
                        <th>Время</th>
                        <th>Тип</th>
                        <th>Компонент</th>
                        <th>Сообщение</th>
                    </tr>
                </thead>
                <tbody>
                    <!-- Строки заполняет JS через renderLogsTable() -->
                </tbody>
            </table>
        </div>
    </section>  
    `;
}

function renderStockScreen() {
  return `
    <!-- ========== БЛОК 2: PAGE TITLE ========== -->
    <div class="main-top">
        <div>
            <div class="main-title">Остатки</div>
            <div class="main-subtitle">
                Управление запасами и прогнозирование дозаправок.
            </div>
        </div>
    </div>

    <!-- ========== БЛОК 3: KPI КАРТОЧКИ (3 штуки) ========== -->
    <section class="kpi-row">
      <!-- Стеклоомывающая жидкость -->
      <article class="kpi-card" data-category="washer">
        <div class="kpi-badge">Стеклоомывающая жидкость</div>
        <div class="kpi-title">Остатки по услуге</div>

        <div class="kpi-metric">
          <div class="kpi-metric-label">Критично низкий</div>
          <div class="kpi-metric-content">
            <div class="kpi-metric-value">-</div>
          </div>
        </div>

        <div class="kpi-metric">
          <div class="kpi-metric-label">Требуют дозаправки</div>
          <div class="kpi-metric-content">
            <div class="kpi-metric-value">-</div>
          </div>
        </div>

        <div class="kpi-metric">
          <div class="kpi-metric-label">Дозаправлено (7 дней)</div>
          <div class="kpi-metric-content">
            <div class="kpi-metric-value">-</div>
          </div>
        </div>
      </article>

      <!-- Пылесос -->
      <article class="kpi-card" data-category="vacuum">
        <div class="kpi-badge">Пылесос</div>
        <div class="kpi-title">Остатки по услуге</div>

        <div class="kpi-metric">
          <div class="kpi-metric-label">Критично низкий</div>
          <div class="kpi-metric-content">
            <div class="kpi-metric-value">-</div>
          </div>
        </div>

        <div class="kpi-metric">
          <div class="kpi-metric-label">Требуют дозаправки</div>
          <div class="kpi-metric-content">
            <div class="kpi-metric-value">-</div>
          </div>
        </div>

        <div class="kpi-metric">
          <div class="kpi-metric-label">Дозаправлено (7 дней)</div>
          <div class="kpi-metric-content">
            <div class="kpi-metric-value">-</div>
          </div>
        </div>
      </article>

      <!-- Адресная выдача -->
      <article class="kpi-card" data-category="delivery">
        <div class="kpi-badge">Адресная выдача</div>
        <div class="kpi-title">Остатки по услуге</div>

        <div class="kpi-metric">
          <div class="kpi-metric-label">Критично низкий</div>
          <div class="kpi-metric-content">
            <div class="kpi-metric-value">-</div>
          </div>
        </div>

        <div class="kpi-metric">
          <div class="kpi-metric-label">Требуют дозаправки</div>
          <div class="kpi-metric-content">
            <div class="kpi-metric-value">-</div>
          </div>
        </div>

        <div class="kpi-metric">
          <div class="kpi-metric-label">Дозаправлено (7 дней)</div>
          <div class="kpi-metric-content">
            <div class="kpi-metric-value">-</div>
          </div>
        </div>
      </article>
    </section>

    <!-- ========== БЛОК 4: ТАБЛИЦА АППАРАТОВ ========== -->
    <section class="table-section">
        <div class="table-header">
            <div class="table-title">Аппараты</div>
            <div class="table-controls">
                Фильтр:
                <select class="select" id="stock-filter-select">
                    <option value="all">Все</option>
                    <option value="critical">Критично низкий остаток</option>
                    <option value="low">Требуют дозаправки</option>
                    <option value="today">Срочные (сегодня)</option>
                    <option value="tomorrow">Завтра</option>
                </select>
                <input class="search-input" id="stock-search-input" placeholder="Поиск по ID или локации">
            </div>
        </div>
        <div class="table-scroll">
            <table>
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Локация</th>
                        <th>Статус</th>
                        <th>Последний пинг</th>
                        <th>Последнее обслуживание</th>
                        <th colspan="2">Стеклоомыватель</th>
                        <th>Пылесос</th>
                        <th>Адресная выдача</th>
                        <th>Действия</th>
                    </tr>
                </thead>
                <tbody id="stock-devices-body">
                    <!-- строки будут отрисованы JS -->
                </tbody>
            </table>
        </div>
    </section>
  `;
}

function renderMachineStockScreen(machine) {
  const deviceId = machine?.id || "";
  return `
    <div class="main-top">
      <div>
        <div class="page-title">${deviceId} · Управление остатками</div>
        <div class="page-subtitle">АЗС №12, Калуга</div>
      </div>
    </div>

    <div id="stock-service-sections">
      <!-- сюда JS будет подставлять секции в зависимости от modules -->
    </div>

    <section class="refill-history-section">
      <!-- TODO: таблица истории -->
    </section>

    <section class="thresholds-section">
      <!-- TODO: пороги уведомлений -->
    </section>
  `;
}

function renderSettingsScreen(machine) {
    const deviceId = machine?.id || "";
    return `  
        <!-- ========== БЛОК 2: PAGE TITLE ========== -->
        <div class="page-title-block">
            <div>
                <div class="page-title">${deviceId} · Настройки</div>
                <div class="page-subtitle">Конфигурация и параметры аппарата</div>
            </div>
            <div style="display: flex; gap: 8px;">
                <button class="btn-primary" onclick="saveSettings()">💾 Сохранить настройки</button>
            </div>
        </div>
    
        <!-- ========== БЛОК 3: ОСНОВНАЯ ИНФОРМАЦИЯ ========== -->
        <section class="settings-section">
            <div class="section-title">Основная информация</div>
            <div class="settings-grid">
        
            <!-- Название аппарата -->
            <div class="settings-field">
                <label class="settings-label">Название аппарата</label>
                <input id="device-name" type="text" class="settings-input"
                    placeholder="Введите название" />
            </div>
        
            <!-- Серийный номер -->
            <div class="settings-field">
                <label class="settings-label">Серийный номер</label>
                <input id="device-serial" type="text" class="settings-input"
                    readonly style="background: rgba(0,0,0,0.2);" />
            </div>
        
            <!-- Адрес установки -->
            <div class="settings-field" style="grid-column: 1 / -1;">
                <label class="settings-label">Адрес установки</label>
                <input id="device-address" type="text" class="settings-input"
                    placeholder="Введите адрес" />
            </div>
        
            <!-- Координаты - Широта -->
            <div class="settings-field">
                <label class="settings-label">Широта</label>
                <input id="device-lat" type="text" class="settings-input"
                    placeholder="54.5293" />
            </div>
        
            <!-- Координаты - Долгота -->
            <div class="settings-field">
                <label class="settings-label">Долгота</label>
                <input id="device-lng" type="text" class="settings-input"
                    placeholder="36.2754" />
            </div>
        
            <!-- Дата установки -->
            <div class="settings-field">
                <label class="settings-label">Дата установки</label>
                <input id="device-installation-date" type="date" class="settings-input" />
            </div>
        
            <!-- Дата последнего обслуживания -->
            <div class="settings-field">
                <label class="settings-label">Последнее обслуживание</label>
                <input id="device-last-service" type="date" class="settings-input" />
            </div>
            </div>
        </section>

        <!-- ========== БЛОК 4: ПОДКЛЮЧЕННЫЕ УСЛУГИ ========== -->
        <section class="services-section">
            <div class="section-title">Подключенные услуги</div>
            <div class="services-grid" id="services-grid"></div>
        </section>
            
        <!-- ========== БЛОК 5: ПАРАМЕТРЫ УСЛУГ ========== -->
        <section class="services-section" id="services-config-section">
            <div class="section-title">Параметры услуг</div>
            <div class="services-config-grid" id="services-config-grid"></div>
        </section>

        <!-- ========== БЛОК 7: НАСТРОЙКИ СТАТУСА «ПРЕДУПРЕЖДЕНИЕ» ========== -->
        <section class="services-section" id="warning-status-section">
            <div class="section-title">Статус «Предупреждение»</div>
            <div class="services-config-grid" id="warning-status-grid"></div>
        </section>
        
        <!-- ========== БЛОК 6: СИСТЕМНЫЕ НАСТРОЙКИ ========== -->
        <section class="services-section" id="system-config-section">
            <div class="section-title">Системные настройки</div>
            <div class="services-config-grid" id="system-config-grid"></div>
        </section>         

        <!-- ========== БЛОК 9: ОПАСНЫЕ ДЕЙСТВИЯ ========== -->
        <section class="danger-section">
            <div class="section-title">Опасные действия</div>
            <div class="danger-warning">
                ⚠️ Действия в этом разделе могут привести к остановке работы аппарата. Выполняйте только при необходимости.
            </div>
            
            <div class="danger-grid">
                
                <!-- Перезагрузка -->
                <div class="danger-card">
                    <div class="danger-card-icon">🔄</div>
                    <div class="danger-card-title">Перезагрузка системы</div>
                    <div class="danger-card-desc">
                        Перезапуск всех сервисов аппарата. Время простоя: ~2 минуты.
                    </div>
                    <button class="btn-danger" onclick="confirmReboot()">Перезагрузить аппарат</button>
                </div>

                <!-- Обновление ПО -->
                <div class="danger-card">
                    <div class="danger-card-icon">⬆️</div>
                    <div class="danger-card-title">Обновление ПО</div>
                    <div class="danger-card-desc">
                        Установка последней версии ПО. Текущая: v2.4.8 → Доступна: v2.5.0
                    </div>
                    <button class="btn-warning" onclick="confirmUpdate()">Обновить до v2.5.0</button>
                </div>

                <!-- Очистка кэша -->
                <div class="danger-card">
                    <div class="danger-card-icon">🗑️</div>
                    <div class="danger-card-title">Очистка данных</div>
                    <div class="danger-card-desc">
                        Удаление временных файлов, кэша и локальных логов (>30 дней).
                    </div>
                    <button class="btn-warning" onclick="confirmClearCache()">Очистить кэш</button>
                </div>

                <!-- Тестирование оборудования -->
                <div class="danger-card">
                    <div class="danger-card-icon">🔧</div>
                    <div class="danger-card-title">Тест оборудования</div>
                    <div class="danger-card-desc">
                        Запуск диагностического теста всех компонентов. Время: ~5 минут.
                    </div>
                    <button class="btn-warning" onclick="runDiagnostics()">Запустить тест</button>
                </div>

                <!-- Сброс ошибок -->
                <div class="danger-card">
                    <div class="danger-card-icon">⚡</div>
                    <div class="danger-card-title">Сброс ошибок</div>
                    <div class="danger-card-desc">
                        Очистка журнала ошибок и сброс счётчиков проблем.
                    </div>
                    <button class="btn-warning" onclick="confirmResetErrors()">Сбросить ошибки</button>
                </div>

                <!-- Сброс к заводским настройкам -->
                <div class="danger-card danger-critical">
                    <div class="danger-card-icon">⛔</div>
                    <div class="danger-card-title">Сброс к заводским настройкам</div>
                    <div class="danger-card-desc">
                        ⚠️ КРИТИЧНО: Все настройки будут удалены. Аппарат потребует полной переконфигурации.
                    </div>
                    <button class="btn-critical" onclick="confirmFactoryReset()">Сброс к заводским</button>
                </div>

            </div>
        </section>
    
    `;
}

function renderSecurityCard(hw) {
    return `
      <div class="service-card service-active" data-system-id="SECURITY">
        <div class="service-header">
          <div class="service-title">Безопасность</div>
        </div>
  
        <div class="service-config">
          <div class="service-param">
            <div class="service-param-label">Камера 1 (оборудование):</div>
            <input
              type="text"
              class="service-input"
              value="${hw.camera_1_equipment}"
              title="${hw.camera_1_equipment}"
              disabled
            >
          </div>
  
          <div class="service-param">
            <div class="service-param-label">Настройки камеры 1:</div>
            <input
              type="text"
              class="service-input"
              value="${hw.camera_1_settings}"
              title="${hw.camera_1_settings}"
              data-path="SECURITY.security_settings_camera_1"
            >
          </div>
  
          <div class="service-param">
            <div class="service-param-label">Датчик открытия блока (оборудование):</div>
            <input
              type="text"
              class="service-input"
              value="${hw.sensor_opening_block_equipment}"
              title="${hw.sensor_opening_block_equipment}"
              disabled
            >
          </div>
  
          <div class="service-param">
            <div class="service-param-label">Настройки датчика блока:</div>
            <input
              type="text"
              class="service-input"
              value="${hw.sensor_opening_block_settings}"
              title="${hw.sensor_opening_block_settings}"
              data-path="SECURITY.security_settings_sensor_opening_blok"
            >
          </div>
  
          <div class="service-param">
            <div class="service-param-label">Датчик открытия пистолета (оборудование):</div>
            <input
              type="text"
              class="service-input"
              value="${hw.sensor_opening_gun_equipment}"
              title="${hw.sensor_opening_gun_equipment}"
              disabled
            >
          </div>
  
          <div class="service-param">
            <div class="service-param-label">Настройки датчика пистолета:</div>
            <input
              type="text"
              class="service-input"
              value="${hw.sensor_opening_gun_settings}"
              title="${hw.sensor_opening_gun_settings}"
              data-path="SECURITY.security_settings_sensor_opening_gun"
            >
          </div>
  
          <div class="service-param">
            <div class="service-param-label">Датчик вибрации (оборудование):</div>
            <input
              type="text"
              class="service-input"
              value="${hw.sensor_vibration_equipment}"
              title="${hw.sensor_vibration_equipment}"
              disabled
            >
          </div>
  
          <div class="service-param">
            <div class="service-param-label">Настройки датчика вибрации:</div>
            <input
              type="text"
              class="service-input"
              value="${hw.sensor_vibration_settings}"
              title="${hw.sensor_vibration_settings}"
              data-path="SECURITY.security_settings_sensor_vibration"
            >
          </div>
        </div>
      </div>
    `;
}
  
function renderSystemConfig(systemHardware) {
    const grid = document.getElementById('system-config-grid');
    if (!grid) return;
  
    grid.innerHTML = '';
  
    if (systemHardware.ADVERTISING) {
      grid.innerHTML += renderAdvertisingCard(systemHardware.ADVERTISING);
    }
    if (systemHardware.CONNECTION) {
      grid.innerHTML += renderConnectionCard(systemHardware.CONNECTION);
    }
    if (systemHardware.MANAGEMENT) {
      grid.innerHTML += renderManagementCard(systemHardware.MANAGEMENT);
    }
    if (systemHardware.PAYMENT_METHODS) {
      grid.innerHTML += renderPaymentMethodsCard(systemHardware.PAYMENT_METHODS);
    }
    if (systemHardware.SECURITY) {
        grid.innerHTML += renderSecurityCard(systemHardware.SECURITY);
    } 
}

// Данные аппаратов
export const machines = [
    {
        id: "ven_00001",
        location: "АЗС №12, Калуга",
        lat: 54.5133,
        lng: 36.2612,
        money: 6750,
        checks: 42,
        margin: 4050,
        services: 3,
        status: "ok",
        statusText: "Стабильно",
        lastConnection: "09:10",
        uptime: "99%",
        problems: 0,
        stock: 60,
        forecast: "≈ 3 дня",
        needsRefill: false,
        isCritical: false
    },
    {
        id: "ven_00002",
        location: "Паркинг ТЦ «Город»",
        lat: 55.7558,
        lng: 37.6173,
        money: 3120,
        checks: 21,
        margin: 1950,
        services: 2,
        status: "warn",
        statusText: "Предупреждение",
        lastConnection: "08:58",
        uptime: "96%",
        problems: 1,
        stock: 15,
        forecast: "≈ 1 день",
        needsRefill: true,
        isCritical: true
    },
    {
        id: "ven_00003",
        location: "Мойка «Чисто+»",
        lat: 55.6761,
        lng: 37.5687,
        money: 0,
        checks: 0,
        margin: 0,
        services: 1,
        status: "error",
        statusText: "Критично",
        lastConnection: "Вчера 23:40",
        uptime: "-",
        problems: 1,
        stock: 0,
        forecast: "нет данных",
        needsRefill: false,
        isCritical: false
    },
    {
        id: "ven_00004",
        location: "Автосервис «Мастер»",
        lat: 55.7908,
        lng: 37.5589,
        money: 8450,
        checks: 58,
        margin: 5070,
        services: 4,
        status: "ok",
        statusText: "Стабильно",
        lastConnection: "10:15",
        uptime: "100%",
        problems: 0,
        stock: 85,
        forecast: "≈ 7 дней",
        needsRefill: false,
        isCritical: false
    },
    {
        id: "ven_00005",
        location: "ТРЦ «Мегаполис»",
        lat: 55.7348,
        lng: 37.6411,
        money: 12500,
        checks: 92,
        margin: 7500,
        services: 5,
        status: "ok",
        statusText: "Стабильно",
        lastConnection: "10:30",
        uptime: "99%",
        problems: 0,
        stock: 45,
        forecast: "≈ 2 дня",
        needsRefill: true,
        isCritical: false
    }
];

let filteredMachines = [...machines];

let tableBody, searchInput, filterSelect, periodSelect;

// Инициализация приложения (главный экран "Аппараты")
export function initApp() {
  const main = document.querySelector('main.main');

  if (!main) {
      console.error('main.main not found');
      return;
  }

  // Рендерим HTML главного экрана
  main.innerHTML = renderMainSection(
      'Аппараты',
      'Сводный список по трём блокам: Деньги, Состояние, Остаток.'
  );

  // ✅ ВЫЗЫВАЕМ НОВУЮ ФУНКЦИЮ ИЗ screen-machine.js
  initMainScreen();

  // Кнопка "домой" в хедере
  const homeLink = document.getElementById('home-link');
  if (homeLink) {
      homeLink.style.cursor = 'pointer';
      homeLink.addEventListener('click', () => {
          // Возврат на главный экран
          main.innerHTML = renderMainSection('Аппараты', 'Управление автоматами');
          initMainScreen();
      });
  }

  // Подписка на обновления presence
  subscribeDevicesPresence(() => {
      rerenderDevicesTables();
  });
}

async function initMachineDetailsScreen(machine) {
  if (!machine || !machine.id) return;

  console.log('Machine details opened for', machine.id);

  try {
    // 1. Загружаем настройки
    const settings = await loadDeviceSettings(machine.id);

    // 2. Подзаголовок
    const subtitle = document.querySelector('.page-subtitle');
    if (subtitle && settings?.installation_address) {
      const addr = settings.installation_address;
      const placeName = addr.place_name || '';
      const city = addr.city || '';
      const subtitleText = [placeName, city].filter(s => s).join(', ') || 'Не указано';
      subtitle.textContent = subtitleText;
    }

    // 3. Загружаем модули
    const { modulesByService } = await loadHardwareAndModules(machine.id);

    // 4. Создаём вкладки
    const tabsContainer = document.getElementById('service-tabs');
    const serviceFilter = document.getElementById('service-filter');

    if (!tabsContainer) return;

    const tabs = [];

    if (modulesByService.WASHER_FLUID) {
      tabs.push({ id: 'WASHER_FLUID', name: 'Стеклоомыватель' });
      if (serviceFilter) {
        serviceFilter.innerHTML += '<option value="WASHER_FLUID">Стеклоомыватель</option>';
      }
    }

    if (modulesByService.VACUUM_CLEANER) {
      tabs.push({ id: 'VACUUM_CLEANER', name: 'Пылесос' });
      if (serviceFilter) {
        serviceFilter.innerHTML += '<option value="VACUUM_CLEANER">Пылесос</option>';
      }
    }

    if (modulesByService.TARGETED_DELIVERY) {
      tabs.push({ id: 'TARGETED_DELIVERY', name: 'Адресное хранение' });
      if (serviceFilter) {
        serviceFilter.innerHTML += '<option value="TARGETED_DELIVERY">Адресная выдача</option>';
      }
    }

    if (tabs.length === 0) {
      console.warn('No active services for device', machine.id);
      return;
    }

    // Рендерим кнопки вкладок
    tabsContainer.innerHTML = tabs.map((tab, idx) =>
      `<button class="tab-btn ${idx === 0 ? 'active' : ''}" 
               data-service="${tab.id}" 
               style="padding: 8px 16px; border: 1px solid var(--border); background: ${idx === 0 ? 'var(--bg-card)' : 'transparent'}; color: var(--text); cursor: pointer; border-radius: 4px;">
         ${tab.name}
       </button>`
    ).join('');

    // 7. Получаем селект периода и сразу грузим операции за стартовый период
    const periodSelect = document.getElementById('detail-period');
    const initialPeriod = periodSelect ? periodSelect.value : '7d';

    // СНАЧАЛА операции (window._washerOperations заполнится),
    // чтобы renderWasherPricingTable уже видел статистику
    await loadOperations(machine.id, initialPeriod);

    // 5. Показываем первую вкладку (цены + статистика по операциям)
    await showServicePricingTab(machine.id, tabs[0].id);

    // 6. Обработчики переключения вкладок
    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach(btn => {
      btn.addEventListener('click', async () => {
        tabButtons.forEach(b => {
          b.classList.remove('active');
          b.style.background = 'transparent';
        });
        btn.classList.add('active');
        btn.style.background = 'var(--bg-card)';
        await showServicePricingTab(machine.id, btn.dataset.service);
      });
    });

    // 8. Настраиваем фильтры операций
    const serviceFilterEl = document.getElementById('service-filter');
    const statusFilterEl = document.getElementById('status-filter');
    const pageSizeEl = document.getElementById('page-size');
    const searchInputEl = document.getElementById('operations-search');

    const applyOpsFilters = () => renderOperationsTable(currentOperations);

    if (serviceFilterEl) {
      serviceFilterEl.addEventListener('change', applyOpsFilters);
    }
    if (statusFilterEl) {
      statusFilterEl.addEventListener('change', applyOpsFilters);
    }
    if (pageSizeEl) {
      pageSizeEl.addEventListener('change', applyOpsFilters);
    }
    if (searchInputEl) {
      searchInputEl.addEventListener('input', applyOpsFilters);
    }

    // 9. При смене периода: сначала операции, потом перерендер цен
    if (periodSelect) {
      periodSelect.addEventListener('change', async () => {
        const periodValue = periodSelect.value;

        // 1) обновляем операции за новый период
        await loadOperations(machine.id, periodValue);

        // 2) перерисовываем активную вкладку с новыми данными
        const activeTab = document.querySelector('.tab-btn.active');
        if (activeTab) {
          await showServicePricingTab(machine.id, activeTab.dataset.service);
        }
      });
    }

  } catch (e) {
    console.error('Failed to load machine details', e);
    showErrorMessage('Ошибка загрузки данных аппарата.');
  }
}

/**
 * Форматирование uptime
 */
export function formatUptime(uptime) {
    if (uptime === null || uptime === undefined) return '—';
    return `${uptime.toFixed(1)} %`;
}

/**
 * Показать индикатор загрузки
 */
export function showLoadingIndicator() {
    const main = document.querySelector('main.main');
    if (!main) return;
    
    const existingLoader = main.querySelector('.loading-overlay');
    if (existingLoader) return;
    
    const loader = document.createElement('div');
    loader.className = 'loading-overlay';
    loader.innerHTML = `
        <div class="loading-spinner">
            <div class="spinner"></div>
            <div style="margin-top: 16px; color: var(--text-muted);">Загрузка данных...</div>
        </div>
    `;
    main.appendChild(loader);
}

/**
 * Скрыть индикатор загрузки
 */
export function hideLoadingIndicator() {
    const loader = document.querySelector('.loading-overlay');
    if (loader) {
        loader.remove();
    }
}

/**
 * Показать сообщение об ошибке
 */
export function showErrorMessage(message) {
    const main = document.querySelector('main.main');
    if (!main) return;
    
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #ef4444;
        color: white;
        padding: 16px 24px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        z-index: 10000;
        max-width: 400px;
    `;
    errorDiv.textContent = message;
    
    main.appendChild(errorDiv);
    
    // Автоматически убираем через 5 секунд
    setTimeout(() => {
        errorDiv.remove();
    }, 5000);
}

async function initMachineProblemsScreen(machine) {
    if (!machine || !machine.id) return;

    console.log('initMachineProblemsScreen for:', machine.id); // DEBUG
    subscribeDevicePresence(machine.id);

    try {
        // Загружаем логи
        await loadDeviceLogs(machine.id);
        
        // Обновляем KPI оборудования на основе загруженных логов
        updateHardwareKpiCard(machine.id);
        
        // Обновляем KPI программного обеспечения
        updateSoftwareKpiCard(machine.id);
        
        // Инициализируем контролы и рендерим таблицу
        initLogsControls();
        renderLogsTable();
    } catch (e) {
        console.error('Failed to load logs for', machine.id, e);
    }
}

async function initMachineStockScreen(machine) {
  if (!machine || !machine.id) return;

  console.log('Stock screen opened for', machine.id);

  try {
    // 1. Загружаем настройки и hardware+modules
    const deviceSettings = await loadDeviceSettings(machine.id);
    const { modulesByService, servicesHardware } = await loadHardwareAndModules(machine.id);

    // 2. Включаем/выключаем секции по наличию модулей
    toggleServiceSections(modulesByService);

    // 3. (опционально) дальше — загрузка остатков, рендер карточек и т.п.
    // await loadStockData(machine.id, modulesByService, servicesHardware);
    // renderStockData(...);

  } catch (e) {
    console.error('Failed to init stock screen for', machine.id, e);
    showErrorMessage('Не удалось загрузить данные по остаткам');
  }
}

async function initSettingsScreen(machine) {
    if (!machine || !machine.id) return;
  
    try {
      // 1. грузим настройки устройства
      const deviceSettings = await loadDeviceSettings(machine.id);
      console.log('[settings] deviceSettings loaded:', machine.id, deviceSettings);
  
      // 2. грузим железо и модули
      const { hardware, modulesByService, servicesHardware, systemHardware } =
        await loadHardwareAndModules(machine.id);
  
      console.log('[settings] modulesByService:', modulesByService);
  
      // 3. верхний блок "Подключенные услуги" — пробрасываем deviceSettings,
      //    чтобы onServiceToggle мог обновлять warning-блок
      renderServicesSection(hardware, modulesByService, machine.id, deviceSettings);
  
      // 4. блок "Параметры услуг" + внутри него вызов renderWarningStatusSettings
      renderServicesConfig(modulesByService, servicesHardware, deviceSettings);
  
      // 5. блок "Системные настройки"
      renderSystemConfig(systemHardware);
  
      // 6. отдельный вызов warning здесь уже не обязателен,
      //    но если renderServicesConfig пока НЕ вызывает renderWarningStatusSettings,
      //    можно оставить:
      // renderWarningStatusSettings(deviceSettings, modulesByService);
    } catch (e) {
      console.error('Failed to load services data for', machine.id, e);
      const servicesSection = document.querySelector('.services-section');
      if (servicesSection) servicesSection.style.display = 'none';
    }
  
    const saveButton = document.getElementById('settings-save-btn');
    if (saveButton) {
      saveButton.addEventListener('click', () => saveSettings(machine.id));
    }
  
    console.log('Settings screen opened for', machine.id);
}

function renderTable() {
    tableBody.innerHTML = '';
    
    filteredMachines.forEach(machine => {
        const row = document.createElement('tr');
        
        row.innerHTML = `
            <td class="col-id">${machine.id}</td>
            <td class="col-location">
                <div class="location-cell">
                    <span>${machine.location}</span>
                    <button class="map-btn" 
                            title="Открыть на карте"
                            onclick="openMap(${machine.lat}, ${machine.lng}, '${machine.location}')">
                        📍
                    </button>
                </div>
            </td>
            <td>${machine.money.toLocaleString()}</td>
            <td>${machine.checks}</td>
            <td>${machine.margin.toLocaleString()}</td>
            <td><span class="link-more" onclick="showMachineDetails('${machine.id}')">Подробнее</span></td>
            <td>${machine.services}</td>
            <td><span class="status-pill status-${machine.status}">${machine.statusText}</span></td>
            <td>${machine.lastConnection}</td>
            <td>${machine.uptime}</td>
            <td>${machine.problems}</td>
            <td><span class="link-more" onclick="showProblems('${machine.id}')">Подробнее</span></td>
            <td>${machine.stock}%</td>
            <td>${machine.forecast}</td>
            <td><span class="link-more" onclick="showStockDetails('${machine.id}')">Подробнее</span></td>
            <td><button class="btn-small" onclick="openSettings('${machine.id}')">Настройки</button></td>
        `;
        
        tableBody.appendChild(row);
    });
}

// Фильтрация данных
function filterMachines() {
    const searchTerm = searchInput.value.toLowerCase();
    const filterType = filterSelect.value;
    
    filteredMachines = machines.filter(machine => {
        // Поиск по ID и локации
        const matchesSearch = machine.id.toLowerCase().includes(searchTerm) ||
                            machine.location.toLowerCase().includes(searchTerm);
        
        if (!matchesSearch) return false;
        
        // Применение фильтра
        switch(filterType) {
            case 'problems':
                return machine.problems > 0 || machine.status !== 'ok';
            case 'offline':
                return machine.status === 'error';
            case 'low-stock':
                return machine.stock < 30;
            default:
                return true;
        }
    });
    
    renderTable();
}

// Обновление KPI
function updateKPI() {
    // Деньги
    const totalMoney = machines.reduce((sum, m) => sum + m.money, 0);
    const totalChecks = machines.reduce((sum, m) => sum + m.checks, 0);
    const totalMargin = machines.reduce((sum, m) => sum + m.margin, 0);
    
    document.getElementById('today-money').textContent = totalMoney.toLocaleString() + ' ₽';
    document.getElementById('today-checks').textContent = totalChecks;
    
    // Состояние
    const onlineCount = machines.filter(m => m.status === 'ok').length;
    const offlineCount = machines.filter(m => m.status === 'error').length;
    const warningCount = machines.filter(m => m.status === 'warn').length;
    
    document.getElementById('online-count').textContent = onlineCount;
    document.getElementById('total-count').textContent = machines.length;
    document.getElementById('offline-count').textContent = offlineCount;
    document.getElementById('warning-count').textContent = warningCount;
    
    // Остаток
    const avgStock = Math.round(machines.reduce((sum, m) => sum + m.stock, 0) / machines.length);
    const criticalCount = machines.filter(m => m.stock < 20).length;
    const refillCount = machines.filter(m => m.needsRefill).length;
    
    document.getElementById('avg-stock').textContent = avgStock;
    document.getElementById('critical-count').textContent = criticalCount;
    document.getElementById('refill-count').textContent = refillCount;
}

function showDetails(type) {
  const main = document.querySelector('main.main');
  if (!main) {
      console.error('main container not found');
      return;
  }

  let renderFn = null;
  let initFn = null;

  switch (type) {
      case 'money':
          renderFn = renderMoneyScreen;
          initFn = initMoneyScreen;
          break;
      case 'status':
          renderFn = renderStatusScreen;
          initFn = initStatusScreen;
          break;
      case 'stock':
          renderFn = renderStockScreen;
          initFn = initStockScreen;
          break;
      case 'machines':
          renderFn = () => renderMainSection('Аппараты', 'Управление автоматами');
          initFn = initMainScreen;
          break;
      case 'bonus':
          renderFn = renderBonusScreen;
          initFn = initBonusScreen;
          break;
      default:
          console.warn('Unknown details type:', type);
          return;
  }

  main.innerHTML = renderFn();
  
  if (initFn) {
      initFn();
  }
}

function showMachineDetails(id) {
    const machine = machines.find(m => m.id === id);
    if (!machine) {
        console.error('Machine not found:', id);
        return;
    }

    const main = document.querySelector('main.main');
    if (!main) {
        console.error('main container not found');
        return;
    }

    main.innerHTML = renderMachineDetailsScreen(machine);
    initMachineDetailsScreen(machine);
}

function showProblems(id) {
    const machine = machines.find(m => m.id === id);
    if (!machine) {
        console.error('Machine not found:', id);
        return;
    }

    const main = document.querySelector('main.main');
    if (!main) {
        console.error('main container not found');
        return;
    }

    main.innerHTML = renderMachineProblemsScreen(machine);
    initMachineProblemsScreen(machine);
}

function showStockDetails(id) {
    const machine = machines.find(m => m.id === id);
    if (!machine) {
        console.error('Machine not found:', id);
        return;
    }

    const main = document.querySelector('main.main');
    if (!main) {
        console.error('main container not found');
        return;
    }

    main.innerHTML = renderMachineStockScreen(machine);

    initStockDeviceScreen(machine.id);
}

function openMap(lat, lng, location) {
    const url = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=15/${lat}/${lng}`;
    window.open(url, '_blank');
}

function openSettings(id) {
    const machine = machines.find(m => m.id === id);
    if (!machine) {
        console.error('Machine not found:', id);
        return;
    }

    const main = document.querySelector('main.main');
    if (!main) {
        console.error('main container not found');
        return;
    }

    main.innerHTML = renderSettingsScreen(machine);
    initSettingsScreen(machine);
}

// хелперы дат: dd.MM.yyyy -> yyyy-MM-dd
function parseDateToInput(dateStr) {
    if (!dateStr) return "";
    const parts = dateStr.split(".");
    if (parts.length !== 3) return "";
    const [dd, mm, yyyy] = parts;
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

// хелпер: собрать строку адреса
export function buildAddress(installationAddress) {
    if (!installationAddress) return '';
    const parts = [];
    if (installationAddress.region) parts.push(installationAddress.region);
    if (installationAddress.city)   parts.push(installationAddress.city);
    if (installationAddress.street) parts.push(installationAddress.street);
    if (installationAddress.house)  parts.push(installationAddress.house);
    
    return parts.filter(p => p).join(', ');
} 
  
// Загрузка настроек из Realtime Database
export function loadDeviceSettings(deviceId) {
    // devices_setting/{deviceId}
    const ref = firebase.database().ref("devices_setting/" + deviceId);
  
    return ref.once("value")
      .then((snapshot) => {
        const data = snapshot.val();
        if (!data) {
          console.warn("Нет настроек для устройства", deviceId);
          return null;
        }
  
        const installationAddress = data.installation_address || {};
        const geo = (installationAddress.geo) || installationAddress || {};
  
        // Название аппарата
        const deviceNameInput = document.getElementById("device-name");
        if (deviceNameInput) {
          const name =
            (installationAddress.place_name || "") +
            (installationAddress.city ? ", " + installationAddress.city : "");
          deviceNameInput.value = name || deviceId;
        }
  
        // Серийный номер: devices_setting/{deviceId}/serial_number
        const serialInput = document.getElementById("device-serial");
        if (serialInput) {
          // только реальное значение из БД, без подстановки ID
          serialInput.value = data.serial_number || "";
        }
  
        // Адрес установки
        const addressInput = document.getElementById("device-address");
        if (addressInput) {
          addressInput.value = buildAddress(installationAddress);
        }
  
        // Координаты
        const latInput = document.getElementById("device-lat");
        if (latInput) {
          latInput.value =
            geo.lat !== undefined && geo.lat !== null ? String(geo.lat) : "";
        }
  
        const lngInput = document.getElementById("device-lng");
        if (lngInput) {
          lngInput.value =
            geo.lng !== undefined && geo.lng !== null ? String(geo.lng) : "";
        }
  
        // Даты
        const installationDateInput = document.getElementById(
          "device-installation-date"
        );
        if (installationDateInput) {
          installationDateInput.value = parseDateToInput(data.installation_date);
        }
  
        const lastServiceInput = document.getElementById("device-last-service");
        if (lastServiceInput) {
          lastServiceInput.value = parseDateToInput(data.last_service);
        }
  
        // ВАЖНО: вернуть весь объект настроек (включая services, warningConfig и т.п.)
        return data;
      })
      .catch((err) => {
        console.error("Ошибка загрузки настроек устройства", deviceId, err);
        return null;
      });
}
  
  
async function loadHardwareAndModules(machineId) {
    // 1. Модули (активные услуги)
    const modulesSnap = await firebase
      .database()
      .ref(`devices_setting/${machineId}/modules`)
      .once('value');
  
    const modulesArray = modulesSnap.val() || [];
    const modulesByService = {};
  
    Object.values(modulesArray).forEach(m => {
      if (m && m.service_name) {
        modulesByService[m.service_name] = m;
      }
    });
  
    // 2. devices_hardware целиком
    const hardwareSnap = await firebase
      .database()
      .ref(`devices_hardware/${machineId}`)
      .once('value');
  
    const rawHardware = hardwareSnap.val() || {};
  
    // 3. servicesHardware только для активных услуг
    const servicesHardware = {};
  
    if (modulesByService.WASHER_FLUID && rawHardware.WASHER_FLUID) {
      servicesHardware.WASHER_FLUID = mapWasherFluid(rawHardware.WASHER_FLUID);
    }
  
    if (modulesByService.VACUUM_CLEANER && rawHardware.VACUUM_CLEANER) {
      servicesHardware.VACUUM_CLEANER = mapVacuumHardware(rawHardware.VACUUM_CLEANER);
    }
  
    if (modulesByService.TARGETED_DELIVERY && rawHardware.TARGETED_DELIVERY) {
      servicesHardware.TARGETED_DELIVERY =
        mapTargetedDeliveryHardware(rawHardware.TARGETED_DELIVERY);
    }
  
    // 4. SYSTEM‑конфиги
    const systemHardware = {};
  
    if (rawHardware.ADVERTISING) {
      systemHardware.ADVERTISING = mapAdvertising(rawHardware.ADVERTISING);
    }
    if (rawHardware.CONNECTION) {
      systemHardware.CONNECTION = mapConnection(rawHardware.CONNECTION);
    }
    if (rawHardware.MANAGEMENT) {
      systemHardware.MANAGEMENT = mapManagement(rawHardware.MANAGEMENT);
    }
    if (rawHardware.PAYMENT_METHODS) {
      systemHardware.PAYMENT_METHODS =
        mapPaymentMethods(rawHardware.PAYMENT_METHODS);
    }

    if (rawHardware.SECURITY) {
        systemHardware.SECURITY = mapSecurity(rawHardware.SECURITY);
      }
  
    return { hardware: rawHardware, modulesByService, servicesHardware, systemHardware };
}
  
function renderServicesSection(hardware, modulesByService, machineId, deviceSettings) {
    const grid = document.getElementById('services-grid');
    if (!grid) return;
  
    grid.innerHTML = '';
  
    SERVICE_DEFS.forEach(service => {
      const hwBlock = hardware[service.id];
  
      // Услуга доступна только если есть железо
      if (!hwBlock || hwBlock._config_type === 'SYSTEM') {
        return;
      }
  
      const isActive = !!modulesByService[service.id];
  
      const card = document.createElement('div');
      card.className = 'service-card' + (isActive ? ' service-active' : '');
  
      card.innerHTML = `
        <div class="service-header">
          <input type="checkbox"
                 id="${service.checkboxId}"
                 ${isActive ? 'checked' : ''} />
          <label for="${service.checkboxId}" class="service-title">
            ${service.label}
          </label>
          <span class="service-badge ${isActive ? 'service-badge-active' : 'service-badge-inactive'}">
            ${isActive ? 'Активна' : 'Выключена'}
          </span>
        </div>
      `;
  
      grid.appendChild(card);
  
      const checkbox = card.querySelector(`#${service.checkboxId}`);
      if (checkbox) {
        checkbox.addEventListener('change', () =>
          onServiceToggle(machineId, service.id, checkbox.checked, card, deviceSettings)
        );
      }
    });
} 

async function onServiceToggle(machineId, serviceId, checked, card, deviceSettings) {
    const modulesRef = firebase
      .database()
      .ref(`devices_setting/${machineId}/modules`);
  
    // 1. читаем текущие modules
    const snap = await modulesRef.once('value');
    const modulesArray = snap.val() || [];
  
    const keys = Object.keys(modulesArray);
    const index = keys.find(key => {
      const m = modulesArray[key];
      return m && m.service_name === serviceId;
    });
  
    // 2. включаем / выключаем услугу
    if (checked) {
      if (index === undefined) {
        const newModule = {
          service_name: serviceId,
          service_nic: getDefaultServiceNic(serviceId),
          service_color: getDefaultServiceColor(serviceId),
          service_picture: getDefaultServicePicture(serviceId),
          service_season: 'winter',
          service_season_map: {}
        };
        const newKey = modulesArray.length;
        await modulesRef.child(String(newKey)).set(newModule);
      }
    } else {
      if (index !== undefined) {
        await modulesRef.child(String(index)).remove();
      }
    }
  
    // 3. обновляем UI карточки (верхний блок с чекбоксом)
    const badge = card?.querySelector('.service-badge');
    if (card && badge) {
      if (checked) {
        card.classList.add('service-active');
        badge.classList.remove('service-badge-inactive');
        badge.classList.add('service-badge-active');
        badge.textContent = 'Активна';
      } else {
        card.classList.remove('service-active');
        badge.classList.remove('service-badge-active');
        badge.classList.add('service-badge-inactive');
        badge.textContent = 'Выключена';
      }
    }
  
    // 4. перечитываем modules и строим updatedByService
    const updatedSnap = await modulesRef.once('value');
    const updatedArray = updatedSnap.val() || [];
    const updatedByService = {};
    Object.values(updatedArray).forEach(m => {
      if (m && m.service_name) {
        updatedByService[m.service_name] = m;
      }
    });
  
    // 5. перерисовываем блок "Параметры услуг"
    const servicesHardware = await loadServiceHardware(machineId);
    renderServicesConfig(updatedByService, servicesHardware, deviceSettings);
  
    // 6. обновляем блок "Статус «Предупреждение»"
    if (deviceSettings && Array.isArray(deviceSettings.services)) {
      // синхронизируем enabled в deviceSettings.services с updatedByService
      deviceSettings.services.forEach(s => {
        s.enabled = !!updatedByService[s.id];
      });
  
      renderWarningStatusSettings(deviceSettings, updatedByService);
    }
} 

function getDefaultServiceNic(serviceId) {
  switch (serviceId) {
    case 'WASHER_FLUID': return 'Стеклоомывающая жидкость';
    case 'VACUUM_CLEANER': return 'Пылесос';
    case 'TARGETED_DELIVERY': return 'Адресная выдача';
    default: return serviceId;
  }
}

function getDefaultServiceColor(serviceId) {
  switch (serviceId) {
    case 'WASHER_FLUID': return 'blue_main';
    case 'VACUUM_CLEANER': return 'green_main';
    case 'TARGETED_DELIVERY': return 'orange_main';
    default: return 'gray_main';
  }
}

function getDefaultServicePicture(serviceId) {
  switch (serviceId) {
    case 'WASHER_FLUID': return 'washer_fluid_foto';
    case 'VACUUM_CLEANER': return 'vacuum_cleaner_foto';
    case 'TARGETED_DELIVERY': return 'delivery_foto';
    default: return '';
  }
}

function toggleServiceSections(modulesByService) {
  const hasWasher = !!modulesByService['WASHER_FLUID'];
  const hasVacuum = !!modulesByService['VACUUM_CLEANER'];
  const hasDelivery = !!modulesByService['TARGETED_DELIVERY'];

  const tanksSection = document.querySelector('.tanks-section');
  if (tanksSection) {
    tanksSection.style.display = hasWasher ? '' : 'none';
  }

  const vacuumSection = document.querySelector('.vacuum-section');
  if (vacuumSection) {
    vacuumSection.style.display = hasVacuum ? '' : 'none';
  }

  const deliverySection = document.querySelector('.delivery-section');
  if (deliverySection) {
    deliverySection.style.display = hasDelivery ? '' : 'none';
  }
}

async function loadServiceHardware(machineId) {
  const snap = await firebase
    .database()
    .ref(`devices_hardware/${machineId}`)
    .once('value');

  const hw = snap.val() || {};
  return {
    WASHER_FLUID: hw.WASHER_FLUID || null,
    VACUUM_CLEANER: hw.VACUUM_CLEANER || null,
    TARGETED_DELIVERY: hw.TARGETED_DELIVERY || null
  };
}

/**
 * Рендерит блок "Параметры услуг" на экране настроек.
 *
 * @param {Object} modulesByService - модули по услугам (WASHER_FLUID / VACUUM_CLEANER / TARGETED_DELIVERY)
 * @param {Object} servicesHardware - "железные" настройки по этим услугам
 * @param {Object} [deviceSettings] - полные настройки устройства, чтобы можно было обновить warning-блок
 */
function renderServicesConfig(modulesByService, servicesHardware, deviceSettings) {
    const grid = document.getElementById('services-config-grid');
    if (!grid) return;
  
    // Очищаем содержимое перед перерисовкой
    grid.innerHTML = '';
  
    // Стеклоомыватель
    if (modulesByService['WASHER_FLUID'] && servicesHardware.WASHER_FLUID) {
      grid.innerHTML += renderWasherConfigCard(servicesHardware.WASHER_FLUID);
    }
  
    // Пылесос
    if (modulesByService.VACUUM_CLEANER && servicesHardware.VACUUM_CLEANER) {
      grid.innerHTML += renderVacuumConfigCard(servicesHardware.VACUUM_CLEANER);
    }
  
    // Адресная выдача
    if (modulesByService['TARGETED_DELIVERY'] && servicesHardware.TARGETED_DELIVERY) {
      grid.innerHTML += renderDeliveryConfigCard(servicesHardware.TARGETED_DELIVERY);
    }
  
    // После обновления "Параметры услуг" синхронно перерисовываем блок "Статус «Предупреждение»"
    if (deviceSettings) {
      renderWarningStatusSettings(deviceSettings, modulesByService);
    }
  }
  

function renderWasherConfigCard(hw) {
    const tank1 = hw.tank_1 || {};
    const tank2 = hw.tank_2 || {};
  
    const tanks = [];
    if (hw.tank_1) tanks.push('tank_1');
    if (hw.tank_2) tanks.push('tank_2');
    const tanksCount = tanks.length || 1;
  
    return `
      <div class="service-card service-active" data-service-id="WASHER_FLUID">
        <div class="service-header">
          <div class="service-title">Стеклоомыватель</div>
        </div>
  
        <div class="service-config">
          <!-- Общее по услуге -->
          <div class="service-param">
            <div class="service-param-label">Количество ёмкостей:</div>
            <input type="number" class="service-input" value="${tanksCount}" disabled>
            <span class="service-unit">шт</span>
          </div>
  
          <!-- ===== Ёмкость 1 ===== -->
          <div class="service-param">
            <div class="service-param-label">Тип ёмкости 1 (оборудование):</div>
            <input
              type="text"
              class="service-input"
              value="${tank1.tank_type || ''}"
              title="${tank1.tank_type || ''}"
              disabled
            >
          </div>
  
          <div class="service-param">
            <div class="service-param-label">Объём ёмкости 1 (настройка):</div>
            <input
              type="number"
              class="service-input"
              value="${tank1.tank_volume ?? ''}"
              title="${tank1.tank_volume ?? ''}"
              data-path="washer_fluid_settings_tank_1_volume"
            >
            <span class="service-unit">литров</span>
          </div>
  
          <div class="service-param">
            <div class="service-param-label">Товар в ёмкости 1 (настройка):</div>
            <input
              type="number"
              class="service-input"
              value="${tank1.tank_item ?? ''}"
              title="${tank1.tank_item ?? ''}"
              data-path="washer_fluid_settings_tank_1_item"
            >
            <span class="service-unit">ID позиции</span>
          </div>
  
          <div class="service-param">
            <div class="service-param-label">Насос ёмкости 1 (оборудование):</div>
            <input
              type="text"
              class="service-input"
              value="${tank1.tank_pump || ''}"
              title="${tank1.tank_pump || ''}"
              disabled
            >
          </div>
  
          <div class="service-param">
            <div class="service-param-label">Клапан ёмкости 1 (оборудование):</div>
            <input
              type="text"
              class="service-input"
              value="${tank1.tank_valve || ''}"
              title="${tank1.tank_valve || ''}"
              disabled
            >
          </div>
  
          <div class="service-param">
            <div class="service-param-label">Датчик уровня 1 (оборудование):</div>
            <input
              type="text"
              class="service-input"
              value="${tank1.tank_filling_sensor || ''}"
              title="${tank1.tank_filling_sensor || ''}"
              disabled
            >
          </div>
  
          <div class="service-param">
            <div class="service-param-label">Датчик давления 1 (оборудование):</div>
            <input
              type="text"
              class="service-input"
              value="${tank1.tank_sensor_pressure || ''}"
              title="${tank1.tank_sensor_pressure || ''}"
              disabled
            >
          </div>
  
          <div class="service-param">
            <div class="service-param-label">Датчик температуры 1 (оборудование):</div>
            <input
              type="text"
              class="service-input"
              value="${tank1.tank_sensor_temperature || ''}"
              title="${tank1.tank_sensor_temperature || ''}"
              disabled
            >
          </div>
  
          <div class="service-param">
            <div class="service-param-label">Подогрев ёмкости 1 (оборудование):</div>
            <input
              type="text"
              class="service-input"
              value="${tank1.tank_heater || ''}"
              title="${tank1.tank_heater || ''}"
              disabled
            >
          </div>
  
          <!-- ===== Ёмкость 2 (если есть) ===== -->
          ${hw.tank_2 ? `
          <div class="service-param">
            <div class="service-param-label">Тип ёмкости 2 (оборудование):</div>
            <input
              type="text"
              class="service-input"
              value="${tank2.tank_type || ''}"
              title="${tank2.tank_type || ''}"
              disabled
            >
          </div>
  
          <div class="service-param">
            <div class="service-param-label">Объём ёмкости 2 (настройка):</div>
            <input
              type="number"
              class="service-input"
              value="${tank2.tank_volume ?? ''}"
              title="${tank2.tank_volume ?? ''}"
              data-path="washer_fluid_settings_tank_2_volume"
            >
            <span class="service-unit">литров</span>
          </div>
  
          <div class="service-param">
            <div class="service-param-label">Товар в ёмкости 2 (настройка):</div>
            <input
              type="number"
              class="service-input"
              value="${tank2.tank_item ?? ''}"
              title="${tank2.tank_item ?? ''}"
              data-path="washer_fluid_settings_tank_2_item"
            >
            <span class="service-unit">ID позиции</span>
          </div>
  
          <div class="service-param">
            <div class="service-param-label">Насос ёмкости 2 (оборудование):</div>
            <input
              type="text"
              class="service-input"
              value="${tank2.tank_pump || ''}"
              title="${tank2.tank_pump || ''}"
              disabled
            >
          </div>
  
          <div class="service-param">
            <div class="service-param-label">Клапан ёмкости 2 (оборудование):</div>
            <input
              type="text"
              class="service-input"
              value="${tank2.tank_valve || ''}"
              title="${tank2.tank_valve || ''}"
              disabled
            >
          </div>
  
          <div class="service-param">
            <div class="service-param-label">Датчик уровня 2 (оборудование):</div>
            <input
              type="text"
              class="service-input"
              value="${tank2.tank_filling_sensor || ''}"
              title="${tank2.tank_filling_sensor || ''}"
              disabled
            >
          </div>
  
          <div class="service-param">
            <div class="service-param-label">Датчик давления 2 (оборудование):</div>
            <input
              type="text"
              class="service-input"
              value="${tank2.tank_sensor_pressure || ''}"
              title="${tank2.tank_sensor_pressure || ''}"
              disabled
            >
          </div>
  
          <div class="service-param">
            <div class="service-param-label">Датчик температуры 2 (оборудование):</div>
            <input
              type="text"
              class="service-input"
              value="${tank2.tank_sensor_temperature || ''}"
              title="${tank2.tank_sensor_temperature || ''}"
              disabled
            >
          </div>
  
          <div class="service-param">
            <div class="service-param-label">Подогрев ёмкости 2 (оборудование):</div>
            <input
              type="text"
              class="service-input"
              value="${tank2.tank_heater || ''}"
              title="${tank2.tank_heater || ''}"
              disabled
            >
          </div>
          ` : ''}
        </div>
      </div>
    `;
} 

function renderVacuumConfigCard(hw) {
    const type = hw.type || 'wet-dry';
  
    return `
      <div class="service-card service-active" data-service-id="VACUUM_CLEANER">
        <div class="service-header">
          <div class="service-title">Пылесос</div>
        </div>
  
        <div class="service-config">
          <div class="service-param">
            <div class="service-param-label">Тип пылесоса:</div>
            <select
              class="service-select"
              data-path="vacuum_cleaner_settings.type"
              title="Тип пылесоса"
            >
              <option value="wet-dry" ${type === 'wet-dry' ? 'selected' : ''}>
                Влажная/сухая уборка
              </option>
              <option value="dry" ${type === 'dry' ? 'selected' : ''}>
                Только сухая
              </option>
            </select>
          </div>
  
          <div class="service-param">
            <div class="service-param-label">Ресурс фильтра HEPA:</div>
            <input
              type="number"
              class="service-input"
              value="${hw.hepa_resource ?? ''}"
              title="${hw.hepa_resource ?? ''}"
              data-path="vacuum_cleaner_settings.hepa_resource"
            >
            <span class="service-unit">моточасов</span>
          </div>
  
          <div class="service-param">
            <div class="service-param-label">Ресурс мешка:</div>
            <input
              type="number"
              class="service-input"
              value="${hw.bag_resource ?? ''}"
              title="${hw.bag_resource ?? ''}"
              data-path="vacuum_cleaner_settings.bag_resource"
            >
            <span class="service-unit">моточасов</span>
          </div>
  
          <div class="service-param">
            <div class="service-param-label">Порог замены фильтра:</div>
            <input
              type="number"
              class="service-input"
              value="${hw.filter_threshold ?? ''}"
              title="${hw.filter_threshold ?? ''}"
              min="0"
              max="100"
              data-path="vacuum_cleaner_settings.filter_threshold"
            >
            <span class="service-unit">% износа</span>
          </div>
  
          <div class="service-param">
            <div class="service-param-label">Цена за минуту:</div>
            <input
              type="number"
              class="service-input"
              value="${hw.price_per_minute ?? ''}"
              title="${hw.price_per_minute ?? ''}"
              data-path="vacuum_cleaner_settings.price_per_minute"
            >
            <span class="service-unit">₽/мин</span>
          </div>
        </div>
      </div>
    `;
}

function renderDeliveryConfigCard(hw) {
    return `
      <div class="service-card service-active" data-service-id="TARGETED_DELIVERY">
        <div class="service-header">
          <div class="service-title">Адресная выдача</div>
        </div>
  
        <div class="service-config">
          <div class="service-param">
            <div class="service-param-label">Количество ячеек:</div>
            <input
              type="number"
              class="service-input"
              value="${hw.cells_count ?? ''}"
              title="${hw.cells_count ?? ''}"
              data-path="targeted_delivery_settings.cells_count"
            >
            <span class="service-unit">шт</span>
          </div>
  
          <div class="service-param">
            <div class="service-param-label">Тип/размер ячейки:</div>
            <input
              type="text"
              class="service-input"
              value="${hw.cell_size || ''}"
              title="${hw.cell_size || ''}"
              data-path="targeted_delivery_settings.cell_size"
            >
          </div>
  
          <div class="service-param">
            <div class="service-param-label">Срок хранения:</div>
            <input
              type="number"
              class="service-input"
              value="${hw.max_storage_days ?? ''}"
              title="${hw.max_storage_days ?? ''}"
              data-path="targeted_delivery_settings.max_storage_days"
            >
            <span class="service-unit">дней</span>
          </div>
  
          <div class="service-param">
            <div class="service-param-label">Штраф за просрочку:</div>
            <input
              type="number"
              class="service-input"
              value="${hw.overdue_price_per_day ?? ''}"
              title="${hw.overdue_price_per_day ?? ''}"
              data-path="targeted_delivery_settings.overdue_price_per_day"
            >
            <span class="service-unit">₽/день</span>
          </div>
  
          <div class="service-param">
            <div class="service-param-label">Базовая стоимость хранения:</div>
            <input
              type="number"
              class="service-input"
              value="${hw.base_price ?? ''}"
              title="${hw.base_price ?? ''}"
              data-path="targeted_delivery_settings.base_price"
            >
            <span class="service-unit">₽</span>
          </div>
        </div>
      </div>
    `;
} 

function mapWasherFluid(raw) {
    const hw = {};
  
    // Бак 1
    hw.tank_1 = {
      // настройки
      tank_volume: raw.washer_fluid_settings_tank_1_volume,
      tank_item: raw.washer_fluid_settings_tank_1_item,
      // оборудование с учётом возможного override в settings
      tank_pump: raw.washer_fluid_settings_tank_1_pump || raw.washer_fluid_equipment_tank_1_pump,
      tank_valve: raw.washer_fluid_settings_tank_1_valve || raw.washer_fluid_equipment_tank_1_valve,
      tank_filling_sensor: raw.washer_fluid_settings_tank_1_filling_sensor || raw.washer_fluid_equipment_tank_1_filling_sensor,
      tank_sensor_pressure: raw.washer_fluid_settings_tank_1_sensor_pressure || raw.washer_fluid_equipment_tank_1_sensor_pressure,
      tank_sensor_temperature: raw.washer_fluid_settings_tank_1_sensor_temperature || raw.washer_fluid_equipment_tank_1_sensor_temperature,
      tank_heater: raw.washer_fluid_settings_tank_1_heater || raw.washer_fluid_equipment_tank_1_heater,
      // тип бака
      tank_type: raw.washer_fluid_equipment_tank_1
    };
  
    // Бак 2
    hw.tank_2 = {
      tank_volume: raw.washer_fluid_settings_tank_2_volume,
      tank_item: raw.washer_fluid_settings_tank_2_item,
      tank_pump: raw.washer_fluid_settings_tank_2_pump || raw.washer_fluid_equipment_tank_2_pump,
      tank_valve: raw.washer_fluid_settings_tank_2_valve || raw.washer_fluid_equipment_tank_2_valve,
      tank_filling_sensor: raw.washer_fluid_settings_tank_2_filling_sensor || raw.washer_fluid_equipment_tank_2_filling_sensor,
      tank_sensor_pressure: raw.washer_fluid_settings_tank_2_sensor_pressure || raw.washer_fluid_equipment_tank_2_sensor_pressure,
      tank_sensor_temperature: raw.washer_fluid_settings_tank_2_sensor_temperature || raw.washer_fluid_equipment_tank_2_sensor_temperature,
      tank_heater: raw.washer_fluid_settings_tank_2_heater || raw.washer_fluid_equipment_tank_2_heater,
      tank_type: raw.washer_fluid_equipment_tank_2
    };
  
    return hw;
}

function mapVacuumHardware(raw) {
    const s = raw.vacuum_cleaner_settings || {};
  
    return {
      type: s.type || 'wet-dry',
      hepa_resource: s.hepa_resource ?? 600,
      bag_resource: s.bag_resource ?? 200,
      filter_threshold: s.filter_threshold ?? 80,
      price_per_minute: s.price_per_minute ?? 15,
    };
}

function mapTargetedDeliveryHardware(raw) {
    const s = raw.targeted_delivery_settings || {};
  
    return {
      cells_count: s.cells_count ?? 30,              // количество ячеек
      cell_size: s.cell_size || 'M',                // размер/тип ячейки
      max_storage_days: s.max_storage_days ?? 7,    // срок хранения
      overdue_price_per_day: s.overdue_price_per_day ?? 7, // цена за просрочку
      base_price: s.base_price ?? 50,              // базовая стоимость
    };
}

function mapAdvertising(raw) {
return {
    led_equipment: raw.advertising_equipment_LED_module || '',
    backlight1_equipment: raw.advertising_equipment_backlight_circuit_1 || '',
    backlight2_equipment: raw.advertising_equipment_backlight_circuit_2 || '',
    led_settings: raw.advertising_settings_LED_module || '',
    backlight1_settings: raw.advertising_settings_backlight_circuit_1 || '',
    backlight2_settings: raw.advertising_settings_backlight_circuit_2 || '',
};
}

function mapConnection(raw) {
return {
    equipment: raw.connection_equipment || '',
    settings: raw.connection_settings || '',
};
}

function mapManagement(raw) {
return {
    heater_console: raw.management_heater_consol || '',
    external_temp_sensor: raw.management_sensor_temperature_external || '',
};
}

function mapPaymentMethods(raw) {
const bonus = raw.bonus || {};
const cash = raw.cash || {};

return {
    bonus_nfc_equipment: bonus.bonus_equipment_nfc || '',
    bonus_qr_equipment: bonus.bonus_equipment_qr || '',
    bonus_nfc_settings: bonus.bonus_settings_nfc || '',
    bonus_qr_settings: bonus.bonus_settings_qr || '',
    cash_equipment: cash.cash_equipment || '',
    cash_settings: cash.cash_settings || '',
};
}

function renderAdvertisingCard(hw) {
return `
    <div class="service-card service-active" data-system-id="ADVERTISING">
    <div class="service-header">
        <div class="service-title">Реклама</div>
    </div>

    <div class="service-config">
        <div class="service-param">
        <div class="service-param-label">LED-модуль (оборудование):</div>
        <input
            type="text"
            class="service-input"
            value="${hw.led_equipment}"
            title="${hw.led_equipment}"
            disabled
        >
        </div>

        <div class="service-param">
        <div class="service-param-label">Настройки LED-модуля:</div>
        <input
            type="text"
            class="service-input"
            value="${hw.led_settings}"
            title="${hw.led_settings}"
            data-path="ADVERTISING.advertising_settings_LED_module"
        >
        </div>

        <div class="service-param">
        <div class="service-param-label">Подсветка контур 1 (оборудование):</div>
        <input
            type="text"
            class="service-input"
            value="${hw.backlight1_equipment}"
            title="${hw.backlight1_equipment}"
            disabled
        >
        </div>

        <div class="service-param">
        <div class="service-param-label">Настройки подсветки 1:</div>
        <input
            type="text"
            class="service-input"
            value="${hw.backlight1_settings}"
            title="${hw.backlight1_settings}"
            data-path="ADVERTISING.advertising_settings_backlight_circuit_1"
        >
        </div>

        <div class="service-param">
        <div class="service-param-label">Подсветка контур 2 (оборудование):</div>
        <input
            type="text"
            class="service-input"
            value="${hw.backlight2_equipment}"
            title="${hw.backlight2_equipment}"
            disabled
        >
        </div>

        <div class="service-param">
        <div class="service-param-label">Настройки подсветки 2:</div>
        <input
            type="text"
            class="service-input"
            value="${hw.backlight2_settings}"
            title="${hw.backlight2_settings}"
            data-path="ADVERTISING.advertising_settings_backlight_circuit_2"
        >
        </div>
    </div>
    </div>
`;
}

function renderConnectionCard(hw) {
return `
    <div class="service-card service-active" data-system-id="CONNECTION">
    <div class="service-header">
        <div class="service-title">Связь</div>
    </div>

    <div class="service-config">
        <div class="service-param">
        <div class="service-param-label">Оборудование связи:</div>
        <input
            type="text"
            class="service-input"
            value="${hw.equipment}"
            title="${hw.equipment}"
            disabled
        >
        </div>

        <div class="service-param">
        <div class="service-param-label">Настройки подключения:</div>
        <input
            type="text"
            class="service-input"
            value="${hw.settings}"
            title="${hw.settings}"
            data-path="CONNECTION.connection_settings"
        >
        </div>
    </div>
    </div>
`;
}

function renderManagementCard(hw) {
return `
    <div class="service-card service-active" data-system-id="MANAGEMENT">
    <div class="service-header">
        <div class="service-title">Управление</div>
    </div>

    <div class="service-config">
        <div class="service-param">
        <div class="service-param-label">Подогрев консоли (оборудование):</div>
        <input
            type="text"
            class="service-input"
            value="${hw.heater_console}"
            title="${hw.heater_console}"
            disabled
        >
        </div>

        <div class="service-param">
        <div class="service-param-label">Внешний датчик температуры:</div>
        <input
            type="text"
            class="service-input"
            value="${hw.external_temp_sensor}"
            title="${hw.external_temp_sensor}"
            disabled
        >
        </div>
    </div>
    </div>
`;
}

function renderPaymentMethodsCard(hw) {
return `
    <div class="service-card service-active" data-system-id="PAYMENT_METHODS">
    <div class="service-header">
        <div class="service-title">Способы оплаты</div>
    </div>

    <div class="service-config">
        <!-- Бонусная система -->
        <div class="service-param">
        <div class="service-param-label">Бонусы NFC (оборудование):</div>
        <input
            type="text"
            class="service-input"
            value="${hw.bonus_nfc_equipment}"
            title="${hw.bonus_nfc_equipment}"
            disabled
        >
        </div>

        <div class="service-param">
        <div class="service-param-label">Настройки бонусов NFC:</div>
        <input
            type="text"
            class="service-input"
            value="${hw.bonus_nfc_settings}"
            title="${hw.bonus_nfc_settings}"
            data-path="PAYMENT_METHODS.bonus.bonus_settings_nfc"
        >
        </div>

        <div class="service-param">
        <div class="service-param-label">Бонусы QR (оборудование):</div>
        <input
            type="text"
            class="service-input"
            value="${hw.bonus_qr_equipment}"
            title="${hw.bonus_qr_equipment}"
            disabled
        >
        </div>

        <div class="service-param">
        <div class="service-param-label">Настройки бонусов QR:</div>
        <input
            type="text"
            class="service-input"
            value="${hw.bonus_qr_settings}"
            title="${hw.bonus_qr_settings}"
            data-path="PAYMENT_METHODS.bonus.bonus_settings_qr"
        >
        </div>

        <!-- Наличные -->
        <div class="service-param">
        <div class="service-param-label">Кассовый модуль (оборудование):</div>
        <input
            type="text"
            class="service-input"
            value="${hw.cash_equipment}"
            title="${hw.cash_equipment}"
            disabled
        >
        </div>

        <div class="service-param">
        <div class="service-param-label">Настройки наличных:</div>
        <input
            type="text"
            class="service-input"
            value="${hw.cash_settings}"
            title="${hw.cash_settings}"
            data-path="PAYMENT_METHODS.cash.cash_settings"
        >
        </div>
    </div>
    </div>
`;
}

function mapSecurity(raw) {
    return {
      camera_1_equipment: raw.security_equipment_camera_1 || '',
      sensor_opening_block_equipment: raw.security_equipment_sensor_opening_blok || '',
      sensor_opening_gun_equipment: raw.security_equipment_sensor_opening_gun || '',
      sensor_vibration_equipment: raw.security_equipment_sensor_vibration || '',
  
      camera_1_settings: raw.security_settings_camera_1 || '',
      sensor_opening_block_settings: raw.security_settings_sensor_opening_blok || '',
      sensor_opening_gun_settings: raw.security_settings_sensor_opening_gun || '',
      sensor_vibration_settings: raw.security_settings_sensor_vibration || '',
    };
}
function subscribeDevicesPresence(onUpdate) {
  const db = firebase.database();
  const ref = db.ref('devices_presence');

  ref.on('value', (snapshot) => {
    const raw = snapshot.val() || {};
    Object.keys(raw).forEach((deviceId) => {
      const item = raw[deviceId] || {};
      presenceState[deviceId] = {
        state: item.state || 'offline',
        lastChanged: item.last_changed || null
      };
    });
    if (typeof onUpdate === 'function') {
      onUpdate(presenceState);
    }
  });
}
 
function renderWarningStatusSettings(deviceSettings, modulesByService) {
    const grid = document.getElementById('warning-status-grid');
    if (!grid) return;
  
    const warningCfg = deviceSettings.warningConfig || {};
    const hasWasher   = !!(modulesByService && modulesByService.WASHER_FLUID);
    const hasVacuum   = !!(modulesByService && modulesByService.VACUUM_CLEANER);
    const hasDelivery = !!(modulesByService && modulesByService.TARGETED_DELIVERY);
  
    const cards = [];
  
    if (hasWasher) {
      const serviceId = 'WASHER_FLUID';
      const cfg = warningCfg[serviceId] || {};
      cards.push(`
        <div class="service-card service-active" data-warning-service-id="${serviceId}">
          <div class="service-header">
            <div class="service-title">Стеклоомыватель</div>
          </div>
          <div class="service-config">
            <!-- дальше только service-param, как в системном блоке -->
            <div class="service-param">
              <div class="service-param-label">Предупреждения включены</div>
              <input type="checkbox" class="service-input"
                     ${cfg.enabled ? 'checked' : ''}
                     data-path="WARNING.${serviceId}.enabled">
            </div>
            <div class="service-param">
              <div class="service-param-label">Низкий остаток, %</div>
              <input type="number" class="service-input" style="width:80px" min="1" max="100"
                     value="${cfg.lowStockThreshold ?? 20}"
                     data-path="WARNING.${serviceId}.lowStockThreshold">
            </div>
            <div class="service-param">
              <div class="service-param-label">Ошибки за окно</div>
              <input type="checkbox" class="service-input"
                     ${cfg.errorsEnabled ? 'checked' : ''}
                     data-path="WARNING.${serviceId}.errorsEnabled">
            </div>
            <div class="service-param">
              <div class="service-param-label">Окно, мин</div>
              <input type="number" class="service-input" style="width:80px"
                     value="${cfg.errorsWindowMin ?? 60}"
                     data-path="WARNING.${serviceId}.errorsWindowMin">
            </div>
            <div class="service-param">
              <div class="service-param-label">Высокая температура, °C</div>
              <input type="checkbox" class="service-input"
                     ${cfg.highTempEnabled ? 'checked' : ''}
                     data-path="WARNING.${serviceId}.highTempEnabled">
            </div>
            <div class="service-param">
              <div class="service-param-label">Порог, °C</div>
              <input type="number" class="service-input" style="width:80px"
                     value="${cfg.highTempC ?? 40}"
                     data-path="WARNING.${serviceId}.highTempC">
            </div>
            <div class="service-param">
              <div class="service-param-label">Низкая температура, °C</div>
              <input type="checkbox" class="service-input"
                     ${cfg.lowTempEnabled ? 'checked' : ''}
                     data-path="WARNING.${serviceId}.lowTempEnabled">
            </div>
            <div class="service-param">
              <div class="service-param-label">Порог, °C</div>
              <input type="number" class="service-input" style="width:80px"
                     value="${cfg.lowTempC ?? 5}"
                     data-path="WARNING.${serviceId}.lowTempC">
            </div>
          </div>
        </div>
      `);
    }
  
    if (hasVacuum) {
      const serviceId = 'VACUUM_CLEANER';
      const cfg = warningCfg[serviceId] || {};
      cards.push(`
        <div class="service-card service-active" data-warning-service-id="${serviceId}">
          <div class="service-header">
            <div class="service-title">Пылесос</div>
          </div>
          <div class="service-config">
            <div class="service-param">
              <div class="service-param-label">Предупреждения включены</div>
              <input type="checkbox" class="service-input"
                     ${cfg.enabled ? 'checked' : ''}
                     data-path="WARNING.${serviceId}.enabled">
            </div>
            <div class="service-param">
              <div class="service-param-label">Низкий остаток, %</div>
              <input type="number" class="service-input" style="width:80px" min="1" max="100"
                     value="${cfg.lowStockThreshold ?? 20}"
                     data-path="WARNING.${serviceId}.lowStockThreshold">
            </div>
            <div class="service-param">
              <div class="service-param-label">Ошибки за окно</div>
              <input type="checkbox" class="service-input"
                     ${cfg.errorsEnabled ? 'checked' : ''}
                     data-path="WARNING.${serviceId}.errorsEnabled">
            </div>
            <div class="service-param">
              <div class="service-param-label">Окно, мин</div>
              <input type="number" class="service-input" style="width:80px"
                     value="${cfg.errorsWindowMin ?? 60}"
                     data-path="WARNING.${serviceId}.errorsWindowMin">
            </div>
            <div class="service-param">
              <div class="service-param-label">Высокий пинг, мс</div>
              <input type="checkbox" class="service-input"
                     ${cfg.highPingEnabled ? 'checked' : ''}
                     data-path="WARNING.${serviceId}.highPingEnabled">
            </div>
            <div class="service-param">
              <div class="service-param-label">Порог, мс</div>
              <input type="number" class="service-input" style="width:80px"
                     value="${cfg.highPingMs ?? 200}"
                     data-path="WARNING.${serviceId}.highPingMs">
            </div>
          </div>
        </div>
      `);
    }
  
    if (hasDelivery) {
      const serviceId = 'TARGETED_DELIVERY';
      const cfg = warningCfg[serviceId] || {};
      cards.push(`
        <div class="service-card service-active" data-warning-service-id="${serviceId}">
          <div class="service-header">
            <div class="service-title">Адресная выдача</div>
          </div>
          <div class="service-config">
            <div class="service-param">
              <div class="service-param-label">Предупреждения включены</div>
              <input type="checkbox" class="service-input"
                     ${cfg.enabled ? 'checked' : ''}
                     data-path="WARNING.${serviceId}.enabled">
            </div>
            <div class="service-param">
              <div class="service-param-label">Низкий остаток, %</div>
              <input type="number" class="service-input" style="width:80px" min="1" max="100"
                     value="${cfg.lowStockThreshold ?? 20}"
                     data-path="WARNING.${serviceId}.lowStockThreshold">
            </div>
            <div class="service-param">
              <div class="service-param-label">Ошибки за окно</div>
              <input type="checkbox" class="service-input"
                     ${cfg.errorsEnabled ? 'checked' : ''}
                     data-path="WARNING.${serviceId}.errorsEnabled">
            </div>
            <div class="service-param">
              <div class="service-param-label">Окно, мин</div>
              <input type="number" class="service-input" style="width:80px"
                     value="${cfg.errorsWindowMin ?? 60}"
                     data-path="WARNING.${serviceId}.errorsWindowMin">
            </div>
            <div class="service-param">
              <div class="service-param-label">Высокий пинг, мс</div>
              <input type="checkbox" class="service-input"
                     ${cfg.highPingEnabled ? 'checked' : ''}
                     data-path="WARNING.${serviceId}.highPingEnabled">
            </div>
            <div class="service-param">
              <div class="service-param-label">Порог, мс</div>
              <input type="number" class="service-input" style="width:80px"
                     value="${cfg.highPingMs ?? 200}"
                     data-path="WARNING.${serviceId}.highPingMs">
            </div>
          </div>
        </div>
      `);
    }
  
    grid.innerHTML = cards.join('');
}
   
function collectWarningStatusSettings() {
    return {
      warnLowStockEnabled: document.getElementById('warn-low-stock-enabled').checked,
      warnLowStockThreshold: Number(document.getElementById('warn-low-stock-threshold').value) || 0,
      warnHighLatencyEnabled: document.getElementById('warn-high-latency-enabled').checked,
      warnHighLatencyThreshold: Number(document.getElementById('warn-high-latency-threshold').value) || 0,
      warnErrorsEnabled: document.getElementById('warn-errors-enabled').checked,
      warnErrorsWindowMin: Number(document.getElementById('warn-errors-window-min').value) || 0
    };
}
 
export function formatPercent(value) {
    if (value == null) return '—';
    return value.toFixed(1) + ' %';
}
  
export function formatPingMs(ms) {
    if (ms == null) return '—';
    return ms + ' мс';
}
  
export function formatSignalQuality(q) {
    switch (q) {
      case 'poor': return 'Плохое';
      case 'fair':
      case 'average': return 'Среднее';
      case 'good': return 'Хорошее';
      case 'excellent': return 'Отличное';
      default: return '—';
    }
}

// ============================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ ПО
// ============================================

async function loadFleetOverview() {
  const fleetData = await loadFullFleetStatus();
  const devices = fleetData.devices || [];

  const connectionKPI = calculateConnectionKPI(devices);
  const hardwareKPI   = calculateHardwareKPI(devices);
  const softwareKPI   = calculateSoftwareKPI(devices, fleetData.latestVersion);

  return {
    connectionKPI,
    hardwareKPI,
    softwareKPI,
    tableDevices: devices
  };
}
   
export function getPeriodRange(periodValue) {
  const now = new Date();
  const end = new Date(now);
  const start = new Date(now);

  switch (periodValue) {
      case 'today': {
          // Сегодня: с начала текущего дня до конца текущего дня
          start.setHours(0, 0, 0, 0);
          end.setHours(23, 59, 59, 999);
          break;
      }

      case 'yesterday': {
          // Вчера: с начала вчерашнего дня до конца вчерашнего дня
          start.setDate(start.getDate() - 1);
          end.setDate(end.getDate() - 1);
          start.setHours(0, 0, 0, 0);
          end.setHours(23, 59, 59, 999);
          break;
      }

      case '7d': {
          // Последние 7 дней: сегодня и 6 предыдущих
          start.setDate(start.getDate() - 6);
          start.setHours(0, 0, 0, 0);
          end.setHours(23, 59, 59, 999);
          break;
      }

      case '30d': {
          // Последние 30 дней: сегодня и 29 предыдущих
          start.setDate(start.getDate() - 29);
          start.setHours(0, 0, 0, 0);
          end.setHours(23, 59, 59, 999);
          break;
      }

      case 'prev7d': {
          // Предыдущие 7 дней ДО текущих последних 7
          // если сейчас 7d = [now-6 .. now], то prev7d = [now-13 .. now-7]
          end.setDate(end.getDate() - 7);
          end.setHours(23, 59, 59, 999);
          start.setDate(end.getDate() - 6);
          start.setHours(0, 0, 0, 0);
          break;
      }

      case 'prev30d': {
          // Предыдущие 30 дней ДО текущих последних 30
          // если сейчас 30d = [now-29 .. now], то prev30d = [now-59 .. now-30]
          end.setDate(end.getDate() - 30);
          end.setHours(23, 59, 59, 999);
          start.setDate(end.getDate() - 29);
          start.setHours(0, 0, 0, 0);
          break;
      }

      default: {
          // По умолчанию: как 7d
          start.setDate(start.getDate() - 6);
          start.setHours(0, 0, 0, 0);
          end.setHours(23, 59, 59, 999);
      }
  }

  console.log(
      '[Money] getPeriodRange', periodValue,
      'start =', start.toISOString(),
      'end =', end.toISOString()
  );

  return { start, end };
}

// Себестоимость литра в каждом баке из devices_stock/<deviceId>
export async function loadTankCosts(deviceId) {
  const ref = firebase.database().ref(`devices_stock/${deviceId}`);
  const snap = await ref.once('value');
  const stock = snap.val() || {};

  const tankCosts = {}; // { tank_1: 20, tank_2: 25, ... }

  Object.keys(stock).forEach((tankKey) => {
    const tank = stock[tankKey];
    if (!tank) return;

    const quantity = parseFloat(tank.tank_quantity || '0');
    const sum = parseFloat(tank.tank_sum || '0');

    if (!quantity || !sum || !isFinite(quantity) || !isFinite(sum)) {
      return;
    }

    const costPerLiter = sum / quantity;
    tankCosts[tankKey] = costPerLiter;
  });

  console.log('💧 Tank costs loaded:', tankCosts);
  return tankCosts;
}

export function formatDiffPercent(value) {
  const sign = value > 0 ? '+' : '';
  const cls = value > 0 ? 'positive' : (value < 0 ? 'negative' : '');
  return {
    text: `${sign}${value} %`,
    cls
  };
}

// Вспомогательная функция загрузки адресов (переиспользует существующие функции)
export async function loadDeviceLocations(deviceIds) {
  const locations = {};

  for (const id of deviceIds) {
    try {
      const deviceIdClean = id.replace('@omyvai.ru', '');
      const settings = await loadDeviceSettings(deviceIdClean);

      if (settings && settings.installation_address) {
        locations[deviceIdClean] = buildAddress(settings.installation_address);
      } else {
        locations[deviceIdClean] = 'Адрес не указан';
      }
    } catch (e) {
      console.error('Failed to load location for', id, e);
      locations[deviceIdClean] = 'Ошибка загрузки адреса';
    }
  }

  return locations;
}

export async function loadClientDevices() {
  const user = firebase.auth().currentUser;
  if (!user) throw new Error('Firebase Auth');

  const db = firebase.firestore();
  const clientDocRef = db.collection('clients').doc(user.email);
  const docSnap = await clientDocRef.get();

  if (!docSnap.exists) {
    console.warn('Client document not found for', user.email);
    return [];
  }

  const data = docSnap.data();
  const devicesArray = Array.isArray(data.clients_devices_array)
    ? data.clients_devices_array
    : ['ven_00001@omyvai.ru'];

  return devicesArray
    .map(id => (typeof id === 'string' ? id.trim() : ''))
    .filter(Boolean)
    .map(id => {
      // уже полный ID
      if (id.includes('@')) return id;
      // если без домена, но уже с подчёркиванием
      if (id.startsWith('ven_')) return `${id}@omyvai.ru`;
      // если старый формат ven00001 → ven_00001@omyvai.ru
      const m = id.match(/^ven0*([0-9]+)$/);
      if (m) return `ven_${m[1].padStart(5, '0')}@omyvai.ru`;
      return id;
    });
}

export function formatRuble(value) {
  if (value == null) return '—';
  return value.toLocaleString('ru-RU') + ' ₽';
}

export function formatMarginPercent(value) {
  if (value == null) return '— маржа';
  return `${value} % маржа`;
}

export function formatChecks(value) {
  return `${value} чеков`;
}

// Делаем функции доступными из HTML (onclick и пр.)
window.showDetails = showDetails;
window.showMachineDetails = showMachineDetails;
window.showProblems = showProblems;
window.showStockDetails = showStockDetails;
window.openMap = openMap;
window.openSettings = openSettings;