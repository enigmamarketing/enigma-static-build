/*jslint node:true */
'use strict';

module.exports = function (gulp, taskPrefix) {
    var watch = require('gulp-watch');

    return function () {
        return watch([
            'public/email/**/*.dust',
            'public/email/**/*.json',
            'public/html/**/*.dust',
            'public/html/**/*.json',
            'public/html/**/*.js',
            'public/*.xlsx',
            '!public/~$*.xlsx'
        ], function () {
            gulp.start(taskPrefix + 'html');
        });
    };
};
