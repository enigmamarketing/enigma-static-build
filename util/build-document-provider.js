'use strict';

var fs = require('fs');
var path = require('path');

var bcp47 = require('bcp-47');
var buildDocParse = require('build-doc-parse');
var deepAssign = require('deep-assign-writable');
var dust = require('dustjs-linkedin');
var chalk = require('chalk');


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


function getBuildData() {
    var buildData = {},
        docsDir = './public/documents',
        buildDocs = [];

    try {
        buildDocs = fs.readdirSync(docsDir);
    } catch (ex) {
        console.warn(chalk.yellow('No build documents found in ./public/documents!'));
        return null;
    }

    buildDocs.forEach(function (filename) {
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

function dataProvide(file, buildData, isDust) {
    var dataPath,
        base = {},
        override = {},
        pathComponents = path.relative('./public/', file.path).split(path.sep),
        folder = pathComponents[0],
        templateFileName = pathComponents[pathComponents.length - 1],
        template, templateSplitIndex,
        language;

    templateFileName = templateFileName.slice(0, -5);

    templateSplitIndex = templateFileName.indexOf('-');
    if (templateSplitIndex > 0) {
        template = templateFileName.substring(0, templateSplitIndex);
        language = templateFileName.substring(templateSplitIndex + 1);
    }

    if (pathComponents.length > 2) {
        template = pathComponents.slice(1, pathComponents.length - 1).join('-') + '-' + template;
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
        if (buildData &&
            buildData[folder] &&
            buildData[folder][template] &&
            buildData[folder][template][language]) {

            base = buildData[folder][template][language];
        } else if (buildData) {
            console.warn(chalk.yellow('No data found in build documents for \'%s\'.'), chalk.green(folder + '/' + template + '-' + language));
        }
    }

    deepAssign(base, override);

    cleanUpEmptyObjects(base);

    if (isDust) {
        return dust.context({}, { folder: folder }).push(base);
    } else {
        return base;
    }
}

function getDataProvider(buildData, isDust) {
    return function (file) {
        return dataProvide(file, buildData, isDust);
    };
}

module.exports = {
    getData: getBuildData,
    provide: getDataProvider
};
