var ERR = require('async-stacktrace');
var _ = require('lodash');
var path = require('path');
var csvStringify = require('csv').stringify;
var express = require('express');
var router = express.Router();

var error = require('../../lib/error');
var logger = require('../../lib/logger');
var csvMaker = require('../../lib/csv-maker');
var dataFiles = require('../../lib/data-files');
var assessments = require('../../assessments');
var sqldb = require('../../lib/sqldb');
var sqlLoader = require('../../lib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

var filenames = function(locals) {
    var prefix = locals.course.short_name.replace(/\s+/g, '')
        + '_'
        + locals.course_instance.short_name
        + '_'
        + locals.assessment_set.abbreviation
        + locals.assessment.number
        + '_';
    return {
        scoreStatsCsvFilename:        prefix + 'score_stats.csv',
        durationStatsCsvFilename:     prefix + 'duration_stats.csv',
        instancesCsvFilename:         prefix + 'instances.csv',
        scoresCsvFilename:            prefix + 'scores.csv',
        scoresByUsernameCsvFilename:  prefix + 'scores_by_username.csv',
        allInstanceScoresCsvFilename: prefix + 'all_instance_scores.csv',
        finalSubmissionsCsvFilename:  prefix + 'final_submissions.csv',
        allSubmissionsCsvFilename:    prefix + 'all_submissions.csv',
        finalFilesZipFilename:        prefix + 'final_files.zip',
        allFilesZipFilename:          prefix + 'all_files.zip',
    };
};

router.get('/', function(req, res, next) {
    _.assign(res.locals, filenames(res.locals));

    var params = {assessment_id: res.locals.assessment.id};
    sqldb.query(sql.questions, params, function(err, result) {
        if (ERR(err, next)) return;
        res.locals.questions = result.rows;

        var params = {assessment_id: res.locals.assessment.id};
        sqldb.query(sql.question_stats, params, function(err, result) {
            if (ERR(err, next)) return;
            res.locals.question_stats = result.rows;

            sqldb.queryOneRow(sql.assessment_stats, params, function(err, result) {
                if (ERR(err, next)) return;
                res.locals.assessment_stat = result.rows[0];
                // FIXME: change to assessment_instance_duration_stats and show all instances
                var params = {assessment_id: res.locals.assessment.id};
                sqldb.queryOneRow(sql.assessment_duration_stats, params, function(err, result) {
                    if (ERR(err, next)) return;
                    res.locals.duration_stat = result.rows[0];
    
                    var params = {assessment_id: res.locals.assessment.id};
                    sqldb.query(sql.assessment_instance_data, params, function(err, result) {
                        if (ERR(err, next)) return;
                        res.locals.user_scores = result.rows;
                    
                        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
                    });
                });
            });
        });
    });
});

router.get('/:filename', function(req, res, next) {
    _.assign(res.locals, filenames(res.locals));

    if (req.params.filename == res.locals.scoreStatsCsvFilename) {
        var params = {assessment_id: res.locals.assessment.id};
        sqldb.queryOneRow(sql.assessment_stats, params, function(err, result) {
            if (ERR(err, next)) return;
            var assessmentStat = result.rows[0];
            var csvHeaders = ['Course', 'Instance', 'Set', 'Number', 'Assessment', 'Title', 'TID', 'NStudents', 'Mean',
                              'Std', 'Min', 'Max', 'Median', 'NZero', 'NHundred', 'NZeroPerc', 'NHundredPerc'];
            var csvData = [
                res.locals.course.short_name,
                res.locals.course_instance.short_name,
                res.locals.assessment_set.name,
                res.locals.assessment.number,
                res.locals.assessment_set.abbreviation + res.locals.assessment.number,
                res.locals.assessment.title,
                res.locals.assessment.tid,
                assessmentStat.number,
                assessmentStat.mean,
                assessmentStat.std,
                assessmentStat.min,
                assessmentStat.max,
                assessmentStat.median,
                assessmentStat.n_zero,
                assessmentStat.n_hundred,
                assessmentStat.n_zero_perc,
                assessmentStat.n_hundred_perc,
            ];
            _(assessmentStat.score_hist).each(function(count, i) {
                csvHeaders.push("Hist " + (i + 1));
                csvData.push(count);
            });
            csvData = [csvHeaders, csvData];
            csvStringify(csvData, function(err, csv) {
                if (ERR(err, next)) return;
                res.attachment(req.params.filename);
                res.send(csv);
            });
        });
    } else if (req.params.filename == res.locals.durationStatsCsvFilename) {
        var params = {assessment_id: res.locals.assessment.id};
        sqldb.queryOneRow(sql.assessment_duration_stats, params, function(err, result) {
            if (ERR(err, next)) return;
            var durationStat = result.rows[0];
            var csvHeaders = ['Course', 'Instance', 'Set', 'Number', 'Assessment', 'Title', 'TID',
                              'Median duration (min)', 'Min duration (min)', 'Max duration (min)', 'Mean duration (min)'];
            var csvData = [
                res.locals.course.short_name,
                res.locals.course_instance.short_name,
                res.locals.assessment_set.name,
                res.locals.assessment.number,
                res.locals.assessment_set.abbreviation + res.locals.assessment.number,
                res.locals.assessment.title,
                res.locals.assessment.tid,
                durationStat.median_mins,
                durationStat.min_mins,
                durationStat.max_mins,
                durationStat.mean_mins,
            ];
            _(durationStat.threshold_seconds).each(function(count, i) {
                csvHeaders.push("Hist boundary " + (i + 1) + " (s)");
                csvData.push(count);
            });
            _(durationStat.hist).each(function(count, i) {
                csvHeaders.push("Hist" + (i + 1));
                csvData.push(count);
            });
            csvData = [csvHeaders, csvData];
            csvStringify(csvData, function(err, csv) {
                if (ERR(err, next)) return;
                res.attachment(req.params.filename);
                res.send(csv);
            });
        });
    } else if (req.params.filename == res.locals.instancesCsvFilename) {
        var params = {assessment_id: res.locals.assessment.id};
        sqldb.query(sql.assessment_instance_data, params, function(err, result) {
            if (ERR(err, next)) return;
            var columns = [
                ['UID', 'uid'],
                ['Name', 'name'],
                ['Role', 'role'],
                ['Assessment', 'assessment_label'],
                ['Instance', 'number'],
                ['Score (%)', 'score_perc'],
                ['Duration (min)', 'duration_mins'],
            ];
            csvMaker.rowsToCsv(result.rows, columns, function(err, csv) {
                if (ERR(err, next)) return;
                res.attachment(req.params.filename);
                res.send(csv);
            });
        });
    } else if (req.params.filename == res.locals.scoresCsvFilename) {
        var params = {assessment_id: res.locals.assessment.id};
        sqldb.query(sql.assessment_instance_scores, params, function(err, result) {
            if (ERR(err, next)) return;
            var assessmentName = res.locals.assessment_set.name + ' ' + res.locals.assessment.number;
            var columns = [
                ['UID', 'uid'],
                [assessmentName, 'score_perc'],
            ];
            csvMaker.rowsToCsv(result.rows, columns, function(err, csv) {
                if (ERR(err, next)) return;
                res.attachment(req.params.filename);
                res.send(csv);
            });
        });
    } else if (req.params.filename == res.locals.scoresByUsernameCsvFilename) {
        var params = {assessment_id: res.locals.assessment.id};
        sqldb.query(sql.assessment_instance_scores_by_username, params, function(err, result) {
            if (ERR(err, next)) return;
            var assessmentName = res.locals.assessment_set.name + ' ' + res.locals.assessment.number;
            var columns = [
                ['Username', 'username'],
                [assessmentName, 'score_perc'],
            ];
            csvMaker.rowsToCsv(result.rows, columns, function(err, csv) {
                if (ERR(err, next)) return;
                res.attachment(req.params.filename);
                res.send(csv);
            });
        });
    } else if (req.params.filename == res.locals.allInstanceScoresCsvFilename) {
        var params = {assessment_id: res.locals.assessment.id};
        sqldb.query(sql.assessment_instance_scores_all, params, function(err, result) {
            if (ERR(err, next)) return;
            var assessmentName = res.locals.assessment_set.name + ' ' + res.locals.assessment.number;
            var columns = [
                ['UID', 'uid'],
                ['Instance', 'number'],
                [assessmentName, 'score_perc'],
            ];
            csvMaker.rowsToCsv(result.rows, columns, function(err, csv) {
                if (ERR(err, next)) return;
                res.attachment(req.params.filename);
                res.send(csv);
            });
        });
    } else if (req.params.filename == res.locals.allSubmissionsCsvFilename
               || req.params.filename == res.locals.finalSubmissionsCsvFilename) {
        var include_all = (req.params.filename == res.locals.allSubmissionsCsvFilename);
        var params = {
            assessment_id: res.locals.assessment.id,
            include_all: include_all,
        };
        sqldb.query(sql.assessment_instance_submissions, params, function(err, result) {
            if (ERR(err, next)) return;
            var columns = [
                ['UID', 'uid'],
                ['Name', 'name'],
                ['Role', 'role'],
                ['Assessment', 'assessment_label'],
                ['Assessment instance', 'assessment_instance_number'],
                ['Question', 'qid'],
                ['Question instance', 'instance_question_number'],
                ['Variant', 'variant_number'],
                ['Seed', 'variant_seed'],
                ['Params', 'params'],
                ['True answer', 'true_answer'],
                ['Options', 'options'],
                ['Submission date', 'submission_date_formatted'],
                ['Submitted answer', 'submitted_answer'],
                ['Override score', 'override_score'],
                ['Credit', 'credit'],
                ['Mode', 'mode'],
                ['Grading requested date', 'grading_requested_at_formatted'],
                ['Grading date', 'graded_at_formatted'],
                ['Score', 'score'],
                ['Correct', 'correct'],
                ['Feedback', 'feedback'],
            ];
            csvMaker.rowsToCsv(result.rows, columns, function(err, csv) {
                if (ERR(err, next)) return;
                res.attachment(req.params.filename);
                res.send(csv);
            });
        });
    } else if (req.params.filename == res.locals.allFilesZipFilename
               || req.params.filename == res.locals.finalFilesZipFilename) {
        var include_all = (req.params.filename == res.locals.allFilesZipFilename);
        var params = {
            assessment_id: res.locals.assessment.id,
            include_all: include_all,
        };
        sqldb.query(sql.assessment_instance_files, params, function(err, result) {
            if (ERR(err, next)) return;
            var dirname = (res.locals.assessment_set.name + res.locals.assessment.number).replace(' ', '');
            dataFiles.filesToZipBuffer(result.rows, dirname, function(err, zipBuffer) {
                if (ERR(err, next)) return;
                res.attachment(req.params.filename);
                res.send(zipBuffer);
            });
        });
    } else {
        next(new Error("Unknown filename: " + req.params.filename));
    }
});

router.post('/', function(req, res, next) {
    if (!res.locals.authz_data.has_instructor_edit) return next();
    if (req.body.postAction == 'open') {
        var params = {
            assessment_id: res.locals.assessment.id,
            assessment_instance_id: req.body.assessment_instance_id,
            authn_user_id: res.locals.authz_data.authn_user.user_id,
        };
        sqldb.queryOneRow(sql.open, params, function(err, result) {
            if (ERR(err, next)) return;
            res.redirect(req.originalUrl);
        });
    } else if (req.body.postAction == 'close') {
        var params = {
            assessment_id: res.locals.assessment.id,
            assessment_instance_id: req.body.assessment_instance_id,
            authz_data: res.locals.authz_data,
        };
        sqldb.queryOneRow(sql.select_finish_data, params, function(err, result) {
            if (ERR(err, next)) return;
            var credit = result.rows[0].credit;
            var finish = true;
            assessments.gradeAssessmentInstance(req.body.assessment_instance_id, res.locals.authn_user.user_id, credit, finish, function(err) {
                if (ERR(err, next)) return;
                res.redirect(req.originalUrl);
            });
        });
    } else if (req.body.postAction == 'delete') {
        var params = [
            req.body.assessment_instance_id,
            res.locals.authn_user.user_id,
        ];
        sqldb.call('assessment_instances_delete', params, function(err, result) {
            if (ERR(err, next)) return;
            res.redirect(req.originalUrl);
        });
    } else if (req.body.postAction == 'delete_all') {
        var params = [
            req.body.assessment_id,
            res.locals.authn_user.user_id,
        ];
        sqldb.call('assessment_instances_delete_all', params, function(err, result) {
            if (ERR(err, next)) return;
            res.redirect(req.originalUrl);
        });
    } else {
        return next(error.make(400, 'unknown postAction', {locals: res.locals, body: req.body}));
    }
});

module.exports = router;
