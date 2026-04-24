# Dog Walks Backend

Backend сервер для приложения учёта прогулок с собакой.

## Установка

```bash
npm install
```

## Запуск

1. Создать базу данных:
```bash
npm run migrate
```

2. Запустить сервер в режиме разработки:
```bash
npm run dev
```

3. Или запустить в продакшн режиме:
```bash
npm start
```

## API Endpoints

- `GET /api/walks?from=YYYY-MM-DD&to=YYYY-MM-DD` - получить прогулки за период
- `PUT /api/walks/:date/:slot` - установить кто гулял
- `GET /api/stats?from=YYYY-MM-DD&to=YYYY-MM-DD` - статистика за период
- `GET /api/export?from=YYYY-MM-DD&to=YYYY-MM-DD` - выгрузка CSV

## Структура данных

Таблица `walks`:
- `walk_date` - дата в формате YYYY-MM-DD
- `slot` - слот: morning/afternoon/evening
- `person` - кто гулял: andrey/ira/both/none