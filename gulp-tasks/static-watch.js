/*jslint node:true */
'use strict';

module.exports = function (gulp, taskPrefix) {
    var watch = require('gulp-watch');

    return function () {
        return watch([
            'public/*/images/**/*',
            'public/*/assets/**/*',
            'public/*/js/lib/**/*'
        ], function () {
            gulp.start(taskPrefix + 'static');
        });
    };
};
