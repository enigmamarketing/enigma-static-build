'use strict';

var fs = require('fs'),
    mkdirp = require('mkdirp'),
    path = require('path');

var buildDocProvider = require('../util/build-document-provider');

module.exports = function (gulp) {
    var gulpForeach = require('gulp-foreach');
    var gulpFile = require('gulp-file');

    return function () {
        var buildData = buildDocProvider.getData(),
            publicDir = path.join(process.cwd(), 'public');

        return gulp.src(['public/*/**/*.dust', '!public/*/**/partials/**'])
            .pipe(gulpForeach(function (stream, file) {
                let locals = buildDocProvider.provide(buildData, false)(file),
                    pathComponents = path.relative(publicDir, file.path).split(path.sep),
                    outputPath;

                pathComponents.splice(1, 0, 'assets');
                pathComponents.splice(2, 0, 'locals');

                outputPath = path.join(publicDir, pathComponents.join(path.sep).replace('.dust', '.json'));

                mkdirp.sync(path.dirname(outputPath));

                fs.writeFileSync(
                    outputPath,
                    JSON.stringify(locals, null, 2)
                );

                return stream;
            }));
    };
};
