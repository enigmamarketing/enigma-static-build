'use strict';

module.exports = function (gulp, taskPrefix) {
    var watch = require('gulp-watch');

    return function () {
        return watch([
            'public/*/css/**/*.scss',
            'public/*/css/**/*.css'
        ], function () {
            gulp.start(taskPrefix + 'css');
        });
    };
};
