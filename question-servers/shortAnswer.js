var ERR = require('async-stacktrace');
var _ = require('lodash');
var fs = require('fs');
var path = require('path');

var error = require('../lib/error');
var logger = require('../lib/logger');
var filePaths = require('../lib/file-paths');
var questionHelper = require('../lib/questionHelper.js');

module.exports = {
    renderExtraHeaders: function(question, course, locals, callback) {
        callback(null, null);
    },

    renderQuestion: function(variant, question, submission, course, locals, callback) {
        var context = {
            params: variant.params,
            feedback: {},
        };
        questionHelper.renderRivetsTemplate("question.html", context, question, course, locals, callback);
    },

    renderSubmission: function(variant, question, submission, course, locals, callback) {
        var context = {
            params: variant.params,
            submittedAnswer: submission.submitted_answer,
            score: submission.score,
            feedback: submission.feedback,
        };
        questionHelper.renderRivetsTemplate("submission.html", context, question, course, locals, callback);
    },

    renderTrueAnswer: function(variant, question, course, locals, callback) {
        var context = {
            params: variant.params,
            trueAnswer: variant.true_answer,
        };
        questionHelper.renderRivetsTemplate("answer.html", context, question, course, locals, callback);
    },

    getData: function(question, course, vid, callback) {
        questionHelper.loadServer(question, course, function(err, server) {
            if (ERR(err, callback)) return;
            try {
                var questionData = server.getData(vid, question.options, 'INVALID QUESTION DIRECTORY');
            } catch (e) {
                return callback(new Error('Error in question getData(): ' + String(e)));
            }
            var data = {
                params: questionData.params,
                true_answer: questionData.trueAnswer,
                options: questionData.options,
            };
            callback(null, data);
        });
    },

    defaultGradeAnswer: function(vid, params, trueAnswer, submittedAnswer, options) {
        options = _.defaults(options, {
            type: "equal",
            relTol: 1e-2,
            absTol: 1e-8,
        });
        var trueAns = trueAnswer;
        var subAns = submittedAnswer;
        if (this.transformTrueAnswer)
            trueAns = this.transformTrueAnswer(vid, params, trueAns, subAns, options);
        if (this.transformSubmittedAnswer)
            subAns = this.transformSubmittedAnswer(vid, params, trueAns, subAns, options);
        var score;
        if (options.type === "equal") {
            score = 0;
            if (PrairieGeom.checkEqual(trueAns, subAns, options.relTol, options.absTol))
                score = 1;
        } else if (options.type === "error") {
            var error;
            if (this.submittedAnswerError) {
                error = this.submittedAnswerError(vid, params, trueAns, subAns, options);
            } else {
                error = PrairieGeom.absError(trueAns, subAns);
            }
            var score = PrairieGeom.errorToScore(error, options.absTol);
        } else {
            throw Exception("Unknown gradeAnswer type: " + options.type);
        }
        return {score: score};
    },

    gradeSubmission: function(submission, variant, question, course, callback) {
        var that = this;
        questionHelper.loadServer(question, course, function(err, server) {
            if (ERR(err, callback)) return;
            var grading;
            try {
                var vid = variant.vid;
                var params = variant.params;
                var trueAnswer = variant.true_answer;
                var submittedAnswer = submission.submitted_answer;
                var options = variant.options;
                if (server.gradeAnswer) {
                    grading = server.gradeAnswer(vid, params, trueAnswer, submittedAnswer, options);
                } else {
                    grading = that.defaultGradeAnswer(vid, params, trueAnswer, submittedAnswer, options);
                }
            } catch (e) {
                var data = {
                    submission: submission,
                    variant: variant,
                    question: question,
                    course: course,
                };
                return callback(error.addData(e, data));
            }
            callback(null, grading);
        });
    },
};
