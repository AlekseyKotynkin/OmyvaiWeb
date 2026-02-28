// Модальное окно обратной связи
const modal = document.getElementById('feedbackModal');
const contactBtns = document.querySelectorAll('.contact-button');
const closeBtns = document.querySelectorAll('.modal .close'); // несколько крестиков
const telegramForm = document.getElementById('telegramForm');
const formMessage = document.getElementById('form-message');

// Новое модальное окно для презентации
const presentationModal = document.getElementById('presentationModal');
const openPresentationBtn = document.getElementById('openPresentationModal');
const presentationForm = document.getElementById('presentationForm');
const presFormMessage = document.getElementById('pres-form-message');
const presDownloadBlock = document.getElementById('pres-download-block');

// Открытие модального окна обратной связи — вешаем обработчик на все кнопки
contactBtns.forEach(btn => {
    btn.addEventListener('click', function(e) {
        e.preventDefault();
        if (modal) modal.style.display = 'block';
    });
});

// Открытие модалки презентации
if (openPresentationBtn && presentationModal) {
    openPresentationBtn.addEventListener('click', function(e) {
        e.preventDefault();
        presentationModal.style.display = 'block';
    });
}

// Закрытие модальных окон по крестику
closeBtns.forEach(btn => {
    btn.addEventListener('click', function() {
        const parentModal = btn.closest('.modal');
        if (parentModal) parentModal.style.display = 'none';
    });
});

// Закрытие при клике вне окна
window.addEventListener('click', function(e) {
    if (e.target === modal) {
        modal.style.display = 'none';
    }
    if (e.target === presentationModal) {
        presentationModal.style.display = 'none';
    }
});

// Общая функция отправки формы в Telegram
const contactForm = document.getElementById('contactForm');

function sendFormToTelegram(form, options = {}) {
    const formData = new FormData(form);
    const submitBtn = form.querySelector('input[type="submit"]');
    const originalText = submitBtn ? submitBtn.value : '';

    if (submitBtn) {
        submitBtn.value = 'Отправка...';
        submitBtn.disabled = true;
    }

    if (form === telegramForm && formMessage)
        formMessage.style.display = 'none';
    if (form === presentationForm && presFormMessage)
        presFormMessage.style.display = 'none';

    // Формируем текст в зависимости от типа формы
    let message;

    if (options.type === 'presentation') {
        message = `
📥 ЗАПРОС ПРЕЗЕНТАЦИИ IoT‑ПЛАТФОРМЫ

👤 ФИО: ${formData.get('name')}
📧 Email: ${formData.get('email')}
🏢 Компания: ${formData.get('company') || ''}
📊 Планируемое количество автоматов: ${formData.get('count') || ''}

🕒 Время: ${new Date().toLocaleString('ru-RU')}
        `;
    } else {
        message = `
📨 НОВОЕ СООБЩЕНИЕ С САЙТА

👤 ФИО: ${formData.get('name')}
📞 Телефон: ${formData.get('phone') || formData.get('tel') || ''}
📧 Email: ${formData.get('email')}
💬 Сообщение: ${formData.get('message')}

🕒 Время: ${new Date().toLocaleString('ru-RU')}
        `;
    }

    const botToken = '8352645429:AAHqJeAimRHeXb66yc5i8WJ7eEfTD-teIZ0';
    const chatId = '825592923';

    return fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            chat_id: chatId,
            text: message,
            parse_mode: 'HTML'
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.ok) {
            if (form === telegramForm && formMessage) {
                showMessage('✅ Сообщение успешно отправлено! Мы свяжемся с вами в ближайшее время.', 'success');
                telegramForm.reset();
                const agreeCheckbox = document.getElementById('modal-agree');
                if (agreeCheckbox) agreeCheckbox.checked = false;
            } else if (form === presentationForm && presFormMessage) {
                // Успешная отправка формы презентации
                presFormMessage.textContent = '✅ Данные отправлены. Ниже доступна ссылка для скачивания презентации.';
                presFormMessage.style.display = 'block';
                presFormMessage.style.backgroundColor = '#d4edda';
                presFormMessage.style.color = '#155724';
                presFormMessage.style.border = '1px solid #c3e6cb';

                // Показываем блок со ссылкой
                if (presDownloadBlock) {
                    presDownloadBlock.style.display = 'block';
                }

                // при желании можно НЕ сбрасывать форму, чтобы человек видел, что он заполнил
                // presentationForm.reset();
            } else {
                alert('✅ Сообщение успешно отправлено! Мы свяжемся с вами в ближайшее время.');
                form.reset();
            }
        } else {
            throw new Error(data.description || 'Ошибка отправки');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        if (form === telegramForm && formMessage) {
            showMessage('❌ Ошибка отправки сообщения. Пожалуйста, попробуйте еще раз или свяжитесь с нами по телефону.', 'error');
        } else if (form === presentationForm && presFormMessage) {
            presFormMessage.textContent = '❌ Ошибка отправки. Попробуйте ещё раз или свяжитесь с нами по телефону.';
            presFormMessage.style.display = 'block';
            presFormMessage.style.backgroundColor = '#f8d7da';
            presFormMessage.style.color = '#721c24';
            presFormMessage.style.border = '1px solid #f5c6cb';
        } else {
            alert('❌ Ошибка отправки сообщения. Пожалуйста, попробуйте еще раз или свяжитесь с нами по телефону.');
        }
    })
    .finally(() => {
        if (submitBtn) {
            submitBtn.value = originalText;
            submitBtn.disabled = false;
        }
    });
}

// Привязываем обработчики к модальной форме и к футерной форме
if (telegramForm) {
    telegramForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const agreeCheckbox = document.getElementById('modal-agree');
        if (!agreeCheckbox.checked) {
            showMessage('❌ Пожалуйста, подтвердите согласие на обработку персональных данных', 'error');
            return;
        }
        
        sendFormToTelegram(telegramForm);
    });
}

if (contactForm) {
    contactForm.addEventListener('submit', function(e) {
        e.preventDefault();
        sendFormToTelegram(contactForm);
    });
}

// Обработчик формы презентации
if (presentationForm) {
    presentationForm.addEventListener('submit', function (e) {
        e.preventDefault();
        sendFormToTelegram(presentationForm, { type: 'presentation' });
    });
}

function showMessage(text, type) {
    if (formMessage) {
        formMessage.textContent = text;
        formMessage.style.display = 'block';
        formMessage.style.backgroundColor = type === 'success' ? '#d4edda' : '#f8d7da';
        formMessage.style.color = type === 'success' ? '#155724' : '#721c24';
        formMessage.style.border = type === 'success' ? '1px solid #c3e6cb' : '1px solid #f5c6cb';
        
        setTimeout(() => {
            formMessage.style.display = 'none';
        }, 5000);
    } else {
        alert(text);
    }
}

// Дополнительная функция для улучшения UX - закрытие модального окна после успешной отправки
function closeModalOnSuccess() {
    setTimeout(() => {
        if (modal) modal.style.display = 'none';
    }, 3000);
}

// Кнопки "Подробнее..." чтобы открывать модальное окно
document.addEventListener('DOMContentLoaded', function() {
    const additionalContactBtns = document.querySelectorAll('.button#contact-button');
    additionalContactBtns.forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            if (modal) modal.style.display = 'block';
        });
    });
});
