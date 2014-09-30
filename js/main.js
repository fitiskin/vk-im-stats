var content = $('#after'),
    result = false;

function logger (timestamp, message, progress) {
    var timing = 'Скрипт работает: ' + Math.round(timestamp/1000) + ' сек.<br /><br />';

    if (progress) {
        content.html(timing + '<b>' + message + '</b>:' + progressbar(progress, 50, 'ok'));
    } else {
        content.html(timing + '<b>' + message + '</b>.');
    }
}

function progressbar (progress, size, wrap) {
    size = size || 50;
    wrap = wrap || false;

    var items = [],
        item = (wrap) ? '<span class="' + wrap + '">#</span>' : '#';

    for (var i = 0; i < size; i++) {

        items[i] = (progress >= i / size) ? item : '&nbsp;';
    }

    return '[' + items.join('') + '] ' + Math.round(progress * 100) + '%';
}

function success (statistic) {
    setTimeout(function () {
        logs.remove();
    }, 1000);

    build(statistic);
}

function build (s) {
    var source   = $("#results").html();
    var template = Handlebars.compile(source);

    result = s;
    console.log(s);

    content.html(template(s));
}

Handlebars.registerHelper('mb', function(bytes) {
    return (bytes / 1024 / 1024).toFixed(2);
});

Handlebars.registerHelper('tolstoy', function(len) {
    return (len / 2709700).toFixed(2) + ' "Война и Мир"';
});

Handlebars.registerHelper('relation', function(type) {
    var relation = (type.inbox && type.outbox) ? (type.inbox / type.outbox).toFixed(2) : '-';

    return new Handlebars.SafeString( (relation > 1) ? '<span class="ok">'+relation+'</span>' : '<span class="red">'+relation+'</span>' );
});

Handlebars.registerHelper('avatar', function(id) {
    var user = result.data.users.filter(function (i, j) {
        if (i.id === id) {
            return this;
        }
    })[0];

    if (user && user.photo_50) {
        return new Handlebars.SafeString('<img src="'+user.photo_50+'" />');
    } else {
        return '';
    }
});

$(function () {
    $('#before').removeClass('hide');
    $('#start').on('click', function () {
        Stat.init(token.value, success, logger);
        $('#before').remove();
    });
});
