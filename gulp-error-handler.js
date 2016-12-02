'use strict';

var chalk = require('chalk');

module.exports = function (error) {
    if (chalk.hasColor(error.message)) {
        console.error(error.message);
    } else {
        console.error('\n' +
            chalk.green(error.plugin) + ':\n    ' +
            chalk.white.bgRed(error.name) + '\n    ' +
            error.message.trim().replace(/\n/g, '\n    ') +
        '\n');
    }

    if (error.cause) {
        console.dir(error.cause.message);
    }

    this.emit('end');
};
