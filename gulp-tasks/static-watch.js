/*jslint node:true */
'use strict';

module.exports = function (gulp, taskPrefix) {
    var watch = require('gulp-watch');

    return function () {
        return watch(['public/email/images/**/*',
                      'public/html/images/**/*',
                      'public/html/assets/**/*',
                      'public/html/js/lib/**/*'], function () {
            gulp.start(taskPrefix + 'static');
        });
    };
};
