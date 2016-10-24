/*jslint node:true */
'use strict';

module.exports = function (gulp) {
    var plumber = require('gulp-plumber');
    var errorHandler = require('../gulp-error-handler');
    var sourcemaps = require('gulp-sourcemaps');
    var uglify = require('gulp-uglify');
    var jslint = require('gulp-jslint');
    var browser = require('gulp-browser');
    var merge = require('merge-stream');

    return function () {
        var jslinted =
                gulp.src(['public/html/js/**/*.js', '!public/html/js/lib/**'])
                .pipe(plumber({ errorHandler: errorHandler }))
                .pipe(jslint())
                .pipe(plumber.stop()),

            browserified = gulp.src(['public/html/js/*.js', '!public/html/js/serviceWorker.js'])
                .pipe(plumber({ errorHandler: errorHandler }))
                .pipe(browser.browserify())
                .pipe(sourcemaps.init())
                .pipe(uglify())
                .pipe(sourcemaps.write('./'))
                .pipe(plumber.stop())
                .pipe(gulp.dest('../dist/html/js/')),

            serviceWorker = gulp.src('public/html/js/serviceWorker.js')
                .pipe(plumber({ errorHandler: errorHandler }))
                .pipe(browser.browserify())
                .pipe(sourcemaps.init())
                .pipe(uglify())
                .pipe(sourcemaps.write('./'))
                .pipe(plumber.stop())
                .pipe(gulp.dest('../dist/html/'));

        return merge(jslinted, browserified, serviceWorker);
    };
};
