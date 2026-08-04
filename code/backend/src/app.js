import express from 'express';
import cors from 'cors';

const SLOTS = ['morning', 'afternoon', 'evening'];
const PERSONS = ['andrey', 'ira', 'both', 'none'];
const MAX_DURATION = 480;

// Валидация даты
function isValidDate(dateString) {
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateString)) return false;
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date);
}

/**
 * Собирает Express-приложение поверх переданного подключения к базе.
 *
 * Приложение намеренно НЕ слушает порт — этим занимается server.js.
 * Благодаря этому тесты могут импортировать createApp, подсунуть базу
 * в памяти и дёргать эндпоинты напрямую, не поднимая настоящий сервер.
 */
export function createApp(db) {
  const app = express();

  app.use(cors());
  // Ограничение размера тела запроса: без него можно прислать мегабайты
  // текста в поле comments и раздуть базу.
  app.use(express.json({ limit: '100kb' }));

  // GET /api/health — для автодеплоя и мониторинга.
  // Выведен из-под Basic Auth в nginx, поэтому не раскрывает никаких данных.
  app.get('/api/health', (req, res) => {
    try {
      db.prepare('SELECT 1').get();
      res.json({
        status: 'ok',
        version: process.env.APP_VERSION || 'dev',
      });
    } catch (error) {
      console.error('Health-check не прошёл:', error);
      res.status(500).json({ status: 'error' });
    }
  });

  // GET /api/walks?from=YYYY-MM-DD&to=YYYY-MM-DD
  app.get('/api/walks', (req, res) => {
    try {
      const { from, to } = req.query;

      if (!from || !to) {
        return res.status(400).json({ error: 'Параметры from и to обязательны' });
      }

      if (!isValidDate(from) || !isValidDate(to)) {
        return res.status(400).json({ error: 'Неверный формат даты. Используйте YYYY-MM-DD' });
      }

      const walks = db
        .prepare(
          `SELECT * FROM walks
           WHERE walk_date BETWEEN ? AND ?
           ORDER BY walk_date, slot`
        )
        .all(from, to);

      res.json(walks);
    } catch (error) {
      console.error('Ошибка получения прогулок:', error);
      res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
  });

  // PUT /api/walks/:date/:slot
  app.put('/api/walks/:date/:slot', (req, res) => {
    try {
      const { date, slot } = req.params;
      const { person, duration = 0, comments = '' } = req.body;

      if (!isValidDate(date)) {
        return res.status(400).json({ error: 'Неверный формат даты. Используйте YYYY-MM-DD' });
      }

      if (!SLOTS.includes(slot)) {
        return res
          .status(400)
          .json({ error: `Неверный слот. Допустимые значения: ${SLOTS.join(', ')}` });
      }

      if (!PERSONS.includes(person)) {
        return res
          .status(400)
          .json({ error: `Неверное значение person. Допустимые значения: ${PERSONS.join(', ')}` });
      }

      const durationNum = parseInt(duration);
      if (isNaN(durationNum) || durationNum < 0 || durationNum > MAX_DURATION) {
        return res
          .status(400)
          .json({ error: `Длительность должна быть числом от 0 до ${MAX_DURATION} минут` });
      }

      const result = db
        .prepare(
          `INSERT INTO walks (walk_date, slot, person, duration, comments)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(walk_date, slot)
           DO UPDATE SET
             person = excluded.person,
             duration = excluded.duration,
             comments = excluded.comments,
             updated_at = CURRENT_TIMESTAMP`
        )
        .run(date, slot, person, durationNum, comments);

      res.json({
        success: true,
        message: 'Прогулка обновлена',
        changes: result.changes,
      });
    } catch (error) {
      console.error('Ошибка обновления прогулки:', error);
      res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
  });

  // GET /api/stats?from=YYYY-MM-DD&to=YYYY-MM-DD
  app.get('/api/stats', (req, res) => {
    try {
      const { from, to } = req.query;

      if (!from || !to) {
        return res.status(400).json({ error: 'Параметры from и to обязательны' });
      }

      if (!isValidDate(from) || !isValidDate(to)) {
        return res.status(400).json({ error: 'Неверный формат даты. Используйте YYYY-MM-DD' });
      }

      const walks = db
        .prepare(
          `SELECT * FROM walks
           WHERE walk_date BETWEEN ? AND ?
           ORDER BY walk_date, slot`
        )
        .all(from, to);

      const stats = {
        andrey: 0,
        ira: 0,
        total: walks.length,
        totalDuration: 0,
        andreyDuration: 0,
        iraDuration: 0,
      };

      walks.forEach((walk) => {
        const duration = walk.duration || 0;
        stats.totalDuration += duration;

        if (walk.person === 'andrey') {
          stats.andrey++;
          stats.andreyDuration += duration;
        }
        if (walk.person === 'ira') {
          stats.ira++;
          stats.iraDuration += duration;
        }
        if (walk.person === 'both') {
          stats.andrey++;
          stats.ira++;
          stats.andreyDuration += duration;
          stats.iraDuration += duration;
        }
      });

      res.json({
        period: { from, to },
        statistics: stats,
        walks: walks,
      });
    } catch (error) {
      console.error('Ошибка получения статистики:', error);
      res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
  });

  // GET /api/export?from=YYYY-MM-DD&to=YYYY-MM-DD
  app.get('/api/export', (req, res) => {
    try {
      const { from, to } = req.query;

      if (!from || !to) {
        return res.status(400).json({ error: 'Параметры from и to обязательны' });
      }

      if (!isValidDate(from) || !isValidDate(to)) {
        return res.status(400).json({ error: 'Неверный формат даты. Используйте YYYY-MM-DD' });
      }

      const walks = db
        .prepare(
          `SELECT * FROM walks
           WHERE walk_date BETWEEN ? AND ?
           ORDER BY walk_date, slot`
        )
        .all(from, to);

      const personMap = { andrey: 'Андрей', ira: 'Ира', both: 'Оба', none: 'Никто' };
      const slotMap = { morning: 'Утро', afternoon: 'День', evening: 'Вечер' };

      let csv = 'Дата,Слот,Кто гулял,Длительность (мин),Комментарий\n';

      walks.forEach((walk) => {
        const escapedComments = (walk.comments || '').replace(/"/g, '""').replace(/,/g, ';');
        csv += `${walk.walk_date},${slotMap[walk.slot]},${personMap[walk.person]},${walk.duration || 0},"${escapedComments}"\n`;
      });

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename=walks_${from}_${to}.csv`);
      res.send(csv);
    } catch (error) {
      console.error('Ошибка экспорта:', error);
      res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
  });

  return app;
}
