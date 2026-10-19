# Незакрытые вопросы, блокирующие этап «Модель продукта»

Статус этапа (`docs/01-product-model-generation.md`): **все 8 исходных блокирующих вопросов закрыты.** Этап продолжен, построены `ai-artifacts/00-input-index.md`, `ai-artifacts/01-product.model.json`, `ai-artifacts/04-generation-report.md`.

Последнее обновление: 2026-07-20, по ответам Product Manager.

---

## Решенные вопросы (подтверждены Product Manager, изменения внесены в requirements/)

| № | Тема | Итоговое решение | Файл |
| --- | --- | --- | --- |
| 1 | Объект продажи (тип/периодичность/цена) | Лицензия по подписке, цена по количеству касс, поддержка включена в подписку | `requirements/01-base/product-context.md` |
| 2 | Локализация | RU/EN по умолчанию, другие языки по запросу, обязательна таблица локализации с ключами | `requirements/04-quality/quality-requirements.md` |
| 3 | Задержка данных / SLA / хранение телеметрии | Близкая к realtime, SLA 99%, бессрочное хранение (обрезка вручную инженером сервиса) | `requirements/04-quality/quality-requirements.md` |
| 3 | Ожидаемый масштаб (сайзинг) | Три референсных профиля сети (малая/средняя/крупная) с числами магазинов и касс | `requirements/04-quality/quality-requirements.md` |
| 4 | Модель развертывания | On-premise у сети + доступ для сотрудников СЭТ | `requirements/03-architecture/technical-constraints.md` |
| 4 | Версии стека / резидентность данных | Версии — релизами вместе с Set Retail; данные в контуре сети; доступ СЭТ через VPN с аудитом | `requirements/03-architecture/technical-constraints.md` |
| 5 | Ввод магазина/кассы в эксплуатацию, возврат из ремонта | Автоматически по телеметрии из Set Retail, касса не пропадает из отчетности | `requirements/06-system-scenarios/system-scenarios.md` |
| 5б | Синхронизация/кластеризация касс | Подтверждено как out of scope продукта (зона ответственности Set Retail); риск дублирования чеков вынесен в отдельный технический вопрос к архитекторам Set Retail (не блокирует модель) | `requirements/06-system-scenarios/system-scenarios.md` |
| 6 | Сценарий директора магазина (ДМ) | Пятишаговый сценарий получения/выполнения задачи описан | `requirements/07-scenarios/business-scenarios.md` |
| 7 | Права доступа по ролям | Матрица прав ОД/РД/ДМ (data scope + действия) зафиксирована | `requirements/02-system/user-roles-and-functional-blocks.md` |
| 8 | Роли и функции тех.служб/поддержки/продуктовых команд | Роли подтверждены, функции каждой роли описаны | `requirements/02-system/user-roles-and-functional-blocks.md`, `requirements/01-base/product-context.md` |

---

## Все блокирующие вопросы закрыты

Последнее решение (2026-07-20): поставка/установка/обновление аналитической платформы идут тем же релизным механизмом, что и весь Set Retail (единая релизная сетка Set Retail 10); логирование и мониторинг — через единый лог-агрегатор, аналогичный применяемому в продуктах Set Retail; сбор метрик платформы ожидается через тот же механизм. См. `requirements/06-system-scenarios/system-scenarios.md`.

---

## Закрыто Product Manager, 2026-10-19 (перед картой функций)

| Тема | Решение | Файл |
| --- | --- | --- |
| ИИ-консультант | MVP3, после MVP2. Первые этапы собирают базовые метрики. Демо в прототипе не входит в MVP1/MVP2 | `requirements/02-system/ai-advisor-concept.md`, `requirements/01-base/product-context.md` |
| Страница «Другие технические причины» | Не входит в MVP1 и MVP2. Детализация страницы 5715099678 — MVP3 | `requirements/02-system/business-rules-and-formulas.md` |
| Нормативы | Все пороги живут в настройках (SCR-08). Стартовые значения прототипа подтверждены, включая доступность POS 95%, «не в эксплуатации» 30 дней и скорость обслуживания без цветовой шкалы | `requirements/02-system/business-rules-and-formulas.md` |

## Технические вопросы инженерам (не блокируют handoff)

- `requirements/06-system-scenarios/system-scenarios.md` → дублирование или потеря чеков при смене master-кассы.
- `requirements/06-system-scenarios/system-scenarios.md` → точный подход к логированию платформы.
- `requirements/02-system/entities-and-data-dictionary.md` → идентификаторы полей в Set.
- `requirements/05-integrations/integrations.md` → расшифровка «ЦСЛ» и протокол интеграции.
- `requirements/05-integrations/integrations.md` → аутентификация, авторизация и retry на границах интеграций.

Эти пункты перечислены в `ai-artifacts/09-github-spec-kit-handoff.md` как решения инженеров. Продуктовых блокеров для карты функций и handoff нет.
