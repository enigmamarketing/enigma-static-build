/*jslint node:true */
'use strict';

module.exports = function (gulp) {
    var server = require('gulp-server-livereload');

    return function () {
        return gulp.src('./../dist/').pipe(server({
            livereload: true,
            directoryListing: {
                enable: true,
                path: './../dist/'
            },
            open: true
        }));
    };
};
