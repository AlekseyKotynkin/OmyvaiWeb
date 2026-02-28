/* ==================== SCROLL & FADE IN ANIMATIONS ==================== */

console.log('Script.js loaded');

const fadeInObserver = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.style.animation = 'fadeInUp 0.6s ease-out forwards';
      fadeInObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.1 });

document.querySelectorAll('.section-fade-in').forEach(el => {
  fadeInObserver.observe(el);
});

/* ==================== CAROUSEL (HERO SECTION) ==================== */

const slides = document.querySelectorAll('.carousel-slides .slide');
const dots = document.querySelectorAll('.carousel-dots .dot');
const slideCounter = document.querySelector('.slide-counter .current');
const benefits = document.querySelectorAll('.hero-benefit');

let currentSlide = 0;
const SLIDE_INTERVAL = 5500; // 5.5 seconds

function showSlide(index) {
  slides.forEach((slide, i) => {
    slide.classList.toggle('is-active', i === index);
  });
  dots.forEach((dot, i) => {
    dot.classList.toggle('is-active', i === index);
  });
  benefits.forEach((benefit, i) => {
    benefit.classList.toggle('is-active', i === index);
  });
  if (slideCounter) slideCounter.textContent = index + 1;
  currentSlide = index;
}

dots.forEach((dot, index) => {
  dot.addEventListener('click', () => {
    showSlide(index);
    restartCarousel();
  });
});

function nextSlide() {
  const nextIndex = (currentSlide + 1) % slides.length;
  showSlide(nextIndex);
}

let carouselTimer = setInterval(nextSlide, SLIDE_INTERVAL);

function restartCarousel() {
  clearInterval(carouselTimer);
  carouselTimer = setInterval(nextSlide, SLIDE_INTERVAL);
}

/* ==================== TABS ==================== */

const tabBtns = document.querySelectorAll('.tab-btn');
const tabPanes = document.querySelectorAll('.tab-pane');

tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const tabId = btn.getAttribute('data-tab');

    tabBtns.forEach(b => b.classList.remove('is-active'));
    tabPanes.forEach(p => p.classList.remove('is-active'));

    btn.classList.add('is-active');
    document.getElementById(`tab-${tabId}`).classList.add('is-active');
  });
});

/* ==================== ACCORDION ==================== */

const accordionBtns = document.querySelectorAll('.accordion-btn');

accordionBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const content = btn.nextElementSibling;
    const isOpen = content.classList.contains('is-open');

    document.querySelectorAll('.accordion-content').forEach(c => {
      c.classList.remove('is-open');
    });
    accordionBtns.forEach(b => {
      b.classList.remove('is-open');
    });

    if (!isOpen) {
      btn.classList.add('is-open');
      content.classList.add('is-open');
    }
  });
});

/* ==================== CTA BUTTONS ==================== */

const findBtn = document.getElementById('btn-find-automat');
const findFinalBtn = document.getElementById('btn-find-final');

if (findBtn) {
  findBtn.addEventListener('click', () => {
    alert('🗺️ Скоро откроется поиск ближайших автоматов!');
  });
}

if (findFinalBtn) {
  findFinalBtn.addEventListener('click', () => {
    alert('📍 Функция поиска в разработке. Скоро будет доступна!');
  });
}

/* ==================== SMOOTH SCROLL ==================== */

document.querySelectorAll('a[href^="#"]').forEach(link => {
  link.addEventListener('click', e => {
    const href = link.getAttribute('href');
    if (href === '#') return;

    const target = document.querySelector(href);
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});

/* ==================== NAV PILL ANIMATION ==================== */

let scrollPos = 0;

window.addEventListener('scroll', () => {
  scrollPos = window.scrollY;
  document.body.classList.toggle('is-scrolled', scrollPos > 60);
});

/* ==================== PAGE LOAD EFFECT ==================== */

window.addEventListener('load', () => {
  document.body.classList.add('is-loaded');
});

/* ==================== CORPORATE MODAL ==================== */

const corporateModal = document.getElementById('corporate-modal');
const btnCorporateModal = document.getElementById('btn-corporate-modal');
const btnCloseModal = document.getElementById('btn-close-modal');
const corporateForm = document.getElementById('corporate-form');

console.log('Modal elements:', { corporateModal, btnCorporateModal, btnCloseModal, corporateForm });

if (btnCorporateModal && corporateModal) {
  console.log('Adding click listener to corporate modal button');
  btnCorporateModal.addEventListener('click', (e) => {
    console.log('Corporate button clicked');
    e.preventDefault();
    corporateModal.classList.add('is-open');
  });
}

if (btnCloseModal && corporateModal) {
  btnCloseModal.addEventListener('click', () => {
    corporateModal.classList.remove('is-open');
  });
}

if (corporateModal) {
  corporateModal.addEventListener('click', (e) => {
    if (e.target === corporateModal) {
      corporateModal.classList.remove('is-open');
    }
  });
}

/* ==================== TELEGRAM SENDER (общий) ==================== */

const BOT_TOKEN = '8352645429:AAHqJeAimRHeXb66yc5i8WJ7eEfTD-teIZ0';
const CHAT_ID = '825592923';

function sendToTelegram(text) {
  return fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text,
      parse_mode: 'HTML'
    })
  }).then(res => res.json());
}

/* ==================== CORPORATE FORM → TELEGRAM ==================== */

if (corporateForm && corporateModal) {
  corporateForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const name = document.getElementById('corp-name').value.trim();
    const phone = document.getElementById('corp-phone').value.trim();

    if (!name || !phone) {
      alert('Пожалуйста, заполните имя и телефон.');
      return;
    }

    const submitBtn = corporateForm.querySelector('button[type="submit"], input[type="submit"]');
    const originalText = submitBtn ? (submitBtn.textContent || submitBtn.value) : '';

    if (submitBtn) {
      if (submitBtn.tagName === 'BUTTON') {
        submitBtn.textContent = 'Отправка...';
      } else {
        submitBtn.value = 'Отправка...';
      }
      submitBtn.disabled = true;
    }

    const message = `
📨 НОВЫЙ КОРПОРАТИВНЫЙ ЗАПРОС

👤 Имя: ${name}
📞 Телефон: ${phone}

🕒 Время: ${new Date().toLocaleString('ru-RU')}
    `;

    sendToTelegram(message)
      .then(data => {
        if (data.ok) {
          alert(`Спасибо, ${name}! Мы свяжемся с вами по номеру ${phone} в течение 24 часов.`);
          corporateForm.reset();
          corporateModal.classList.remove('is-open');
        } else {
          throw new Error(data.description || 'Ошибка отправки');
        }
      })
      .catch(err => {
        console.error('Ошибка отправки корпоративного запроса:', err);
        alert('❌ Ошибка отправки запроса. Пожалуйста, попробуйте ещё раз или свяжитесь с нами по телефону.');
      })
      .finally(() => {
        if (submitBtn) {
          if (submitBtn.tagName === 'BUTTON') {
            submitBtn.textContent = originalText;
          } else {
            submitBtn.value = originalText;
          }
          submitBtn.disabled = false;
        }
      });
  });
}

/* ==================== SUPPORT CONTACT FORM → TELEGRAM ==================== */

const supportForm = document.getElementById('support-contact-form');

if (supportForm) {
  supportForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const name = document.getElementById('support-name').value.trim();
    const contact = document.getElementById('support-contact').value.trim();

    if (!name || !contact) {
      alert('Пожалуйста, укажите имя и контакт (телефон или мессенджер).');
      return;
    }

    const submitBtn = supportForm.querySelector('button[type="submit"], input[type="submit"]');
    const originalText = submitBtn ? (submitBtn.textContent || submitBtn.value) : '';

    if (submitBtn) {
      if (submitBtn.tagName === 'BUTTON') {
        submitBtn.textContent = 'Отправка...';
      } else {
        submitBtn.value = 'Отправка...';
      }
      submitBtn.disabled = true;
    }

    const text = `
📨 ЗАПРОС НА ОБРАТНУЮ СВЯЗЬ

👤 Имя: ${name}
📞 Контакт: ${contact}

Источник: блок "Обратная связь" на лендинге
🕒 Время: ${new Date().toLocaleString('ru-RU')}
    `;

    sendToTelegram(text)
      .then(data => {
        if (data.ok) {
          alert('✅ Спасибо! Мы свяжемся с вами по указанным контактам.');
          supportForm.reset();
        } else {
          throw new Error(data.description || 'Ошибка отправки');
        }
      })
      .catch(err => {
        console.error('Ошибка отправки запроса на обратную связь:', err);
        alert('❌ Не удалось отправить запрос. Попробуйте ещё раз или используйте телефон/почту.');
      })
      .finally(() => {
        if (submitBtn) {
          if (submitBtn.tagName === 'BUTTON') {
            submitBtn.textContent = originalText;
          } else {
            submitBtn.value = originalText;
          }
          submitBtn.disabled = false;
        }
      });
  });
}


/* ==================== YANDEX MAP INTEGRATION ==================== */

// initialize map when API ready
function initYandexMap() {
  if (typeof ymaps === 'undefined') {
    console.warn('Yandex Maps API not available');
    return;
  }

  const mapEl = document.getElementById('map');
  if (!mapEl) return;

  // clear placeholder content so it doesn't show under the map
  mapEl.innerHTML = '';  

  const map = new ymaps.Map(mapEl, {
    center: [55.751574, 37.573856], // Москва по умолчанию
    zoom: 9,
    controls: ['zoomControl', 'fullscreenControl']
  });

  // load device locations from Firestore
  if (window.db) {
    db.collection('public_devices').get()
      .then(snapshot => {
        let firstCoords = null;
        snapshot.forEach(doc => {
          const d = doc.data();
          const lat = parseFloat(d.lat);
          const lng = parseFloat(d.lng);
          if (!isNaN(lat) && !isNaN(lng)) {
            const coords = [lat, lng];
            const placemark = new ymaps.Placemark(coords, {
              balloonContent: d.place_name || d.comment || '',
              hintContent: d.place_name || d.comment || ''
            });
            map.geoObjects.add(placemark);
            if (!firstCoords) firstCoords = coords;
          }
        });
        if (firstCoords) {
          map.setCenter(firstCoords);
          map.setZoom(12);
        }
      })
      .catch(err => console.error('Ошибка загрузки точек из Firestore', err));
  }

  // helper для геокодирования через JS API
  function geocodeAddress(addr) {
    return ymaps.geocode(addr, { results: 1 })
      .then(function(res) {
        const obj = res.geoObjects.get(0);
        return obj ? obj.geometry.getCoordinates() : null;
      });
  }

  // ������: �������� ���������� � ��������� �����
  geocodeAddress('�����, �����').then(coords => {
    if (coords) {
      const placemark = new ymaps.Placemark(coords, { balloonContent: '�����' });
      map.geoObjects.add(placemark);
      map.setCenter(coords);
    }
  });
}

// HTTP �������� (REST) ��� �������������� ������
function httpGeocode(query) {
  const url = 'https://geocode-maps.yandex.ru/1.x/?apikey=ab308eaf-3b28-4299-bba6-f130870295da&geocode=' + encodeURIComponent(query) + '&format=json';
  return fetch(url).then(r => r.json());
}

// wait for Yandex API to load
if (typeof ymaps !== 'undefined') {
  ymaps.ready(initYandexMap);
} else {
  // in case script loads later, attach listener
  window.addEventListener('load', () => {
    if (typeof ymaps !== 'undefined') ymaps.ready(initYandexMap);
  });
}

