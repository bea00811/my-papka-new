# Securities Crediting — куда вставлять в lk_m

Цель: форма **Зачисление ценных бумаг** по аналогии со списанием.
Эндпоинты: `/v1/nontrade/securities/crediting*`.
Общее со списанием: `contractors`, `doc_types`, upload `/nontrade/securities/file`.
Список инструментов: временно из `writeoff/params` (как договорились), после выбора инструмента — `crediting/params?depoInstrument_Id=`.

## 1. Константы API — `src/core/api/apiConstants.ts`

Добавить рядом с writeoff:

```ts
// Зачисление ценных бумаг
export const API_REQUEST_SECURITIES_CREDITING_PARAMS =
  API_REQUEST_URL + '/nontrade/securities/crediting/params';
export const API_REQUEST_SECURITIES_CREDITING =
  API_REQUEST_URL + '/nontrade/securities/crediting';
export const API_REQUEST_SECURITIES_CREDITING_FILES =
  API_REQUEST_URL + '/nontrade/securities/crediting/files';
export const API_REQUEST_SECURITIES_CREDITING_FILE =
  API_REQUEST_URL + '/nontrade/securities/crediting/file';
export const API_REQUEST_SECURITIES_CREDITING_VERIFY =
  API_REQUEST_URL + '/nontrade/securities/crediting/verify';
// ponytail: commit/upload — как у writeoff, если бэкенд отдаст 404 — убрать
export const API_REQUEST_SECURITIES_CREDITING_COMMIT =
  API_REQUEST_URL + '/nontrade/securities/crediting/commit';
```

Upload файл тот же: `API_REQUEST_SECURITIES_WRITEOFF_UPLOAD_FILE` → `/nontrade/securities/file`.

## 2. Types — `src/modules/Transfers/types/securitiesCrediting.ts`

Скопировать файл из этой папки.

## 3. RTK — `src/core/api/transfers.ts`

Скопировать эндпоинты из `api-transfers.snippet.ts` (getCreditingParams, mutation, status, files, verify, commit).
Экспорт хуков: `useGetSecuritiesCreditingParamsQuery`, `useSecuritiesCreditingMutation`, и т.д.

## 4. Routes — `src/const/routes.ts`

```ts
export const ROUTE_SECURITIES_CREDITING = '/transfers/securities/crediting';
export const ROUTE_SECURITIES_CREDITING_ORDER = '/transfers/securities/crediting/order';
```

Если меню ведёт на `/transfers/securities/requisites` — либо поменять ссылку на `crediting`, либо в роутере `requisites` → тот же компонент формы.

## 5. Constants title — `src/modules/Transfers/constants`

```ts
export const SECURITIES_CREDITING_PAGE_TITLE = 'Зачисление ценных бумаг';
```

## 6. Страницы

Создать папки и скопировать:

```
src/modules/Transfers/pages/SecuritiesCrediting/
  index.tsx
  SecuritiesCrediting.tsx
  SecuritiesCrediting.module.pcss   ← копия WriteOff.module.pcss
  SecurityIcon.tsx                 ← копия / re-export из WriteOff
  creditingCheckResult.ts
  creditingStatus.ts
  creditingErrors.ts
```

Order (быстрее всего):

1. Скопировать `SecuritiesWriteOffOrder` → `SecuritiesCreditingOrder`
2. Rename WriteOff → Crediting в файлах
3. Заменить API hooks/URL на crediting
4. Роут success/back на `ROUTE_SECURITIES_CREDITING*`

## 7. Router + permission

- Lazy route на `ROUTE_SECURITIES_CREDITING` и `.../order`
- Право: `PERSON_NONTRADE_SECURITY_REFILL_EXT` (см. `index.tsx`)

## 8. Меню Переводы

Пункт «Зачисление ценных бумаг» → `ROUTE_SECURITIES_CREDITING`.

## 9. Что уже сделано в пакете / что допилить руками

| Готово | Допилить в lk_m |
|--------|-----------------|
| Форма `SecuritiesCrediting.tsx` (поля по макету + POST/poll/files) | Вставить API hooks в `transfers.ts` |
| types / checkResult / status / errors | Роуты + router lazy |
| index с правом `PERSON_NONTRADE_SECURITY_REFILL_EXT` | Скопировать `*.module.pcss` и `SecurityIcon` из WriteOff |
| | Order/SMS: копия `SecuritiesWriteOffOrder` → Crediting |
| | Uploader файлов (как WriteOffSupportingDocuments) |
| | Комиссия: в API params нет поля — сейчас пусто |
| | Инструменты: из `writeoff/params` (временно) |

Порядок на форме: сначала **Место расчетов** (Depo из params), потом **Счёт** — так завязано на ответ `crediting/params`. На макете Depo в блоке «Откуда списать»; при желании подписи секций подвиньте, логику выбора не ломая.

## Проверка

1. Открыть форму, выбрать инструмент → уходит GET `crediting/params?depoInstrument_Id=`
2. Заполнить поля → POST `crediting` → poll GET → files → order → verify → SMS
3. CheckResult EMPTY/INVALID → ошибки на полях
