/*jslint node:true */
'use strict';

module.exports = function (gulp, taskPrefix) {
    var watch = require('gulp-watch');

    return function () {
        return watch('public/html/css/*.scss', function () {
            gulp.start(taskPrefix + 'css');
        });
    };
};
