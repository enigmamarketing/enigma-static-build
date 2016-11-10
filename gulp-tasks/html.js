/*jslint node: true, continue: true */
'use strict';

var path = require('path');
var buildDocParse = require('build-doc-parse');
var deasync = require('deasync');
var deepAssign = require('deep-assign');
var chalk = require('chalk');

var dust = require('dustjs-linkedin');
dust.helpers = require('dustjs-helpers').helpers;
dust.config.cache = false;

function escapeAllNonDust(str) {
    var dustDepth = 0,
        currentIndex = 0,
        nextOpen, nextClose;

    while (true) {
        if (dustDepth === 0) {
            nextOpen = str.indexOf('{', currentIndex);

            if (nextOpen >= 0) {
                str =
                    str.substring(0, currentIndex) +
                    dust.escapeHtml(str.substring(currentIndex, nextOpen)) +
                    str.substring(nextOpen);

                currentIndex = nextOpen + 1;
                dustDepth += 1;
            } else {
                str =
                    str.substring(0, currentIndex) +
                    dust.escapeHtml(str.substring(currentIndex));

                break;
            }
        } else {
            nextOpen = str.indexOf('{', currentIndex);
            nextClose = str.indexOf('}', currentIndex);

            if (nextOpen === -1) { nextOpen = Infinity; }
            if (nextClose === -1) { nextClose = Infinity; }

            if (nextOpen === Infinity && nextClose === Infinity) {
                break;
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

dust.helpers.link = function (chunk, context, bodies, params) {
    var link = params.key,
        attribute, attributes = [];

    if (!params.hasOwnProperty('key')) {
        dustError('No key given to link!', 'link', chunk, context);
        return chunk;
    } else if (link === undefined) {
        dustError('Link key doesn\'t exist!', 'link', chunk, context);
        return chunk;
    }

    if (!link.content) {
        dustError('No content given for link.', 'link', chunk, context);
        return chunk;
    }

    for (attribute in link) {
        if (!link.hasOwnProperty(attribute)) { continue; }
        if (attribute === 'content') { continue; }

        attributes.push(attribute + '="' + dust.escapeHtml(link[attribute]) + '"');
    }

    chunk.write('<a ' + attributes.join(' ') + '>' + dust.escapeHtml(link.content) + '</a>');

    return chunk;
};

dust.helpers.render = function (chunk, context, bodies, params) {
    var template = params.key,
        renderSource = deasync(dust.renderSource);

    if (!params.hasOwnProperty('key')) {
        dustError('No key given to render!', 'render', chunk, context);
        return chunk;
    } else if (template === undefined) {
        dustError('Key doesn\'t exist!', 'render', chunk, context);
        return chunk;
    }

    try {
        dust.helpers.render.depth += 1;
        chunk.write(renderSource(escapeAllNonDust(template), context));
    } catch (error) {
        if (typeof(error) == 'string') {
            chunk.setError(error);
        } else {
            dustError(error.message, 'render', chunk, context, template);
        }
    } finally {
        dust.helpers.render.depth -= 1;
    }

    return chunk;
};
dust.helpers.render.depth = 0;

function wrappingHelper(tag, attributes) {
    var attribute,
        attributeString = [];

    for (attribute in attributes) {
        if (!attributes.hasOwnProperty(attribute)) { continue; }

        attributeString.push(attribute + '="' + dust.escapeHtml(attributes[attribute]) + '"');
    }

    attributeString = attributeString.join(' ');

    return function (chunk, context, bodies, params) {
        chunk.write('<' + tag + '>');
        chunk.render(bodies.block, context);
        chunk.write('</' + tag + '>');

        return chunk;
    };
}

dust.helpers.b = wrappingHelper('strong');
dust.helpers.u = wrappingHelper('u');
dust.helpers.i = wrappingHelper('em');
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

    if (folder && template && language) {
        if (buildData[folder] &&
            buildData[folder][template] &&
            buildData[folder][template][language]) {

            base = buildData[folder][template][language];
        } else {
            console.warn(chalk.yellow('No data found in build document for %s.%s, language: %s'), folder, template, language);
        }
    }

    return deepAssign(base, override);
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
            throw chalk.white.bgRed('Error parsing ' + filename) + ': ' + error;
        }
    });

    return buildData;
}

module.exports = function (gulp) {
    var plumber = require('gulp-plumber');
    var errorHandler = require('../gulp-error-handler');
    var dustHtml = require('gulp-dust-html');
    var merge = require('merge-stream');

    return function () {
        var buildData = getBuildData(),
            dustOptions = {
                basePath: 'public',
                data: getDataProvider(buildData),
                whitespace: true
            };

        return merge(
            gulp.src(['public/*/**/*.dust', '!public/*/**/partials/**'])
                .pipe(plumber({ errorHandler: errorHandler }))
                .pipe(dustHtml(dustOptions))
                .pipe(plumber.stop())
                .pipe(gulp.dest('../dist/'))
        );
    };
};
