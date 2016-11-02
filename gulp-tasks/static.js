/*jslint node:true */
'use strict';

module.exports = function (gulp) {
    var merge = require('merge-stream');

    return function () {
        return merge(
            gulp.src('public/*/images/**/*').pipe(gulp.dest('../dist')),
            gulp.src('public/*/assets/**/*').pipe(gulp.dest('../dist')),
            gulp.src('public/*/js/lib/**/*').pipe(gulp.dest('../dist'))
        );
    };
};
