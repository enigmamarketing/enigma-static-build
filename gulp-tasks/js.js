/*jslint node:true */
'use strict';

module.exports = function (gulp) {
    var fs = require('fs');
    var path = require('path');
    var plumber = require('gulp-plumber');
    var errorHandler = require('../gulp-error-handler');
    var sourcemaps = require('gulp-sourcemaps');
    var uglify = require('gulp-uglify');
    var jslint = require('gulp-jslint');
    var browser = require('gulp-browser');
    var merge = require('merge-stream');

    return function () {
        var stream = merge();

        stream.add(
            gulp.src(['public/*/js/**/*.js', '!public/*/js/lib/**'])
                .pipe(plumber({ errorHandler: errorHandler }))
                .pipe(jslint())
                .pipe(plumber.stop())
        );

        fs.readdirSync('./public').forEach(
            function (filename) {
                var stats = fs.lstatSync(path.join('./public', filename));

                if (stats.isDirectory()) {
                    stream.add(
                        gulp.src(['public/' + filename + '/js/*.js'])
                            .pipe(plumber({ errorHandler: errorHandler }))
                            .pipe(browser.browserify())
                            .pipe(sourcemaps.init())
                            .pipe(uglify())
                            .pipe(sourcemaps.write('./'))
                            .pipe(plumber.stop())
                            .pipe(gulp.dest('../dist/' + filename + '/js/'))
                    );
                }
            }
        );

        return stream;
    };
};
