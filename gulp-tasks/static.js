/*jslint node:true */
'use strict';

module.exports = function (gulp) {
    var merge = require('merge-stream');

    return function () {
        return merge(
            gulp.src('public/email/images/**/*').pipe(gulp.dest('../dist/email/images/')),
            gulp.src('public/html/images/**/*').pipe(gulp.dest('../dist/html/images/')),
            gulp.src('public/html/assets/**/*').pipe(gulp.dest('../dist/html/assets/')),
            gulp.src('public/html/js/lib/**/*').pipe(gulp.dest('../dist/html/js/lib/'))
        );
    };
};
