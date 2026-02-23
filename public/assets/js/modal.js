// Модальное окно
const modal = document.getElementById('feedbackModal');
const contactBtns = document.querySelectorAll('.contact-button');
const closeBtn = document.querySelector('.close');
const telegramForm = document.getElementById('telegramForm');
const formMessage = document.getElementById('form-message');

// Открытие модального окна — вешаем обработчик на все кнопки
contactBtns.forEach(btn => {
    btn.addEventListener('click', function(e) {
        e.preventDefault();
        modal.style.display = 'block';
    });
});

// Закрытие модального окна
closeBtn.addEventListener('click', function() {
    modal.style.display = 'none';
});

// Закрытие при клике вне окна
window.addEventListener('click', function(e) {
    if (e.target === modal) {
        modal.style.display = 'none';
    }
});

// Общая функция отправки формы в Telegram
const contactForm = document.getElementById('contactForm');

function sendFormToTelegram(form) {
    const formData = new FormData(form);
    const submitBtn = form.querySelector('input[type="submit"]');
    const originalText = submitBtn ? submitBtn.value : '';

    if (submitBtn) {
        submitBtn.value = 'Отправка...';
        submitBtn.disabled = true;
    }

    if (form === telegramForm && formMessage)
        formMessage.style.display = 'none';

    const message = `
📨 НОВОЕ СООБЩЕНИЕ С САЙТА

👤 ФИО: ${formData.get('name')}
📞 Телефон: ${formData.get('phone') || formData.get('tel') || ''}
📧 Email: ${formData.get('email')}
💬 Сообщение: ${formData.get('message')}

🕒 Время: ${new Date().toLocaleString('ru-RU')}
    `;

    // Настройте эти параметры под ваш Telegram бот
    const botToken = '8352645429:AAHqJeAimRHeXb66yc5i8WJ7eEfTD-teIZ0'; // Замените на токен вашего бота
    const chatId = '825592923'; // Замените на ваш chat_id

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
                // Сбрасываем чекбокс после успешной отправки
                const agreeCheckbox = document.getElementById('modal-agree');
                if (agreeCheckbox) agreeCheckbox.checked = false;
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

// Привязываем обработчики к модальной форме и к футерной форме (если есть)
if (telegramForm) {
    telegramForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        // Проверяем согласие на обработку данных
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

function showMessage(text, type) {
    if (formMessage) {
        formMessage.textContent = text;
        formMessage.style.display = 'block';
        formMessage.style.backgroundColor = type === 'success' ? '#d4edda' : '#f8d7da';
        formMessage.style.color = type === 'success' ? '#155724' : '#721c24';
        formMessage.style.border = type === 'success' ? '1px solid #c3e6cb' : '1px solid #f5c6cb';
        
        // Автоматически скрываем сообщение через 5 секунд
        setTimeout(() => {
            formMessage.style.display = 'none';
        }, 5000);
    } else {
        // Если formMessage не найден, используем alert
        alert(text);
    }
}

// Дополнительная функция для улучшения UX - закрытие модального окна после успешной отправки
function closeModalOnSuccess() {
    setTimeout(() => {
        modal.style.display = 'none';
    }, 3000);
}

// Добавляем обработчик для кнопок "Подробнее..." чтобы открывать модальное окно
document.addEventListener('DOMContentLoaded', function() {
    // Убедимся, что все кнопки с классом .button и id="contact-button" работают
    const additionalContactBtns = document.querySelectorAll('.button#contact-button');
    additionalContactBtns.forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            modal.style.display = 'block';
        });
    });
});