/*jslint node:true */
'use strict';

module.exports = function (gulp, taskPrefix) {
    var watch = require('gulp-watch');

    return function () {
        return watch(['public/html/js/**/*.js', '!public/html/js/lib/**'], function () {
            gulp.start(taskPrefix + 'js');
        });
    };
};
