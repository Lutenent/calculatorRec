const express = require('express');
const fs = require('fs');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');
const crypto = require('crypto');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 3000;

const BOT_TOKEN = '8292401321:AAFqU6moO8hum0_E0CDow6bgvQ6xcoGprsM';
const WEB_APP_URL = process.env.WEB_APP_URL || 'https://calculatorrec.onrender.com';
const MONGODB_URI = process.env.MONGODB_URI;

// Используем webhook на продакшене, polling локально
const useWebhook = process.env.NODE_ENV === 'production' || process.env.USE_WEBHOOK === 'true';
const bot = new TelegramBot(BOT_TOKEN, { polling: !useWebhook });

// Хранилище временных токенов
const authTokens = new Map();

app.use(express.json());
app.use(express.static('public'));

// MongoDB Schema
const userDataSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    rows: { type: Array, default: [] },
    rowCounter: { type: Number, default: 0 },
    userData: { type: Object, default: {} },
    records: { type: Array, default: [] },
    requisites: { type: Array, default: [] },
    updatedAt: { type: Date, default: Date.now }
});

const UserData = mongoose.model('UserData', userDataSchema);

// Подключение к MongoDB
if (MONGODB_URI) {
    mongoose.connect(MONGODB_URI, {
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
    })
        .then(() => {
            console.log('✅ Подключено к MongoDB');
            migrateFromJsonIfNeeded();
        })
        .catch(err => {
            console.error('❌ Ошибка подключения к MongoDB:', err.message);
            console.warn('⚠️ Продолжаем работу без MongoDB (данные будут теряться при перезапуске)');
        });
} else {
    console.warn('⚠️ MONGODB_URI не установлен. Используется локальное хранилище (данные будут теряться при перезапуске!)');
}

// Миграция данных из JSON файла (если есть)
async function migrateFromJsonIfNeeded() {
    const DATA_FILE = 'users_data.json';
    if (fs.existsSync(DATA_FILE)) {
        try {
            const jsonData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
            const count = await UserData.countDocuments();
            
            if (count === 0 && Object.keys(jsonData).length > 0) {
                console.log('📦 Миграция данных из JSON в MongoDB...');
                for (const [userId, data] of Object.entries(jsonData)) {
                    await UserData.findOneAndUpdate(
                        { userId },
                        { ...data, userId, updatedAt: new Date() },
                        { upsert: true, new: true }
                    );
                }
                console.log(`✅ Мигрировано ${Object.keys(jsonData).length} пользователей`);
            }
        } catch (error) {
            console.error('❌ Ошибка миграции:', error);
        }
    }
}

// Telegram бот - команда /start
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const firstName = msg.from.first_name;
    const lastName = msg.from.last_name || '';
    const username = msg.from.username || '';
    
    bot.sendMessage(chatId, 
        `👋 Привет, ${firstName}!\n\n` +
        `Добро пожаловать в систему учёта операций по карте.\n\n` +
        `Нажмите кнопку ниже, чтобы открыть приложение:`,
        {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🚀 Открыть приложение', web_app: { url: WEB_APP_URL } }]
                ]
            }
        }
    );
});

// Обработка данных из Web App
bot.on('web_app_data', (msg) => {
    const chatId = msg.chat.id;
    const data = JSON.parse(msg.web_app_data.data);
    
    bot.sendMessage(chatId, `Данные получены: ${JSON.stringify(data)}`);
});

// API для получения данных пользователя
app.get('/api/data/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        
        if (MONGODB_URI && mongoose.connection.readyState === 1) {
            const userData = await UserData.findOne({ userId });
            res.json(userData || { rows: [], rowCounter: 0 });
        } else {
            // Fallback на JSON файл (только для локальной разработки)
            const DATA_FILE = 'users_data.json';
            if (!fs.existsSync(DATA_FILE)) {
                fs.writeFileSync(DATA_FILE, JSON.stringify({}));
            }
            const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
            res.json(data[userId] || { rows: [], rowCounter: 0 });
        }
    } catch (error) {
        console.error('Ошибка получения данных:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// API для сохранения данных пользователя
app.post('/api/data/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        const userData = req.body;
        
        if (MONGODB_URI && mongoose.connection.readyState === 1) {
            await UserData.findOneAndUpdate(
                { userId },
                { ...userData, userId, updatedAt: new Date() },
                { upsert: true, new: true }
            );
            res.json({ success: true });
        } else {
            // Fallback на JSON файл (только для локальной разработки)
            const DATA_FILE = 'users_data.json';
            const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
            data[userId] = userData;
            fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
            res.json({ success: true });
        }
    } catch (error) {
        console.error('Ошибка сохранения данных:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// API для админов - получить список всех пользователей
app.get('/api/admin/users', async (req, res) => {
    try {
        if (MONGODB_URI && mongoose.connection.readyState === 1) {
            const users = await UserData.find({}, { userId: 1, userData: 1, records: 1, requisites: 1 });
            const formattedUsers = users.map(user => ({
                userId: user.userId,
                userData: user.userData,
                recordsCount: user.records?.length || 0,
                requisitesCount: user.requisites?.length || 0
            }));
            res.json(formattedUsers);
        } else {
            // Fallback на JSON файл
            const DATA_FILE = 'users_data.json';
            if (!fs.existsSync(DATA_FILE)) {
                return res.json([]);
            }
            const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
            const users = Object.keys(data).map(userId => ({
                userId: userId,
                userData: data[userId].userData,
                recordsCount: data[userId].records?.length || 0,
                requisitesCount: data[userId].requisites?.length || 0
            }));
            res.json(users);
        }
    } catch (error) {
        console.error('Ошибка получения списка пользователей:', error);
        res.json([]);
    }
});

// Настройка webhook для продакшена
if (useWebhook) {
    const WEBHOOK_URL = `${WEB_APP_URL}/bot${BOT_TOKEN}`;
    
    app.post(`/bot${BOT_TOKEN}`, (req, res) => {
        bot.processUpdate(req.body);
        res.sendStatus(200);
    });
    
    app.listen(PORT, async () => {
        console.log(`Сервер запущен на порту ${PORT}`);
        console.log(`Бот @flyer_amnyam_bot активен (webhook mode)`);
        try {
            await bot.setWebHook(WEBHOOK_URL);
            console.log(`Webhook установлен: ${WEBHOOK_URL}`);
        } catch (error) {
            console.error('Ошибка установки webhook:', error);
        }
    });
} else {
    app.listen(PORT, () => {
        console.log(`Сервер запущен на порту ${PORT}`);
        console.log(`Бот @flyer_amnyam_bot активен (polling mode)`);
    });
}
