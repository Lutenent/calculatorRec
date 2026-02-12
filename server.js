const express = require('express');
const fs = require('fs');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

const BOT_TOKEN = '8292401321:AAFqU6moO8hum0_E0CDow6bgvQ6xcoGprsM';
const WEB_APP_URL = process.env.WEB_APP_URL || 'https://calculatorrec.onrender.com';

// Используем webhook на продакшене, polling локально
const useWebhook = process.env.NODE_ENV === 'production' || process.env.USE_WEBHOOK === 'true';
const bot = new TelegramBot(BOT_TOKEN, { polling: !useWebhook });

// Хранилище временных токенов
const authTokens = new Map();

app.use(express.json());
app.use(express.static('public'));

const DATA_FILE = 'users_data.json';

// Инициализация файла данных
if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({}));
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
app.get('/api/data/:userId', (req, res) => {
    const userId = req.params.userId;
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    res.json(data[userId] || { rows: [], rowCounter: 0 });
});

// API для сохранения данных пользователя
app.post('/api/data/:userId', (req, res) => {
    const userId = req.params.userId;
    const userData = req.body;
    
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    data[userId] = userData;
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    
    res.json({ success: true });
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


