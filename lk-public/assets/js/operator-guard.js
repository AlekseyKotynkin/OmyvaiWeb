// operator-guard.js
class OperatorGuard {
    constructor() {
        // Используем глобальные переменные из firebase-config.js
        this.auth = window.auth;
        this.db = window.db;
        this.isAuthenticated = false;
        this.isOperator = false;
        this.operatorEmail = null;
        this.operatorName = null;
    }

    async checkAuth() {
        return new Promise((resolve) => {
            if (!this.auth || !this.db) {
                console.error('Firebase не инициализирован');
                this.redirectToLogin();
                resolve(false);
                return;
            }

            this.auth.onAuthStateChanged(async (user) => {
                if (!user) {
                    this.redirectToLogin();
                    resolve(false);
                    return;
                }

                try {
                    // Ищем клиента по email
                    const querySnapshot = await this.db.collection('clients')
                        .where('clients_email', '==', user.email)
                        .limit(1)
                        .get();

                    if (querySnapshot.empty) {
                        console.log('Пользователь не найден в базе данных клиентов');
                        this.redirectToLogin();
                        resolve(false);
                        return;
                    }

                    const clientDoc = querySnapshot.docs[0];
                    const clientData = clientDoc.data();

                    // Проверяем условия для оператора
                    const isEnabled = clientData.clients_enabled === true;
                    const hasAccess = clientData.clients_email && clientData.clients_email.length > 0;

                    this.isOperator = isEnabled && hasAccess;

                    if (!this.isOperator) {
                        console.log('Нет прав оператора');
                        this.redirectToLogin();
                        resolve(false);
                        return;
                    }

                    this.isAuthenticated = true;
                    this.operatorEmail = user.email;
                    this.operatorName = clientData.clients_name || user.email;
                    
                    console.log('Оператор авторизован:', {
                        email: user.email,
                        name: this.operatorName
                    });
                    
                    // Сохраняем данные оператора в глобальной области
                    window.operatorGuard = this;
                    window.operatorData = {
                        email: user.email,
                        name: this.operatorName,
                        clientData: clientData,
                        clientId: clientDoc.id
                    };
                    
                    // Обновляем интерфейс с данными оператора
                    this.updateOperatorUI();
                    
                    // Генерируем событие для basic.js
                    document.dispatchEvent(new CustomEvent('operatorAuthorized', {
                        detail: { 
                            email: user.email,
                            name: this.operatorName,
                            clientData: clientData
                        }
                    }));
                    
                    resolve(true);
                    
                } catch (error) {
                    console.error('Ошибка проверки авторизации:', error);
                    this.redirectToLogin();
                    resolve(false);
                }
            });
        });
    }

    redirectToLogin() {
        console.log('Перенаправление на страницу входа');
        window.location.href = 'index.html';
    }

    // Обновляем UI с реальными данными оператора
    updateOperatorUI() {
        // Обновляем email в шапке
        const emailElement = document.querySelector('.header-user-email');
        if (emailElement && this.operatorEmail) {
            emailElement.textContent = this.operatorEmail;
        }
        
        // Обновляем имя оператора, если есть
        const roleElement = document.querySelector('.header-user-role');
        if (roleElement && this.operatorName) {
            // Если есть имя клиента, используем его, иначе оставляем "Оператор"
            if (this.operatorName !== this.operatorEmail) {
                roleElement.textContent = this.operatorName;
            }
        }
    }

    async logout() {
        // Показываем подтверждение
        if (!confirm('Вы уверены, что хотите выйти?')) {
            return;
        }
        
        try {
            // Показываем индикатор загрузки
            const logoutBtn = document.getElementById('logout-btn');
            if (logoutBtn) {
                const originalText = logoutBtn.textContent;
                logoutBtn.textContent = 'Выход...';
                logoutBtn.disabled = true;
            }
            
            if (this.auth) {
                await this.auth.signOut();
                console.log('Firebase выход выполнен');
            }
            
            // Очищаем все данные
            this.clearAuthData();
            
            // Перенаправляем на главную
            window.location.href = 'index.html';
            
        } catch (error) {
            console.error('Ошибка при выходе:', error);
            this.clearAuthData();
            window.location.href = 'index.html';
        }
    }

    clearAuthData() {
        console.log('Очистка данных авторизации...');
        
        // Очищаем localStorage
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.includes('firebase') || key.includes('auth') || key.includes('operator')) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(key => {
            localStorage.removeItem(key);
            console.log(`Удалено из localStorage: ${key}`);
        });
        
        // Очищаем sessionStorage
        sessionStorage.clear();
        console.log('sessionStorage очищен');
        
        // Очищаем куки связанные с авторизацией
        const cookies = document.cookie.split(";");
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i];
            const eqPos = cookie.indexOf("=");
            const name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim();
            
            // Удаляем куки связанные с firebase, auth, session
            if (name.includes('firebase') || name.includes('auth') || name.includes('session')) {
                document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
                console.log(`Удалена кука: ${name}`);
            }
        }
        
        // Очищаем глобальные переменные
        window.operatorGuard = null;
        window.operatorData = null;
        
        console.log('Все данные авторизации очищены');
    }
}

// Инициализация защиты оператора
document.addEventListener('DOMContentLoaded', async function() {
    // Проверяем, загружены ли Firebase сервисы
    if (!window.auth || !window.db) {
        console.error('Firebase сервисы не инициализированы. Проверьте firebase-config.js');
        alert('Ошибка инициализации системы. Пожалуйста, обновите страницу.');
        return;
    }

    // Создаем экземпляр защиты
    const guard = new OperatorGuard();
    
    // Проверяем авторизацию
    const isAuthorized = await guard.checkAuth();
    
    if (isAuthorized) {
        console.log('Пользователь авторизован как оператор');
        
        // Вешаем обработчик на кнопку выхода
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            // Удаляем предыдущие обработчики, чтобы избежать дублирования
            logoutBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                await guard.logout();
            });
            
            // Добавляем подсказку при наведении
            logoutBtn.title = `Выйти из аккаунта ${guard.operatorEmail || ''}`;
        }
        
        // Отображаем данные оператора в интерфейсе
        guard.updateOperatorUI();
        
    } else {
        console.log('Пользователь не авторизован или не имеет прав оператора');
        // Редирект произойдет в методе checkAuth
    }
});