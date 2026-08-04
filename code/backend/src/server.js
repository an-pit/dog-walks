import express from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Подключение к базе данных
const dbPath = path.join(__dirname, '..', 'database', 'walks.db');
const db = new Database(dbPath);

// Валидация даты
function isValidDate(dateString) {
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateString)) return false;
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date);
}

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
    
    const walks = db.prepare(`
      SELECT * FROM walks 
      WHERE walk_date BETWEEN ? AND ? 
      ORDER BY walk_date, slot
    `).all(from, to);
    
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
    
    if (!['morning', 'afternoon', 'evening'].includes(slot)) {
      return res.status(400).json({ error: 'Неверный слот. Допустимые значения: morning, afternoon, evening' });
    }
    
    if (!['andrey', 'ira', 'both', 'none'].includes(person)) {
      return res.status(400).json({ error: 'Неверное значение person. Допустимые значения: andrey, ira, both, none' });
    }
    
    // Валидация длительности
    const durationNum = parseInt(duration);
    if (isNaN(durationNum) || durationNum < 0 || durationNum > 480) {
      return res.status(400).json({ error: 'Длительность должна быть числом от 0 до 480 минут' });
    }
    
    // Вставляем или обновляем запись
    const result = db.prepare(`
      INSERT INTO walks (walk_date, slot, person, duration, comments)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(walk_date, slot)
      DO UPDATE SET person = excluded.person, duration = excluded.duration, comments = excluded.comments, updated_at = CURRENT_TIMESTAMP
    `).run(date, slot, person, durationNum, comments);
    
    res.json({
      success: true,
      message: 'Прогулка обновлена',
      changes: result.changes
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
    
    // Получаем все прогулки за период
    const walks = db.prepare(`
      SELECT * FROM walks 
      WHERE walk_date BETWEEN ? AND ? 
      ORDER BY walk_date, slot
    `).all(from, to);
    
    // Считаем статистику
    const stats = {
      andrey: 0,
      ira: 0,
      total: walks.length,
      totalDuration: 0,
      andreyDuration: 0,
      iraDuration: 0
    };
    
    walks.forEach(walk => {
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
      walks: walks
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
    
    const walks = db.prepare(`
      SELECT * FROM walks 
      WHERE walk_date BETWEEN ? AND ? 
      ORDER BY walk_date, slot
    `).all(from, to);
    
    // Формируем CSV
    let csv = 'Дата,Слот,Кто гулял,Длительность (мин),Комментарий\n';
    
    walks.forEach(walk => {
      const personMap = {
        'andrey': 'Андрей',
        'ira': 'Ира',
        'both': 'Оба',
        'none': 'Никто'
      };
      
      const slotMap = {
        'morning': 'Утро',
        'afternoon': 'День',
        'evening': 'Вечер'
      };
      
      // Экранируем комментарии для CSV (заменяем запятые и кавычки)
      const escapedComments = (walk.comments || '').replace(/"/g, '""').replace(/,/g, ';');
      csv += `${walk.walk_date},${slotMap[walk.slot]},${personMap[walk.person]},${walk.duration || 0},"${escapedComments}"\n`;
    });
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=walks_${from}_${to}.csv`);
    res.send(csv);
  } catch (error) {
    console.error('Ошибка экспорта:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Запуск сервера
app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
  console.log(`📊 API доступно по адресу: http://localhost:${PORT}/api`);
});