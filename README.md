# Проект госэкспертизы ХК



# Коррекция ошибок БП

## Откат статуса заявления СМ

Параметры:
* Класс объекта petitionEstimated.class
* Идентификатор заявления в поле ouid
* Статус в поле заявления status
* Значения поля status для статуса "Документы поданы на рассмотрение" `"status" : "24"` - строка(!)
* Идентификатор объекта в поле guid ` "guid" : "26cad879-1b07-4b93-8ad8-791b07db932c"`
* Бизнес процесс petitionEstimated.wf
* значение этапа для статуса "Документы поданы на рассмотрение" `docSubmit`

Действия.
1. Открываем коллекцию `khv-gosekspertiza_petitionEstimated`
2. Ищем объект по ouid `db.getCollection('khv-gosekspertiza_petitionEstimated').find({"ouid": "266202"})`
3. Правим значение поля status на строку `"24"`
4. Запоминаем идентификатор из поля `guid`
5. Открываем коллекцию статусов бизнес процессов `ion_wf_state`
6. Правим в конце запрос guid и находим объект через запрос
 `db.getCollection('ion_wf_state').find({"item" : "petitionEstimated@khv-gosekspertiza@26cad879-1b07-4b93-8ad8-791b07db932c"})`
7. Удаляем объект. Альтернатива, ставим значением в поле  `"stage" : "docSubmit"`


## Откат статуса заявления ПМ
Параметры:
* Класс объекта `petitionExpert.class`
* Идентификатор заявления в поле ouid
* Статус в поле заявления status
* Значения поля status - строка(!) - для статусов
  * "Документы поданы на рассмотрение" `"status" : "24"` 
  * "Подписание договора" `"status" : "30"` 
* Идентификатор объекта в поле `guid`
* Бизнес процесс `petitionExpert.wf`
* значение этапа для статуса
  * "Документы поданы на рассмотрение" `docSubmit`
  * "Подписание договора" `prepDraft`

Действия.
1. Открываем коллекцию `khv-gosekspertiza_petitionExpert`
2. Ищем объект по ouid `db.getCollection('khv-gosekspertiza_petitionExpert').find({"ouid": "265019"})`
3. Правим значение поля status на строку `"24"`
4. Запоминаем идентификатор из поля guid, например `"0a1d812a-0b2d-4e7e-9d81-2a0b2d2e7eef"`
5. Открываем коллекцию статусов бизнес процессов `ion_wf_state`
6. Правим в конце запрос guid и находим объект через запрос
 `db.getCollection('ion_wf_state').find({"item" : "petitionExpert@khv-gosekspertiza@0a1d812a-0b2d-4e7e-9d81-2a0b2d2e7eef"})`
7. Удаляем объект. Альтернатива, став
