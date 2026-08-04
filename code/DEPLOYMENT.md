# Инструкция по деплою на Yandex Cloud

## 1. Регистрация и настройка Yandex Cloud

### 1.1 Регистрация
1. Перейдите на [yandex.cloud](https://cloud.yandex.ru/)
2. Зарегистрируйтесь и подтвердите аккаунт
3. Новым пользователям предоставляется грант 10 000 ₽ на 60 дней

### 1.2 Создание облака и каталога
1. В консоли управления создайте новое облако
2. Создайте каталог для проекта (например, "dog-walks-app")

## 2. Создание виртуальной машины

### 2.1 Настройка VM
1. Перейдите в раздел "Compute Cloud" → "Виртуальные машины"
2. Нажмите "Создать ВМ"
3. Настройки:
   - **Имя**: `dog-walks-server`
   - **Зона доступности**: `ru-central1-a`
   - **Платформа**: Intel Ice Lake
   - **Конфигурация**: 2 vCPU, 2 GB RAM
   - **Диск**: 20 GB SSD
   - **Образ**: Ubuntu 22.04 LTS

### 2.2 Сетевые настройки
- **Публичный IP**: Автоматически
- **Группа безопасности**: Разрешить HTTP (80), HTTPS (443), SSH (22)

## 3. Настройка сервера

### 3.1 Подключение к серверу
```bash
ssh ubuntu@<IP-адрес-сервера>
```

### 3.2 Установка зависимостей
```bash
# Обновление системы
sudo apt update && sudo apt upgrade -y

# Установка Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Установка Nginx
sudo apt install nginx -y

# Установка PM2
sudo npm install -g pm2
```

### 3.3 Настройка firewall
```bash
sudo ufw allow 'Nginx Full'
sudo ufw allow 'OpenSSH'
sudo ufw enable
```

## 4. Деплой приложения

### 4.1 Копирование файлов
```bash
# Создание директории проекта
sudo mkdir -p /opt/dog-walks-app
sudo chown ubuntu:ubuntu /opt/dog-walks-app

# Копирование файлов (через Git или SCP)
cd /opt/dog-walks-app
git clone <ваш-репозиторий> .
# Или через SCP:
# scp -r ./dog-walks-app/* ubuntu@<IP-адрес>:/opt/dog-walks-app/
```

### 4.2 Установка зависимостей
```bash
cd /opt/dog-walks-app
npm run install:all
```

### 4.3 Сборка фронтенда
```bash
cd frontend
npm run build
```

### 4.4 Настройка базы данных
```bash
cd ../backend
npm run migrate
```

## 5. Настройка Nginx

### 5.1 Создание конфигурации
```bash
sudo nano /etc/nginx/sites-available/dog-walks-app
```

### 5.2 Конфигурация Nginx
```nginx
server {
    listen 80;
    server_name ваш-домен.com;  # или IP-адрес

    # Frontend статика
    location / {
        root /opt/dog-walks-app/frontend/dist;
        try_files $uri $uri/ /index.html;
        index index.html;
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

    # Статические файлы
    location /assets {
        root /opt/dog-walks-app/frontend/dist;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

### 5.3 Активация конфигурации
```bash
sudo ln -s /etc/nginx/sites-available/dog-walks-app /etc/nginx/sites-enabled/
sudo nginx -t  # Проверка конфигурации
sudo systemctl reload nginx
```

## 6. Настройка PM2

### 6.1 Создание ecosystem файла
```bash
cd /opt/dog-walks-app/backend
pm2 ecosystem
```

### 6.2 Редактирование ecosystem.config.js
```javascript
module.exports = {
  apps: [{
    name: 'dog-walks-backend',
    script: './src/server.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    }
  }]
};
```

### 6.3 Запуск приложения
```bash
pm2 start ecosystem.config.js
pm2 startup
pm2 save
```

## 7. Настройка HTTPS (опционально)

### 7.1 Установка Certbot
```bash
sudo apt install certbot python3-certbot-nginx -y
```

### 7.2 Получение SSL сертификата
```bash
sudo certbot --nginx -d ваш-домен.com
```

### 7.3 Автоматическое обновление
```bash
sudo crontab -e
# Добавить строку:
# 0 12 * * * /usr/bin/certbot renew --quiet
```

## 8. Бэкапы базы данных

### 8.1 Создание скрипта бэкапа
```bash
sudo nano /opt/dog-walks-app/backup-db.sh
```

```bash
#!/bin/bash
BACKUP_DIR="/opt/dog-walks-app/backups"
DATE=$(date +%Y%m%d_%H%M%S)
DB_FILE="/opt/dog-walks-app/backend/database/walks.db"

mkdir -p $BACKUP_DIR
cp $DB_FILE "$BACKUP_DIR/walks_$DATE.db"

# Удаляем старые бэкапы (старше 30 дней)
find $BACKUP_DIR -name "walks_*.db" -mtime +30 -delete
```

### 8.2 Настройка cron для бэкапов
```bash
sudo crontab -e
# Добавить строку:
# 0 2 * * * /bin/bash /opt/dog-walks-app/backup-db.sh
```

## 9. Мониторинг и логи

### 9.1 Просмотр логов PM2
```bash
pm2 logs dog-walks-backend
```

### 9.2 Просмотр логов Nginx
```bash
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

## 10. Обновление приложения

### 10.1 Процесс обновления
```bash
# Остановка приложения
pm2 stop dog-walks-backend

# Обновление кода
git pull origin main

# Переустановка зависимостей
npm run install:all

# Пересборка фронтенда
cd frontend && npm run build && cd ..

# Запуск приложения
pm2 start dog-walks-backend
```

## 11. Стоимость хостинга

| Ресурс | Цена/мес |
|--------|----------|
| VM (2 vCPU, 2 GB RAM) | ~700 ₽ |
| Диск 20 GB SSD | ~150 ₽ |
| Исходящий трафик (до 1 GB) | бесплатно |
| **Итого** | **~850 ₽/мес** |

## 12. Тестирование

После деплоя проверьте:
1. Доступность сайта по домену/IP
2. Работу API эндпоинтов
3. Адаптивность на мобильных устройствах
4. Функциональность всех компонентов

## 13. Устранение неполадок

### 13.1 Проверка статуса сервисов
```bash
sudo systemctl status nginx
pm2 status
```

### 13.2 Проверка портов
```bash
sudo netstat -tulpn | grep :80
sudo netstat -tulpn | grep :3000
```

### 13.3 Перезапуск сервисов
```bash
sudo systemctl restart nginx
pm2 restart dog-walks-backend