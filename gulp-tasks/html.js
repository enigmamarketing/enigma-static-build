/*jslint continue: true */
'use strict';

var path = require('path');
var buildDocParse = require('build-doc-parse');
var deasync = require('deasync');
var deepAssign = require('deep-assign-writable');
var chalk = require('chalk');
var bcp47 = require('bcp-47');

var dust = require('dustjs-linkedin');
dust.helpers = require('dustjs-helpers').helpers;
dust.config.cache = false;

require('dust-naming-convention-filters')(dust);

function hasReadOnlyProperties(object) {
    return Object.keys(object).some(key => !Object.getOwnPropertyDescriptor(object, key).writable);
}

function cleanUpEmptyObjects(object) {
    var keys = Object.keys(object),
        removedKeyCount = 0;

    if (typeof(object) !== 'object') { return false; }

    keys.forEach(key => {
        let child = object[key];

        if (hasReadOnlyProperties(child)) { return; }

        if (cleanUpEmptyObjects(child)) {
            delete object[key];
            removedKeyCount += 1;
        }
    });

    return removedKeyCount === keys.length;
}

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
}

dust.helpers.render = function (chunk, context, bodies, params) {
    var template = context.resolve(params.key),
        filters = context.resolve(params.filter);

    if (!params.hasOwnProperty('key')) {
        dustError('No key given to render!', 'render', chunk, context);
        return chunk;
    } else if (template === undefined) {
        dustError('Key doesn\'t exist!', 'render', chunk, context);
        return chunk;
    }

    if (typeof(template) !== typeof(template.valueOf())) {
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
            .filter(filter => typeof(filter) === 'function');
    } else {
        filters = [];
    }

    return chunk.map(chunk => {
        dust.helpers.render.depth += 1;

        dust.renderSource(escapeAllNonDust(template), context, (error, output) => {
            dust.helpers.render.depth -= 1;

            if (error) {
                if (typeof(error) === 'string') {
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

dust.helpers.link = function (chunk, context, bodies, params) {
    var link = context.resolve(params.key),
        name = context.resolve(params.name) || 'link',
        attribute, attributes = [],
        nameContext = context.get(name);

    if (params.hasOwnProperty('key') && link === undefined) {
        dustError('Link key doesn\'t exist!', 'link', chunk, context);
        return chunk;
    }

    if (typeof(link) === 'object') {
        context = context.push(link);
    } else {
        if (nameContext) {
            context = context.push(nameContext);
        } else {
            if (name !== 'link') {
                dustError('No data found for link with name \'' + name + '\'!', 'link', chunk, context);
            } else {
                dustError('No data found for link!', 'link', chunk, context);
            }

            return chunk;
        }
    }

    if (!context.get('content', true)) {
        dustError('No content given for link.', 'link', chunk, context);
        return chunk;
    }

    link = context.stack.head || {};

    for (attribute in link) {
        if (!link.hasOwnProperty(attribute)) { continue; }
        if (!Object.getOwnPropertyDescriptor(link, attribute).writable) { continue; }
        if (attribute === 'content') { continue; }

        attributes.push(attribute + '="' + dust.escapeHtml(link[attribute]) + '"');
    }

    chunk.write('<a ' + attributes.join(' ') + '>' + dust.escapeHtml(context.get('content', true)) + '</a>');

    return chunk;
};

dust.helpers.block = function (chunk, context, bodies, params) {
    var data = context.resolve(params.path),
        template = context.resolve(params.template),
        paramData = {};

    if (typeof(template) !== 'string') {
        dustError('No template given for block.', 'block', chunk, context);
        return chunk;
    }

    if (!data) { return chunk; }
    if (Object.keys(data).length === 0) { return chunk; }

    for (let param in params) {
        if (!params.hasOwnProperty(param)) { continue; }
        if (param === 'path' || param === 'template') { continue; }

        paramData[param] = context.resolve(params[param]);
    }

    Object.assign(paramData, data);

    return chunk.partial(template, context.push(paramData));
};

function wrappingHelper(tag, defaultName, defaultAttributes) {
    var attribute,
        attributes = [],
        defaultName = defaultName || tag;

    for (attribute in defaultAttributes) {
        if (!defaultAttributes.hasOwnProperty(attribute)) { continue; }
        if (!Object.getOwnPropertyDescriptor(defaultAttributes, attribute).writable) { continue; }

        let attributeValue = defaultAttributes[attribute];

        if (typeof(attributeValue.valueOf()) === 'string') {
            attributes.push(attribute + '="' + dust.escapeHtml(attributeValue) + '"');
        }
    }

    return function (chunk, context, bodies, params) {
        var name = context.resolve(params.name) || defaultName,
            nameContext = name ? context.get(name) : null,
            tagAttributes = [],
            tagAttributeData, attribute;

        if (!tag) {
            tag = context.resolve(params.tag) || name;
        }
        if (!name) {
            dustError('No name given to tag that requires it.', 'tag', chunk, context);

            return chunk;
        }

        if (nameContext) { context = context.push(nameContext); }

        tagAttributeData = context.stack.head || {};

        for (attribute in tagAttributeData) {
            if (!tagAttributeData.hasOwnProperty(attribute)) { continue; }
            if (!Object.getOwnPropertyDescriptor(tagAttributeData, attribute).writable) { continue; }

            let attributeValue = tagAttributeData[attribute];

            if (typeof(attributeValue.valueOf()) === 'string') {
                tagAttributes.push(attribute + '="' + dust.escapeHtml(attributeValue) + '"');
            }
        }

        chunk.write('<' + tag + ' ' + attributes.join(' ') + ' ' + tagAttributes.join(' ') + '>');

        if (bodies.block) {
            chunk.render(bodies.block, context);
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
dust.helpers.tag = wrappingHelper();
dust.helpers.br = function (chunk) { return chunk.write('<br/>'); };

function dustDataProvide(file, buildData) {
    var dataPath,
        base = {},
        override = {},
        pathComponents = path.relative('./public/', file.path).split(path.sep),
        folder = pathComponents[0],
        template, templateSplitIndex,
        language;

    pathComponents[1] = pathComponents[1].slice(0, -5);

    templateSplitIndex = pathComponents[1].indexOf('-');
    if (templateSplitIndex > 0) {
        template = pathComponents[1].substring(0, templateSplitIndex);
        language = pathComponents[1].substring(templateSplitIndex + 1);
    }

    try {
        dataPath = file.path.slice(0, -5);

        if (require.cache[require.resolve(dataPath)]) {
            delete require.cache[require.resolve(dataPath)];
        }

        override = require(dataPath);
    } catch (ex) { }

    override.language = language;

    console.info('Building template \'%s\'...', chalk.green(folder + '/' + template + '-' + language));

    if (language) {
        bcp47.parse(language, {
            forgiving: false,
            warning: (message, code, offset) => {
                let error = new Error();

                error.showStack = false;
                error.name = 'LanguageTagError';

                error.message =
                    message + ' at index ' + offset + '\n' +
                    language + '\n' +
                    (offset !== 0 ? '-'.repeat(offset - 1) : '') + '^';

                throw error;
            }
        });
    }

    if (folder && template && language) {
        if (buildData[folder] &&
            buildData[folder][template] &&
            buildData[folder][template][language]) {

            base = buildData[folder][template][language];
        } else {
            console.warn(chalk.yellow('No data found in build documents for \'%s\'.'), chalk.green(folder + '/' + template + '-' + language));
        }
    }

    deepAssign(base, override);

    cleanUpEmptyObjects(base);

    return base;
}

function getDataProvider(buildData) {
    return function (file) {
        return dustDataProvide(file, buildData);
    };
}

function getBuildData() {
    var buildData = {},
        docsDir = './public';

    require('fs').readdirSync(docsDir).forEach(function (filename) {
        if (path.extname(filename) !== '.xlsx') { return; }
        if (filename.startsWith('~$')) { return; }

        try {
            deepAssign(buildData, buildDocParse(path.join(docsDir, filename)));
        } catch (error) {
            throw new Error(chalk.white.bgRed('Found in \'' + filename + '\'') + ': ' + error.message);
        }
    });

    return buildData;
}

module.exports = function (gulp) {
    var plumber = require('gulp-plumber');
    var errorHandler = require('../gulp-error-handler');
    var dustHtml = require('gulp-dust-html');

    return function () {
        var buildData = getBuildData(),
            dustOptions = {
                basePath: 'public',
                data: getDataProvider(buildData),
                whitespace: true
            };

        return gulp.src(['public/*/**/*.dust', '!public/*/**/partials/**'])
            .pipe(plumber({ errorHandler: errorHandler }))
            .pipe(dustHtml(dustOptions))
            .pipe(plumber.stop())
            .pipe(gulp.dest('../dist/'));
    };
};
