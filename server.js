const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

const DATA_FILE = 'users_data.json';

// Инициализация файла данных
if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({}));
}

// Получить данные пользователя
app.get('/api/data/:userId', (req, res) => {
    const userId = req.params.userId;
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    res.json(data[userId] || { rows: [], rowCounter: 0 });
});

// Сохранить данные пользователя
app.post('/api/data/:userId', (req, res) => {
    const userId = req.params.userId;
    const userData = req.body;
    
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    data[userId] = userData;
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    
    res.json({ success: true });
});

app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});

