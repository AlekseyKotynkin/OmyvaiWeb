document.addEventListener('DOMContentLoaded', function () {
  const frFinanceModal = document.getElementById('frFinanceModal');
  const openFrFinanceBtn = document.getElementById('openFrFinanceModal');
  const frFinanceForm = document.getElementById('frFinanceForm');
  const ffMsg = document.getElementById('ff-form-message');
  const ffDownload = document.getElementById('ff-download-block');

  const franchiseForm = document.getElementById('franchiseForm');
  const frFormMessage = document.getElementById('fr-form-message');

  const closeBtns = document.querySelectorAll('.modal .close');

  // Открытие модалки финмодели
  if (openFrFinanceBtn && frFinanceModal) {
    openFrFinanceBtn.addEventListener('click', function (e) {
      e.preventDefault();
      frFinanceModal.style.display = 'block';
    });
  }

  // Закрытие модалок (по крестику)
  closeBtns.forEach(btn => {
    btn.addEventListener('click', function () {
      const parentModal = btn.closest('.modal');
      if (parentModal) parentModal.style.display = 'none';
    });
  });

  // Закрытие модалок по фону
  window.addEventListener('click', function (e) {
    if (e.target === frFinanceModal) {
      frFinanceModal.style.display = 'none';
    }
  });

  // Отправка в Telegram
  function sendToTelegram(message, onSuccess, onError) {
    const botToken = 'XXX:YYYY'; // TODO: твой токен
    const chatId = '123456789';  // TODO: твой chat_id

    fetch('https://api.telegram.org/bot' + botToken + '/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML'
      })
    })
      .then(resp => resp.json())
      .then(data => {
        if (data.ok) {
          if (onSuccess) onSuccess();
        } else {
          throw new Error(data.description || 'Ошибка отправки');
        }
      })
      .catch(err => {
        console.error(err);
        if (onError) onError();
      });
  }

  // Форма финмодели
  if (frFinanceForm) {
    frFinanceForm.addEventListener('submit', function (e) {
      e.preventDefault();

      const name = document.getElementById('ff-name').value.trim();
      const email = document.getElementById('ff-email').value.trim();
      const region = document.getElementById('ff-region').value.trim();

      const msg =
        '📊 Запрос пример финансовой модели франшизы\n\n' +
        'Имя: ' + name + '\n' +
        'Email: ' + email + '\n' +
        'Регион: ' + region + '\n' +
        'Время: ' + new Date().toLocaleString('ru-RU');

      const submitBtn = frFinanceForm.querySelector('input[type="submit"]');
      const originalText = submitBtn ? submitBtn.value : '';

      if (submitBtn) {
        submitBtn.value = 'Отправка...';
        submitBtn.disabled = true;
      }

      if (ffMsg) {
        ffMsg.style.display = 'none';
      }

      sendToTelegram(
        msg,
        function () {
          if (ffMsg) {
            ffMsg.style.display = 'block';
            ffMsg.style.backgroundColor = '#d4edda';
            ffMsg.style.color = '#155724';
            ffMsg.style.border = '1px solid #c3e6cb';
            ffMsg.textContent =
              'Данные отправлены. Ниже доступна ссылка для скачивания примера финансовой модели.';
          }
          if (ffDownload) {
            ffDownload.style.display = 'block';
          }
          if (submitBtn) {
            submitBtn.value = originalText;
            submitBtn.disabled = false;
          }
        },
        function () {
          if (ffMsg) {
            ffMsg.style.display = 'block';
            ffMsg.style.backgroundColor = '#f8d7da';
            ffMsg.style.color = '#721c24';
            ffMsg.style.border = '1px solid #f5c6cb';
            ffMsg.textContent =
              'Ошибка отправки. Попробуйте ещё раз или свяжитесь с нами по телефону.';
          }
          if (submitBtn) {
            submitBtn.value = originalText;
            submitBtn.disabled = false;
          }
        }
      );
    });
  }

  // Форма заявки на франшизу
  if (franchiseForm) {
    franchiseForm.addEventListener('submit', function (e) {
      e.preventDefault();

      const name = document.getElementById('fr-name').value.trim();
      const phone = document.getElementById('fr-phone').value.trim();
      const email = document.getElementById('fr-email').value.trim();
      const region = document.getElementById('fr-region').value.trim();
      const experience = document.getElementById('fr-experience').value.trim();
      const count = document.getElementById('fr-count').value.trim();
      const comment = document.getElementById('fr-message').value.trim();
      const agree = document.getElementById('fr-agree');

      if (!agree || !agree.checked) {
        if (frFormMessage) {
          frFormMessage.style.display = 'block';
          frFormMessage.style.backgroundColor = '#f8d7da';
          frFormMessage.style.color = '#721c24';
          frFormMessage.style.border = '1px solid #f5c6cb';
          frFormMessage.textContent =
            'Пожалуйста, подтвердите согласие на обработку персональных данных.';
        }
        return;
      }

      const msg =
        '📨 Заявка на франшизу «Чистые Стёкла»\n\n' +
        'Имя: ' + name + '\n' +
        'Телефон: ' + phone + '\n' +
        'Email: ' + email + '\n' +
        'Регион: ' + region + '\n' +
        'Опыт в автобизнесе: ' + (experience || 'не указан') + '\n' +
        'Планируемое количество автоматов: ' + (count || 'не указано') + '\n' +
        'Комментарий: ' + (comment || 'нет') + '\n\n' +
        'Время: ' + new Date().toLocaleString('ru-RU');

      const submitBtn = franchiseForm.querySelector('input[type="submit"]');
      const originalText = submitBtn ? submitBtn.value : '';

      if (submitBtn) {
        submitBtn.value = 'Отправка...';
        submitBtn.disabled = true;
      }

      if (frFormMessage) {
        frFormMessage.style.display = 'none';
      }

      sendToTelegram(
        msg,
        function () {
          if (frFormMessage) {
            frFormMessage.style.display = 'block';
            frFormMessage.style.backgroundColor = '#d4edda';
            frFormMessage.style.color = '#155724';
            frFormMessage.style.border = '1px solid #c3e6cb';
            frFormMessage.textContent =
              'Заявка отправлена. Мы свяжемся с вами в ближайшее время.';
          }
          franchiseForm.reset();
          if (submitBtn) {
            submitBtn.value = originalText;
            submitBtn.disabled = false;
          }
        },
        function () {
          if (frFormMessage) {
            frFormMessage.style.display = 'block';
            frFormMessage.style.backgroundColor = '#f8d7da';
            frFormMessage.style.color = '#721c24';
            frFormMessage.style.border = '1px solid #f5c6cb';
            frFormMessage.textContent =
              'Ошибка отправки. Попробуйте ещё раз или свяжитесь с нами по телефону.';
          }
          if (submitBtn) {
            submitBtn.value = originalText;
            submitBtn.disabled = false;
          }
        }
      );
    });
  }
});
