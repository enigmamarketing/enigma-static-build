'use strict';

module.exports = function (gulp, taskPrefix) {
    var watch = require('gulp-watch');

    return function () {
        return watch([
            'public/*/**/*.dust',
            'public/*/**/*.json',
            'public/*/**/*.js',
            'public/*.xlsx',
            '!public/~$*.xlsx',
            '!public/*/js/**/*'
        ], function () {
            gulp.start(taskPrefix + 'html');
        });
    };
};
