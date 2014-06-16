var Stat = (function () {
	'use strict';

	/**
	 * @options
	 * @param speed [int] "Количество запросов в секунду"
	 * @param token [(boolean|string)] "Access Token"
	 * @param api [string] "VK API URL"
	 * @param version [string] "VK API Version"
	 * @param fresh [int] "Количество дней, в течение которого диалог считается свежим"
	 * @param timestamp [int] "Время старта приложения"
	 * @param usersFields [string] "Поля для пользователей"
	 * @param usersFields [string] "Поля для пользователя"
	 */
	var settings = {
		speed: 3,
		token: false,
		api: 'https://api.vk.com/method/',
		version: '5.21',
		fresh: 30,
		timestamp: +new Date(),
		usersFields: 'sex,photo_50,screen_name,city,country',
		selfFields: 'sex,bdate,city,country,photo_50,photo_200,lists,connections,universities,schools,relation,relatives,screen_name,timezone',
		callback: function(){},
		logs: function(){}
	};

	// Вспомогательные переменые
	var temp = {
		out: 0,
		timeout: 0,
		users: [],
		chats: [],
		// Удаленные чаты, VK API очень странно с ними работает, выделяем в отдельную сущность
		dchats: [],
		offsets: {
			dialogs: 0,
			users: 0,
			messages: {
				inbox: 0,
				outbox: 0
			},
			chats: 0
		},
		// Объект с предельным разовым лимитом запроса данных по типу
		counts: {
			dialogs: 200,
			users: 1000,
			chats: 200,
			messages: 200
		},
		// Массив идентификаторов удаленных сообщений
		deleted: [],
		maybeDeleted: []
	};

	// Статистика
	var stats = {
		// Общее
		vars: {
			firstMessage: false
		},
		// Количество
		count: {
			// Диалогов
			dialogs: {
				// Общее
				all: 0,
				// По типу
				type: {
					// Чаты
					chat: 0,
					// Собеседники
					personal: 0
				},
				// Последнее сообщение
				end: {
					// От автора
					myself: 0,
					// От собеседника
					companion: 0
				},
				// Свежие
				fresh: 0
			},
			// Пользователей
			users: {
				// Общее
				all: 0,
				// Пол
				gender: {
					// Мужчина
					male: 0,
					// Женщина
					female: 0,
					// Неизвестно
					nope: 0
				},
			},
			// Чатов
			chats: {
				// Общее
				all: 0,
				type: {
					admin: 0,
					user: 0
				}
			},
			// Сообщений
			messages: {
				// Общее
				all: 0,
				// По типу
				type: {
					inbox: 0,
					outbox: 0
				},
				// Байт
				bytes: {
					inbox: 0,
					outbox: 0,
					all: 0
				},
				// Удаленные
				deleted: 0,
				// Длина
				sizes: {
					inbox: 0,
					outbox: 0,
					all: 0
				},
				// Вложения
				attachments: {
					inbox: 0,
					outbox: 0,
					all: 0,
					type: {}
				}
			},
		},
		// Сохраненные данные
		data: {
			// Диалоги
			dialogs: [],
			// Пользователи
			users: [],
			// Чаты
			chats: [],
			// Удаленные чаты
			dchats: []
		}
	};

	/**
	 * @method private
	 * @name _query
	 * @description "Осуществление запроса к VK API, запросы осуществляются не чаще settings.speed раз в секунду, в случае успешного ответа, все атрибуты передаются в callback"
	 */
	var _query = function (method, data, callback) {
		// Рассчитываем задержку для запросов
		var delay = ((+new Date() - temp.timeout) > Math.floor(1000/settings.speed) ) ? 0 : (Math.floor(1000/settings.speed) - (+new Date() - temp.timeout));

		// Запрос к VK API
		setTimeout(function () {
			$.ajax({
				type: 'GET',
				dataType: 'jsonp',
				url: settings.api + method,
				data: $.extend({}, {access_token: settings.token, v: settings.version}, data),
				beforeSend: function () {
					temp.timeout = +new Date();
				}
			}).done(function (data, textStatus, jqXHR) {
				if (data.error) {
					// @todo Обработать ошибку (повторный запрос).
				    throw new Error(data.error.error_code + ', ' + data.error.error_msg);
				} else {
					callback.call(null, data.response);
				}
			}).fail(function (jqXHR, textStatus, errorThrown) {
				// @todo Обработать fail
			});
		}, delay);
	};

	/**
	 * @method private
	 * @name _out
	 * @desc "Метод для обработки окончания процедур (_getDialogs, _getUsers, ...), в нем же осуществляется инициализация следующей следующей"
	 */
	var _out = function (type) {
		switch (type) {
			// Обработка данных пользователя
			case 'user':
				// Переходим к процедуре сбора информации о диалогах
				_getDialogs();
				break;

			// Обработка диалогов
			case 'dialogs':
				for (var i = 0, dialogsCount = stats.data.dialogs.length; i < dialogsCount; i++) {
					var dialog = stats.data.dialogs[i];

					// Чат или собеседник
					if (dialog.chat_id) {
						stats.count.dialogs.type.chat += 1;

						// Чат добавляем в массив, по которому потом осуществляются запросы
						if (dialog.users_count) {
							temp.chats.push(dialog.chat_id);
						} else {
							temp.dchats.push(dialog.chat_id);
							stats.data.dchats.push(dialog);
						}
					} else {
						stats.count.dialogs.type.personal += 1;

						// Собеседника добавляем в массив, по которому потом осуществляются запросы
						if (dialog.id) {
							temp.users.push(dialog.user_id);
						}
					}

					// Является ли диалог свежим
					if ((settings.timestamp - dialog.date*1000) < (86400000 * settings.fresh)) {
						stats.count.dialogs.fresh += 1;
					}

					// Кто закончил диалог
					if (dialog.out === 1) {
						stats.count.dialogs.end.myself += 1;
					} else {
						stats.count.dialogs.end.companion += 1;
					}
				}

				// Сохраняем общее количество пользователей и чатов
				stats.count.users.all = temp.users.length;
				stats.count.chats.all = temp.chats.length;

				// Переходим к процедуре сбора информации о пользователях
				_getUsers();
				break;

			// Обработка пользователей
			case 'users':
				for (var j = 0, usersCount = stats.data.users.length; j < usersCount; j++) {
					var user = stats.data.users[j];

					// Пол пользователя
					switch (user.sex) {
						case 1:
							stats.count.users.gender.female += 1;
							break;

						case 2:
							stats.count.users.gender.male += 1;
							break;

						default:
							stats.count.users.gender.nope += 1;
							break;
					}
				}

				// Переходим к процедуре сбора информации о чатах
				_getChats();
				break;

			// Обработка чатов
			case 'chats':
				/** @todo По чатам никакой новой информации не приходит, может оно и не надо */
				for (var k = 0, chatsCount = stats.data.chats.length; k < chatsCount; k++) {
					var chat = stats.data.chats[k];

					// Организатор или участник
					if (chat.admin_id === stats.data.user.id) {
						stats.count.chats.type.admin += 1;
					} else {
						stats.count.chats.type.user += 1;
					}
				}

				// Переходим к процедуре сбора информации о сообщениях
				_getMessages();
				break;

			// Обработка сообщений
			case 'messages':
				for (var d = 0, dlen = temp.maybeDeleted.length; d < dlen; d++) {
					if (temp.maybeDeleted[d]) {
						temp.deleted.push(temp.maybeDeleted[d]);
					}
				}

				stats.count.messages.deleted = temp.deleted.length;

				// Выход из приложения
				_exit();
				break;

			// Стартовая задача
			default:
				_log('Начало сбора статистики');

				// Переходим к процедуре сбора информации о пользователе
				_getUser();
				break;
		}
	};

	/**
	 * @method private
	 * @name _log
	 * @desc "Логирование действий"
	 */
	var _log = function (message, progress) {
		var timestamp = +new Date() - settings.timeout;

		progress = progress ? Math.round(progress*100)/100 : false;
		settings.logs(timestamp, message, progress);
	};

	/**
	 * @method private
	 * @name _getUser
	 * @desc "Сбор информации по пользователю"
	 */
	var _exit = function () {
		_log('Сборка статистики закончена');

		// Отдаем статистику
		settings.callback(stats);
	};

	/**
	 * @method private
	 * @name _getUser
	 * @desc "Сбор информации по пользователю"
	 */
	var _getUser = function (data) {
		var code = '';

		if (data) {
			// Сохраняем полученные данные
			stats.vars.firstMessage = data.firstMessage;
			stats.data.user = data.userData;

			// Окончание процедуры
			_out('user');
		} else {
			_log('Получение общих данных пользователя');

			// Запрос данных по пользователю
			code += 'var firstMessage = API.messages.getById({"message_ids": 1}).items[0].date;';
			code += 'var userData = API.users.get({"fields": "' + settings.selfFields + '"})[0];';
			code += 'return {';
				code += '"firstMessage": firstMessage,';
				code += '"userData": userData';
			code += '};';

			// Запрос первой порции данных
			_query('execute', {
				code: code // settings.selfFields
			}, _getUser);
		}
	};

	/**
	 * @method private
	 * @name _getDialogs
	 * @desc "Сбор информации по диалогам"
	 */
	var _getDialogs = function (data) {
		if (data) {
			// Если еще нет общего количества диалогов - получаем его
			if (data.count && !stats.count.dialogs.all) {
				stats.count.dialogs.all = data.count;
			}

			// Обновляем смещение для выборки диалогов
			temp.offsets.dialogs += data.items.length;

			// Сохраняем порцию полученных данных
			for (var i = 0, count = data.items.length; i < count; i++) {
				stats.data.dialogs.push(data.items[i].message);
			}

			_log('Получение данных о диалогах', temp.offsets.dialogs/stats.count.dialogs.all);

			if (temp.offsets.dialogs < stats.count.dialogs.all) {
				// Запрос следующей порции данных
				_query('messages.getDialogs', {
					count: temp.counts.dialogs,
					offset: temp.offsets.dialogs
				}, _getDialogs);
			} else {
				// Окончание процедуры
				_out('dialogs');
			}
		} else {
			_log('Получение данных о диалогах', 0);

			// Запрос первой порции данных
			_query('messages.getDialogs', {
				count: temp.counts.dialogs,
				offset: temp.offsets.dialogs
			}, _getDialogs);
		}
	};

	/**
	 * @method private
	 * @name _getUsers
	 * @desc "Сбор информации по пользователям"
	 */
	var _getUsers = function (data) {
		if (data) {
			// Обновляем смещение для выборки пользователей
			temp.offsets.users += data.length;

			// Сохраняем порцию полученных данных
			stats.data.users.push.apply(stats.data.users, data);

			_log('Получение данных о собеседниках', temp.offsets.users/stats.count.users.all);

			if (temp.offsets.users < stats.count.users.all) {
				// Запрос следующей порции данных
				_query('users.get', {
					fields: settings.usersFields,
					user_ids: temp.users.slice(temp.offsets.users, temp.offsets.users + temp.counts.users).join(',')
				},
				_getUsers);
			} else {
				// Окончание процедуры
				_out('users');
			}
		} else {
			_log('Получение данных о собеседниках', 0);

			// Запрос первой порции данных
			_query('users.get', {
				fields: settings.usersFields,
				user_ids: temp.users.slice(temp.offsets.users, temp.offsets.users + temp.counts.users).join(',')
			},
			_getUsers);
		}
	};

	/**
	 * @method private
	 * @name _getChats
	 * @desc "Сбор информации по чатам"
	 */
	var _getChats = function (data) {
		if (data) {
			// Обновляем смещение для выборки чатов
			temp.offsets.chats += data.length;

			// Сохраняем порцию полученных данных
			stats.data.chats.push.apply(stats.data.chats, data);

			_log('Получение данных о чатах', temp.offsets.chats/stats.count.chats.all);

			if (temp.offsets.chats < stats.count.chats.all) {
				// Запрос следующей порции данных
				_query('messages.getChat', {
					chat_ids: temp.chats.slice(temp.offsets.chats, temp.offsets.chats + temp.counts.chats).join(',')
				},
				_getChats);
			} else {
				// Окончание процедуры
				_out('chats');
			}
		} else {
			_log('Получение данных о чатах', 0);

			// Запрос первой порции данных
			_query('messages.getChat', {
				chat_ids: temp.chats.slice(temp.offsets.chats, temp.offsets.chats + temp.counts.chats).join(',')
			},
			_getChats);
		}
	};

	/**
	 * @method private
	 * @name _getMessages
	 * @desc "Сбор информации по сообщениям"
	 */
	var _getMessages = function (data) {
		var code = '';

		if (data) {
			if (isNaN(data.length)) {
				stats.count.messages.type.inbox = data.inbox;
				stats.count.messages.type.outbox = data.outbox;
				stats.count.messages.all = data.inbox + data.outbox;

				for (var j = 0; j < 210412; j++) {
					temp.maybeDeleted.push(j);
				}
			} else {
				for (var i = 0, count = data.length; i < count; i++) {
					// Обновляем смещение для выборки сообщений
					if (temp.out) {
						temp.offsets.messages.outbox += data[i].length;
					} else {
						temp.offsets.messages.inbox += data[i].length;
					}
					// Анализируем сообщения
					 _read(data[i]);
				}
			}

			var offset = temp.out ? temp.offsets.messages.outbox : temp.offsets.messages.inbox,
				summary = temp.out ? stats.count.messages.type.outbox : stats.count.messages.type.inbox;

			if (!temp.out && offset === stats.count.messages.type.inbox) {
				temp.out = 1;
				offset = 0;
			}

			var ratio = (!temp.out) ? offset/stats.count.messages.all : ((stats.count.messages.type.inbox + offset) / stats.count.messages.all);

			_log('Загрузка сообщений', ratio);

			if (offset < summary) {
				// Запрос следующей порции данных
				code += 'var offset = ' + offset + ';';
				code += 'var count = ' + temp.counts.messages + ';';
				code += 'var i = 0;';
				code += 'var data = [];';
				code += 'while (i < 25) {';
					code += 'var part = API.messages.get({"out": ' + temp.out + ', "count": count, "offset": offset});';
					code += 'var income = part.items.length;';
					code += 'offset = offset + income;';
					code += 'if (income) {';
						code += 'data.push(part.items);';
						/** @todo Too many operations
						code += 'var l = 0;';
						code += 'while (l < income) {';
							code += 'l = l + 1;';
							code += 'data.push(part.items[l]);';
						code += '};'; */
						code += 'i = i + 1;';
					code += '} else {';
						code += 'i = 25;';
					code += '}';
				code += '};';
				code += 'return data;';

				_query('execute', {
					code: code
				},
				_getMessages);
			} else {
				// Окончание процедуры
				_out('messages');
			}
		} else {
			code += 'return {"inbox":API.messages.get({"out": 0, "count": 0}).count,"outbox": API.messages.get({"out": 1, "count": 0}).count};';

			// Первый запрос для получения числа сообщений
			_query('execute', {
				code: code
			},
			_getMessages);
		}
	};

	/**
	 * @method private
	 * @name _read
	 * @desc "Анализ сообщений"
	 */
	var _read = function (messages) {
		for (var i = 0, count = messages.length; i < count; i++) {
			var msg = messages[i],
				index = msg.chat_id ? temp.chats.indexOf(msg.chat_id) : temp.users.indexOf(msg.user_id),
				node = msg.chat_id ? stats.data.chats[index] : stats.data.users[index],
				type = (msg.out) ? 'outbox' : 'inbox',
				msgLength = msg.body.length,
				msgSize = _getStringSize(msg.body);

			// Если это не собеседник и не чат, то, видимо, это удаленный чат
			if (!node) {
				index = temp.dchats.indexOf(msg.chat_id);
				node = stats.data.dchats[index];
			}

			// Это сообщение не является удаленным
			temp.maybeDeleted[msg.id] = false;

			// Шаблон для статистики модели
			if (!node.stats) {
				node.stats = {
					// Общее
					all: 0,
					// По типу
					type: {
						inbox: 0,
						outbox: 0
					},
					// Байт
					bytes: {
						inbox: 0,
						outbox: 0,
						all: 0
					},
					// Удаленные
					deleted: 0,
					// Длина
					sizes: {
						inbox: 0,
						outbox: 0,
						all: 0
					},
					// Вложения
					attachments: {
						inbox: 0,
						outbox: 0,
						all: 0,
						type: {}
					}
				};
			}

			// Количество сообщений
			node.stats.all += 1;
			node.stats.type[type] += 1;

			// Размер сообщений
			stats.count.messages.bytes.all += msgSize;
			stats.count.messages.bytes[type] += msgSize;
			node.stats.bytes.all += msgSize;
			node.stats.bytes[type] += msgSize;

			// Длина сообщений
			stats.count.messages.sizes.all += msgLength;
			stats.count.messages.sizes[type] += msgLength;
			node.stats.sizes.all += msgLength;
			node.stats.sizes[type] += msgLength;

			// Вложения
			if (msg.attachments) {
				// Общее количество вложений
				stats.count.messages.attachments.all += msg.attachments.length;
				stats.count.messages.attachments[type] += msg.attachments.length;
				node.stats.attachments.all += msg.attachments.length;
				node.stats.attachments[type] += msg.attachments.length;

				for (var j = 0; j < msg.attachments.length; j++) {
					if ( !stats.count.messages.attachments.type.hasOwnProperty(msg.attachments[j].type) ) {
						stats.count.messages.attachments.type[msg.attachments[j].type] = {
							inbox: 0,
							outbox: 0,
							all: 0
						};
					}

					if ( !node.stats.attachments.type.hasOwnProperty(msg.attachments[j].type) ) {
						node.stats.attachments.type[msg.attachments[j].type] = {
							inbox: 0,
							outbox: 0,
							all: 0
						};
					}

					// Количество вложений по типу
					stats.count.messages.attachments.type[msg.attachments[j].type].all += 1;
					stats.count.messages.attachments.type[msg.attachments[j].type][type] += 1;
					node.stats.attachments.type[msg.attachments[j].type].all += 1;
					node.stats.attachments.type[msg.attachments[j].type][type] += 1;
				}
			}
		}
	};

	/**
	 * @method private
	 * @name _getStringSize
	 * @desc "Count bytes in a string's UTF-8 representation."
	 */
	var _getStringSize = function (val) {
	    val = String(val);

	    var bytes = 0;

	    for (var i = 0; i < val.length; i++) {
	        var c = val.charCodeAt(i);
	        bytes += c < (1 <<  7) ? 1 :
	                 c < (1 << 11) ? 2 :
	                 c < (1 << 16) ? 3 :
	                 c < (1 << 21) ? 4 :
	                 c < (1 << 26) ? 5 :
	                 c < (1 << 31) ? 6 : Number.NaN;
	    }

	    return bytes;
	};

	/**
	 * @method
	 * @name init
	 * @desc "Старт приложения"
	 */
	this.init = function (query, callback, logs) {
		// Из адресной строки получаем access token.
		settings.token = query.split('#access_token=')[1].split('&')[0];

		// Время старта приложения
		settings.timestamp = +new Date();

		// Задержка запросов xhr
		settings.timeout = settings.timestamp;

		// Функция выхода
		settings.callback = callback;

		// Функция логирования
		settings.logs = logs;

		_log('Старт приложения');

		// Обработка данных
		_out();
	};

	return this;

}).apply({});
