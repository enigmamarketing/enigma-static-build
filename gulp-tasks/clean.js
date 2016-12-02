'use strict';

module.exports = function () {
    var del = require('del');

    return function () {
        return del(['../dist/**/*'], { force: true });
    };
};
