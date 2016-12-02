'use strict';

var chalk = require('chalk');

module.exports = function (gulp, projectRoot, createPrefixlessTasks) {
    var path = require('path'),
        tasksPath = path.join(__dirname, 'gulp-tasks'),
        taskPrefix = 'enigma.',
        deploymentTasks = loadDeployment(gulp, projectRoot, taskPrefix);

    // Load all gulp tasks, using the name of each file in the tasksPath as the name of the task.
    require('fs').readdirSync(tasksPath).forEach(
        function (filename) {
            gulp.task(
                taskPrefix + path.basename(filename, '.js'),
                require(path.join(tasksPath, filename))(gulp, taskPrefix, projectRoot)
            );
        }
    );

    gulp.task(taskPrefix + 'build', [
        taskPrefix + 'html',
        taskPrefix + 'css',
        taskPrefix + 'js',
        taskPrefix + 'static'
    ]);

    gulp.task(taskPrefix + 'default', [ taskPrefix + 'build' ]);

    gulp.task(taskPrefix + 'develop', [
        taskPrefix + 'build',
        taskPrefix + 'server',
        taskPrefix + 'html-watch',
        taskPrefix + 'css-watch',
        taskPrefix + 'js-watch',
        taskPrefix + 'static-watch'
    ]);

    if (createPrefixlessTasks) {
        gulp.task('build', [ taskPrefix + 'build' ]);
        gulp.task('default', [ taskPrefix + 'default' ]);
        gulp.task('develop', [ taskPrefix + 'develop' ]);
        gulp.task('clean', [ taskPrefix + 'clean' ]);
    }

    if (!deploymentTasks) {
        gulp.task(taskPrefix + 'deploy', showNoDeploymentMessage);
        gulp.task(taskPrefix + 'proof', showNoDeploymentMessage);
        gulp.task(taskPrefix + 'configure', showNoDeploymentMessage);

        if (createPrefixlessTasks) {
            gulp.task('deploy', [ taskPrefix + 'deploy' ]);
            gulp.task('proof', [ taskPrefix + 'proof' ]);
            gulp.task('configure', [ taskPrefix + 'configure' ]);
        }
    } else if (createPrefixlessTasks) {
        deploymentTasks.forEach(task => {
            gulp.task(task, [ taskPrefix + task ]);
        });
    }
};

function loadDeployment(gulp, projectRoot, taskPrefix) {
    try {
        return require('enigma-static-build-deployment')(gulp, projectRoot, taskPrefix);
    } catch (ex) {
        return false;
    }
}

function showNoDeploymentMessage() {
    console.log(
        '\n' +
        chalk.white.bgRed('Deployments unavailable!') + '\n' +
        'Do you have access to the module?' +
        '\n'
    );
}
