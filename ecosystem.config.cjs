// Конфигурация PM2 для прода.
//
// Расширение .cjs, а не .js: в package.json указан "type": "module",
// поэтому все .js в проекте считаются ES-модулями, а PM2 ждёт CommonJS
// с module.exports. Расширение .cjs явно говорит Node читать файл как CommonJS.
//
// Запуск на сервере:  pm2 start ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: 'dog-walks-backend',
      script: './code/backend/src/server.js',
      cwd: '/opt/dog-walks-app',

      instances: 1,
      autorestart: true,
      max_memory_restart: '300M',

      // Секреты подтягиваются из code/backend/.env, который лежит только
      // на сервере и закрыт .gitignore. Сам этот конфиг в репозитории,
      // поэтому ключи в него попасть не должны.
      // Флаг «-if-exists» нужен, чтобы приложение поднималось и без файла:
      // обычный --env-file упал бы с ошибкой.
      node_args: '--env-file-if-exists=code/backend/.env',

      // Логи с отметками времени — иначе непонятно, когда что случилось
      time: true,

      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        // База вынесена за пределы репозитория: деплой делает git reset --hard,
        // и внутри папки проекта она бы однажды не пережила выкатку
        DB_PATH: '/var/lib/dog-walks/walks.db',
      },
    },
  ],
};
