# Инструкция по загрузке на GitHub

## Шаг 1: Проверка текущего состояния
```bash
cd dog-walks-app
git status
```

## Шаг 2: Добавление файлов в Git
```bash
git add .
git commit -m "Initial commit: Dog Walks App with duration tracking"
```

## Шаг 3: Подключение к GitHub
```bash
git remote add origin https://github.com/an-pit/dog-walks.git
git branch -M main
git push -u origin main
```

## Если возникли проблемы:

### Если репозиторий уже существует и не пустой:
```bash
git pull origin main --allow-unrelated-histories
git push origin main
```

### Если требуется авторизация:
```bash
# Убедитесь, что у вас есть доступ к репозиторию
# Если нужно, создайте personal access token в GitHub
```

## Проверка успешной загрузки:
1. Перейдите на https://github.com/an-pit/dog-walks
2. Убедитесь, что все файлы загружены
3. Проверьте структуру проекта

## Дополнительные файлы для Yandex Cloud:

### Образ загрузочного диска:
- **Тип**: Публичные образы
- **ОС**: Ubuntu 22.04 LTS
- **Архитектура**: Intel Ice Lake

### Альтернативы (если Ubuntu 22.04 недоступен):
- Ubuntu 20.04 LTS
- Debian 11

После загрузки на GitHub можно приступать к настройке Yandex Cloud по инструкции в DEPLOYMENT.md