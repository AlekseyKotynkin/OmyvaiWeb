// firebase-config.js

// Безопасная инициализация Firebase
(function() {
    // Конфигурация Firebase (в реальном проекте лучше использовать environment variables)
    const firebaseConfig = {
        apiKey: "AIzaSyDiK5c7z54IC6v949H9EQdbRutskX7SNGc",
        authDomain: "omyvai.firebaseapp.com",
        projectId: "omyvai",
        storageBucket: "omyvai.firebasestorage.app",
        messagingSenderId: "307297030524",
        appId: "1:307297030524:web:720a80f7f3575f030694f9",
        measurementId: "G-T31397Q7MZ",

        databaseURL: "https://omyvai-default-rtdb.europe-west1.firebasedatabase.app"
    };

    // Инициализация Firebase
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }

    // Экспорт сервисов
    window.auth = firebase.auth();
    window.db = firebase.firestore();
    window.rtdb = firebase.database();
    window.firebase = firebase;
    
    // Включение отслеживания для отладки (отключить в продакшене)
    if (window.location.hostname === 'localhost') {
        firebase.firestore().settings({
            host: 'localhost:8080',
            ssl: false
        });
    }
})();