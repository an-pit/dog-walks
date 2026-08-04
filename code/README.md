# 🐕 Dog Walks App

Приложение для удобного учёта прогулок с собакой между двумя людьми (Андрей и Ира).

## ✨ Возможности

- **Недельный календарь** - просмотр и редактирование прогулок на неделю
- **Дневной вид** - удобный просмотр на мобильных устройствах
- **Статистика** - подсчёт прогулок и времени за разные периоды
- **Экспорт данных** - выгрузка в CSV формат
- **Адаптивный дизайн** - работает на компьютерах и телефонах
- **Учёт длительности** - запись времени прогулки в минутах

## 🏗️ Технологии

### Frontend
- React 18 + Vite
- CSS Grid/Flexbox для адаптивности
- ES6 Modules

### Backend
- Node.js + Express
- SQLite (файловая база данных)
- REST API

## 📦 Установка и запуск

### Предварительные требования
- Node.js 18+ и npm

### 1. Клонирование и установка зависимостей

```bash
# Установка зависимостей для всего проекта
cd dog-walks-app
npm run install:all
```

### 2. Настройка базы данных

```bash
# Создание базы данных
cd backend
npm run migrate
```

### 3. Запуск в режиме разработки

#### Вариант A: Запуск отдельно
```bash
# Терминал 1 - Backend
cd backend
npm run dev

# Терминал 2 - Frontend  
cd frontend
npm run dev
```

#### Вариант B: Через корневой package.json
```bash
# Терминал 1 - Backend
npm run dev:backend

# Терминал 2 - Frontend
npm run dev:frontend
```

### 4. Доступ к приложению

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3000/api

## 🚀 Деплой на Yandex Cloud

### 1. Подготовка к деплою

```bash
# Сборка фронтенда
cd frontend
npm run build
```

### 2. Настройка Yandex Cloud VM

1. **Создание виртуальной машины**
   - Образ: Ubuntu 22.04 LTS
   - Платформа: Intel Ice Lake
   - Конфигурация: 2 vCPU, 2 GB RAM
   - Диск: 20 GB SSD

2. **Установка зависимостей на сервере**
```bash
# Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Nginx
sudo apt install nginx

# PM2
sudo npm install -g pm2
```

3. **Настройка Nginx**
```nginx
server {
    listen 80;
    server_name your-domain.com;

    # Frontend статика
    location / {
        root /path/to/frontend/dist;
        try_files $uri $uri/ /index.html;
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

4. **Настройка PM2**
```bash
# Создание ecosystem.config.js
pm2 ecosystem

# Запуск приложения
pm2 start ecosystem.config.js
pm2 startup
pm2 save
```

## 📊 API Endpoints

| Метод | Endpoint | Описание |
|-------|----------|----------|
| `GET` | `/api/walks?from=YYYY-MM-DD&to=YYYY-MM-DD` | Получить прогулки за период |
| `PUT` | `/api/walks/:date/:slot` | Обновить прогулку |
| `GET` | `/api/stats?from=YYYY-MM-DD&to=YYYY-MM-DD` | Статистика за период |
| `GET` | `/api/export?from=YYYY-MM-DD&to=YYYY-MM-DD` | Экспорт в CSV |

## 🎨 Интерфейс

### Цветовая схема
- 🔵 **Андрей** - синий (#3498db)
- 🟣 **Ира** - фиолетовый (#9b59b6)  
- 🟢 **Оба** - зелёный (#2ecc71)
- ⬜ **Никто** - серый (#ecf0f1)

### Слоты времени
- **Утро** - утренняя прогулка
- **День** - дневная прогулка
- **Вечер** - вечерняя прогулка

## 💰 Стоимость хостинга

| Ресурс | Цена/мес |
|--------|----------|
| Yandex Cloud VM (2 vCPU, 2 GB RAM) | ~700 ₽ |
| Диск 20 GB SSD | ~150 ₽ |
| **Итого** | **~850 ₽/мес** |

## 🔧 Разработка

### Структура проекта
```
dog-walks-app/
├── backend/           # Node.js сервер
│   ├── src/
│   │   ├── server.js     # Основной сервер
│   │   └── migrate.js    # Миграции БД
│   ├── database/         # SQLite файлы
│   └── package.json
├── frontend/          # React приложение
│   ├── src/
│   │   ├── components/   # React компоненты
│   │   ├── services/     # API сервисы
│   │   └── ...
│   └── package.json
└── package.json       # Корневой package.json
```

### Скрипты
- `npm run dev:backend` - запуск backend в режиме разработки
- `npm run dev:frontend` - запуск frontend в режиме разработки
- `npm run build:frontend` - сборка frontend для продакшена
- `npm run start:backend` - запуск backend в продакшене

## 📝 Лицензия

MIT License