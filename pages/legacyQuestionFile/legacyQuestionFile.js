var ERR = require('async-stacktrace');
var _ = require('lodash');
var fs = require('fs');
var path = require('path');
var express = require('express');
var router = express.Router();

var error = require('../../lib/error');
var logger = require('../../lib/logger');
var filePaths = require('../../lib/file-paths');
var sqldb = require('../../lib/sqldb');
var sqlLoader = require('../../lib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/:filename', function(req, res, next) {
    var question = res.locals.question;
    var course = res.locals.course;
    var filename = req.params.filename;
    var params = {
        question_id: question.id,
        filename: filename,
        type: question.type,
    };
    sqldb.queryOneRow(sql.check_client_files, params, function(err, result) {
        if (ERR(err, next)) return;
        if (!result.rows[0].access_allowed) return next(error.make(403, 'Access denied', {locals: res.locals, filename: filename}));

        filePaths.questionFilePath(filename, question.directory, course.path, question, function(err, fullPath, effectiveFilename, rootPath) {
            if (ERR(err, next)) return;
            res.sendFile(effectiveFilename, {root: rootPath});
        });
    });
});

module.exports = router;
