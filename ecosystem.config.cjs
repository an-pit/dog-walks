module.exports = {
  apps: [
    {
      name: 'dog-walks-backend',
      script: './code/backend/src/server.js',
      cwd: '/opt/dog-walks-app',

      instances: 1,
      autorestart: true,
      max_memory_restart: '300M',

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
