/*jslint continue: true */
'use strict';

var fs = require('fs');
var path = require('path');

var buildDocProvider = require('../util/build-document-provider');
var deasync = require('deasync');
var deepAssign = require('deep-assign-writable');
var chalk = require('chalk');

var dust = require('dustjs-linkedin');
dust.helpers = require('dustjs-helpers').helpers;
dust.config.cache = false;

require('dust-naming-convention-filters')(dust);

function escapeChunk(str, start, end) {
    var original = str.substring(start, end),
        escaped = dust.escapeHtml(original);

    return {
        chunk: str.substring(0, start) + escaped + str.substring(end),
        delta: escaped.length - original.length
    };
}

function escapeAllNonDust(str) {
    var dustDepth = 0,
        currentIndex = 0,
        nextOpen, nextClose,
        escaped;

    while (true) {
        if (dustDepth === 0) {
            nextOpen = str.indexOf('{', currentIndex);

            if (nextOpen >= 0) {
                escaped = escapeChunk(str, currentIndex, nextOpen);

                str = escaped.chunk;

                currentIndex = nextOpen + 1 + escaped.delta;
                dustDepth += 1;
            } else {
                str = escapeChunk(str, currentIndex, str.length).chunk;

                break;
            }
        } else {
            nextOpen = str.indexOf('{', currentIndex);
            nextClose = str.indexOf('}', currentIndex);

            if (nextOpen === -1) { nextOpen = Infinity; }
            if (nextClose === -1) { nextClose = Infinity; }

            if (nextOpen === Infinity && nextClose === Infinity) {
                throw new Error('Unmatched bracket!');
            }

            if (nextOpen < nextClose) {
                dustDepth += 1;
                currentIndex = nextOpen + 1;
            } else {
                dustDepth -= 1;
                currentIndex = nextClose + 1;
            }
        }
    }

    return str;
}

function dustError(message, helperName, chunk, context, dataOverride) {
    var data = '',
        render = '',
        renderDepth = dust.helpers.render.depth;

    if (dataOverride) {
        data = dataOverride;
    } else if ((chunk.data || []).length > 0 && renderDepth > 0) {
        data = (chunk.data || []).join('\n\n    ');
    }

    if (data.length > 0) {
        data = '\n' + chalk.green('Data') + ':\n    ' + data;
    }

    if (renderDepth > 0) {
        render = ' within ' + chalk.green('@render');

        if (renderDepth > 1) {
            render += chalk.yellow(' x' + renderDepth);
        }
    }

    chunk.setError('\n' +
        chalk.green('@' + helperName) +
        render +
        ' in \'' + chalk.green(context.getTemplateName()) + '\'' +
        ': \n    ' + chalk.white.bgRed(message) +
        (renderDepth > 0 ? '\n    Error likely in the build document.' : '') +
        '\n' + chalk.green('Language') + ': ' + chalk.cyan(context.get('language')) +
        data +
    '\n');

    return chunk;
}

dust.helpers.render = function (chunk, context, bodies, params) {
    var template = context.resolve(params.key),
        templateType = typeof template,
        templatePrimitiveType = typeof template.valueOf(),
        filters = context.resolve(params.filter),
        keyLabel = typeof params.key === 'string' ? 'Key (' + params.key + ')' : 'Key';

    if (!params.hasOwnProperty('key')) {
        return dustError('No key given to render!', 'render', chunk, context);
    } else if (template === undefined) {
        return dustError(keyLabel + ' doesn\'t exist!', 'render', chunk, context);
    }

    if (templatePrimitiveType === 'object') {
        return dustError(keyLabel + ' exists, but there\'s no template!', 'render', chunk, context);
    }

    if (templateType !== templatePrimitiveType) {
        context = context.push(template);
    }

    if (filters) {
        if (!Array.isArray(filters)) {
            filters = [ filters + '' ]
                .map(filter => filter.split('|')).reduce((a, b) => a.concat(b))
                .map(filter => filter.split(',')).reduce((a, b) => a.concat(b));
        }

        filters = filters
            .map(filter => dust.filters[filter] || filter)
            .filter(filter => typeof filter === 'function');
    } else {
        filters = [];
    }

    return chunk.map(chunk => {
        dust.helpers.render.depth += 1;

        dust.renderSource(escapeAllNonDust(template), context, (error, output) => {
            dust.helpers.render.depth -= 1;

            if (error) {
                if (typeof error === 'string') {
                    chunk.setError(error);
                } else {
                    dustError(error.message, 'render', chunk, context, template);
                }
            } else {
                filters.forEach(filter => {
                    output = filter(output);
                });

                chunk.write(output);
                chunk.end();
            }
        });
    });
};
dust.helpers.render.depth = 0;

dust.helpers.block = function (chunk, context, bodies, params) {
    var data = context.resolve(params.path),
        template = context.resolve(params.template),
        paramData = {};

    if (typeof template !== 'string') {
        return dustError('No template given for block.', 'block', chunk, context);
    }

    if (!data) { return chunk; }
    if (Object.keys(data).length === 0) { return chunk; }

    for (let param in params) {
        if (!params.hasOwnProperty(param)) { continue; }
        if (param === 'path' || param === 'template') { continue; }

        paramData[param] = context.resolve(params[param]);
    }

    return chunk.partial(template, context.push(paramData).push(data));
};

function objectPropertiesToAttributes(object) {
    var attributes = [];

    for (let attribute in object) {
        if (!object.hasOwnProperty(attribute)) { continue; }
        if (!Object.getOwnPropertyDescriptor(object, attribute).writable) { continue; }

        let attributeValue = object[attribute],
            attributePrimitiveType = typeof attributeValue.valueOf();

        if (attributePrimitiveType === 'string' || attributePrimitiveType === 'number') {
            attributes.push(attribute + '="' + dust.escapeHtml(attributeValue) + '"');
        }
    }

    return attributes;
}

function wrappingHelper(tag, defaultName, defaultAttributes) {
    var attribute,
        attributes = objectPropertiesToAttributes(defaultAttributes);

    defaultName = defaultName || tag;

    return function (chunk, context, bodies, params) {
        var name = context.resolve(params.name) || defaultName,
            nameContext = name ? context.get(name) : null,
            tagAttributes = [];

        if (!tag) {
            tag = context.resolve(params.tag) || name;
        }
        if (!name) {
            return dustError('No name given to tag that requires it.', 'tag', chunk, context);
        }

        if (nameContext) { context = context.push(nameContext); }

        tagAttributes = objectPropertiesToAttributes(context.stack.head || {});

        chunk.write('<' + tag + ' ' + attributes.join(' ') + ' ' + tagAttributes.join(' ') + '>');

        if (bodies.block) {
            chunk.render(bodies.block, context);
        } else if (tag === 'a' && defaultName === 'link' && (context.get('content') || params.key)) {
            // TODO: This is a warning added on 2017-01-09. Remove after 2017-07-09.
            return dustError(
                'The `link.content` syntax is deprecated! Please use this form: {@link}content{/link}.',
                'link', chunk, context);
        }

        chunk.write('</' + tag + '>');

        return chunk;
    };
}

dust.helpers.b = wrappingHelper('strong', 'b');
dust.helpers.u = wrappingHelper('u');
dust.helpers.i = wrappingHelper('em', 'i');
dust.helpers.sub = wrappingHelper('sub');
dust.helpers.sup = wrappingHelper('sup');
dust.helpers.span = wrappingHelper('span');
dust.helpers.link = wrappingHelper('a', 'link');
dust.helpers.tag = wrappingHelper();
dust.helpers.br = function (chunk) { return chunk.write('<br/>'); };

function wrapDustOnLoad() {
    var onLoad = dust.onLoad;

    return function (name, options, callback) {
        var partialPath = path.join(process.cwd(), 'public', options.folder, 'partials', name + '.dust');

        fs.readFile(partialPath, 'utf8', (error, template) => {
            if (error) {
                // Fallback to default!

                if (onLoad) {
                    if (onLoad.length === 3) {
                        return onLoad(name, options, callback);
                    } else {
                        return onLoad(name, callback);
                    }
                } else {
                    console.error('Template ' + error.path + ' does not exist');
                    return callback(error);
                }
            }

            try {
                callback(null, template);
            } catch (error) {
                callback(error);
            }
        });
    };
}

module.exports = function (gulp) {
    var plumber = require('gulp-plumber');
    var errorHandler = require('../gulp-error-handler');
    var dustHtml = require('gulp-dust-html');

    return function () {
        var buildData = buildDocProvider.getData(),
            dustOptions = {
                basePath: 'public',
                data: buildDocProvider.provide(buildData, true),
                whitespace: true
            },
            dustHtmlInstance = dustHtml(dustOptions);

        dust.onLoad = wrapDustOnLoad();

        return gulp.src(['public/*/**/*.dust', '!public/*/**/partials/**'])
            .pipe(plumber({ errorHandler: errorHandler }))
            .pipe(dustHtmlInstance)
            .pipe(plumber.stop())
            .pipe(gulp.dest('../dist/'));
    };
};
