// lk-index.js
const loginForm = document.getElementById('loginForm');
const signupForm = document.getElementById('signupForm');
const showSignup = document.getElementById('showSignup');
const showLogin = document.getElementById('showLogin');
const authMsg = document.getElementById('authMsg');
const lkAuth = document.getElementById('lkAuth');
const forgotPasswordLink = document.getElementById('forgotPasswordLink');


function showAuthMessage(text, isError){
    if (!authMsg) return;
    authMsg.style.display = 'block';
    authMsg.textContent = text;
    authMsg.style.color = isError ? '#a94442' : '#155724';
    authMsg.style.background = isError ? '#f8d7da' : '#d4edda';
}

function clearAuthMessage() {
    if (!authMsg) return;
    authMsg.style.display = 'none';
    authMsg.textContent = '';
  }

// Показываем/скрываем формы регистрации/входа
if (showSignup) showSignup.addEventListener('click', function(e){
    e.preventDefault();
    clearAuthMessage();
    loginForm.style.display = 'none';
    signupForm.style.display = '';
});

if (showLogin) showLogin.addEventListener('click', function(e){
    e.preventDefault();
    clearAuthMessage();
    signupForm.style.display = 'none';
    loginForm.style.display = '';
});

// Функция для проверки прав оператора
async function checkOperatorAccess(userEmail) {
    try {
        if (!window.db) {
            console.error('Firestore не инициализирован');
            return { isOperator: false, error: 'База данных не доступна' };
        }

        // Ищем клиента по email
        const clientsRef = window.db.collection('clients');
        const querySnapshot = await clientsRef
            .where('clients_email', '==', userEmail)
            .limit(1)
            .get();

        if (querySnapshot.empty) {
            console.log('Пользователь не найден в базе данных клиентов');
            return {
                isOperator: false,
                error: 'Аккаунт ещё не привязан к клиенту. Напишите на info@omyvai.ru для выдачи прав администратора.'
              };
              
        }

        const clientDoc = querySnapshot.docs[0];
        const clientData = clientDoc.data();

        // Проверяем условия для оператора
        const isEnabled = clientData.clients_enabled === true;
        const hasAccess = clientData.clients_email && clientData.clients_email.length > 0;

        console.log('Данные клиента:', {
            email: clientData.clients_email,
            enabled: clientData.clients_enabled,
            createdAt: clientData.clients_createdAt,
            devices: clientData.clients_devices_array
        });

        if (isEnabled && hasAccess) {
            return { 
                isOperator: true, 
                clientData: clientData,
                clientId: clientDoc.id
            };
        } else {
            return { 
                isOperator: false, 
                error: !isEnabled ? 'Аккаунт отключен' : 'Нет доступа'
            };
        }
    } catch (error) {
        console.error('Ошибка проверки прав оператора:', error);
        return { isOperator: false, error: error.message };
    }
}

// Вход
if (loginForm) loginForm.addEventListener('submit', async function(e){
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    
    // Проверяем, что Firebase инициализирован
    if (!window.auth) {
        showAuthMessage('Ошибка: Firebase не инициализирован', true);
        console.error('Firebase auth не найден');
        return;
    }
    
    try {
        showAuthMessage('Вход выполняется...', false);
        
        // Авторизация в Firebase
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        const user = userCredential.user;
        
        // Проверяем права оператора
        const operatorCheck = await checkOperatorAccess(email);
        
        if (operatorCheck.isOperator) {
            showAuthMessage('Вход выполнен успешно! Перенаправление...', false);
            
            // ИМЕННО ЗДЕСЬ - перенаправляем сразу на панель оператора
            window.location.href = 'commen.html';
            
        } else {
            showAuthMessage(`Доступ запрещен: ${operatorCheck.error || 'Нет прав оператора'}`, true);
            await auth.signOut();
        }
    } catch (err) {
        console.error('Ошибка входа:', err);
        showAuthMessage(err.message || 'Ошибка входа', true);
    }
});

if (forgotPasswordLink) {
    forgotPasswordLink.addEventListener('click', async function(e) {
      e.preventDefault();
  
      const emailInput = document.getElementById('login-email');
      const email = emailInput ? emailInput.value.trim() : '';
  
      if (!email) {
        showAuthMessage('Укажите email, чтобы восстановить пароль.', true);
        if (emailInput) emailInput.focus();
        return;
      }
  
      if (!window.auth) {
        showAuthMessage('Ошибка: Firebase не инициализирован', true);
        console.error('Firebase auth не найден');
        return;
      }
  
      try {
        showAuthMessage('Отправляем письмо для восстановления пароля...', false);
  
        const payload = {
          emails: [
            {
              to: email,
              subject: 'Восстановление доступа к бонусной программе OmyVai'
              // body не передаём — шаблон и resetLink сформирует Cloud Function
            }
          ]
        };
  
        const resp = await fetch('https://functions.yandexcloud.net/d4e2i1khkl3054osbtc6', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
  
        if (!resp.ok) {
          const text = await resp.text();
          console.error('Ошибка отправки письма восстановления:', text);
          showAuthMessage('Не удалось отправить письмо. Попробуйте позже.', true);
          return;
        }
  
        const result = await resp.json();
        if (result.success) {
          showAuthMessage('Письмо со ссылкой для восстановления пароля отправлено на указанный email.', false);
        } else {
          console.error('Email service error:', result);
          showAuthMessage('Не удалось отправить письмо. Попробуйте позже.', true);
        }
      } catch (err) {
        console.error('Ошибка восстановления пароля:', err);
        showAuthMessage('Ошибка восстановления пароля. Попробуйте позже.', true);
      }
    });
}
  
// Регистрация с отправкой письма подтверждения / установки пароля

if (signupForm) signupForm.addEventListener('submit', async function(e) {
    e.preventDefault();
  
    const email = document.getElementById('signup-email').value.trim();
    const consentCheckbox = document.getElementById('signup-consent');
  
    if (!window.auth || !window.db) {
      showAuthMessage('Ошибка: Firebase не инициализирован', true);
      console.error('Firebase auth/db не найдены');
      return;
    }
  
    if (!email) {
      showAuthMessage('Укажите email для регистрации', true);
      return;
    }
  
    if (!consentCheckbox || !consentCheckbox.checked) {
      showAuthMessage('Для регистрации необходимо принять условия соглашения и политики.', true);
      return;
    }
  
    try {
      showAuthMessage('Проверяем пользователя...', false);
  
      // 1. Проверяем, есть ли уже аккаунт с таким email
      const methods = await auth.fetchSignInMethodsForEmail(email);
      const userExists = methods && methods.length > 0;
  
      if (userExists) {
        showAuthMessage('Пользователь с таким email уже зарегистрирован.', true);
        return;
      }
  
      // 2. Временный пароль
      const tempPassword = Math.random().toString(36).slice(-12);
  
      showAuthMessage('Регистрация выполняется...', false);
  
      const userCred = await auth.createUserWithEmailAndPassword(email, tempPassword);
      const uid = userCred.user.uid;
   
      // 4. Письмо для установки пароля через Cloud Function регистрации
      try {
        const payload = {
          emails: [
            {
              to: email,
              subject: 'Добро пожаловать в личный кабинет администратора OmyVai',
            }
          ]
        };
  
        const resp = await fetch('https://functions.yandexcloud.net/d4edapns5jkt5nna8uba', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
  
        if (!resp.ok) {
          const text = await resp.text();
          console.error('Ошибка отправки письма регистрации:', text);
        }
      } catch (mailErr) {
        console.error('Ошибка вызова функции регистрации-почты:', mailErr);
      }
  
      showAuthMessage(
        'Аккаунт создан. На указанную почту отправлено письмо для установки пароля.',
        false
      );
    } catch (err) {
      console.error('Ошибка регистрации:', err);
      showAuthMessage(err.message || 'Ошибка регистрации', true);
    }
  }); 

// Отслеживаем состояние авторизации при загрузке страницы
if (window.auth) {
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            // Пользователь уже вошел - проверяем права
            try {
                const operatorCheck = await checkOperatorAccess(user.email);
                
                if (operatorCheck.isOperator) {
                    // Сразу перенаправляем на панель оператора
                    window.location.href = 'commen.html';
                
                } else {
                    // Не оператор - показываем форму входа
                    if (lkAuth) lkAuth.style.display = '';
                    showAuthMessage(`Требуются права оператора: ${operatorCheck.error || 'Нет доступа'}`, true);
                    await auth.signOut();
                }
            } catch (error) {
                console.error('Ошибка проверки прав:', error);
                if (lkAuth) lkAuth.style.display = '';
            }
        } else {
            // Пользователь не вошел
            if (lkAuth) lkAuth.style.display = '';
            if (loginForm) loginForm.style.display = '';
            if (signupForm) signupForm.style.display = 'none';
        }
    });
} else {
    console.error('Firebase auth не найден - показываем форму входа');
    if (lkAuth) lkAuth.style.display = '';
}

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', function() {
    // Убрана несуществующая функция addSignOutToNav()
    console.log('lk-index.js загружен');
});