var _ = require("underscore");
var moment = require("moment-timezone");
var db = require("./db");

exports.getDefaultOptions = function() {
    return {
        allowQuestionSubmit: true,
    };
};

exports.updateTest = function(test, options) {
    test.qids = options.qids;
    test.availDate = moment.tz(options.availDate, options.timezone).format();
    test.text = options.text;
    test.maxScore = 1;
    test.maxQScoresByQID = _.chain(options.qids)
        .flatten()
        .map(function(qid) {return [qid, 1];})
        .object()
        .value();
};

exports.updateTInstance = function(tInstance, test, options, questionDB) {
    if (_(tInstance).has('score') && !_(tInstance).has('scorePerc')) {
        // upgrade a score to a scorePerc, without applying credit limits
        tInstance.scorePerc = Math.floor(tInstance.score / test.maxScore * 100);
    }
    _(tInstance).defaults({
        qData: {},
        score: 0,
        scorePerc: 0,
    });
    tInstance.questions = [];
    _(test.qids).each(function(qid) {
        tInstance.questions.push({
            qid: qid,
            title: questionDB[qid] && questionDB[qid].title,
        });
    });
};

exports.updateWithSubmission = function(tInstance, test, submission, options, callback) {
    var qid = submission.qid;
    if (!_(test.qids).contains(qid))
        return callback(new Error("Invalid QID"));
    if (tInstance.uid !== submission.uid)
        return callback(new Error("Mismatched UID"));

    var qiid = submission.qiid;
    db.sCollect.findOne({qiid: qiid}, function(err, existingSubmission) {
        if (existingSubmission) {
            return callback(new Error("Submission already exists for this question"));
        }

        if (!submission.practice && _(test.credit).isFinite() && test.credit > 0) {
            // per-question score is average of score of all attempts
            if (tInstance.qData[qid] === undefined)
                tInstance.qData[qid] = {nAttempt: 0, avgScore: 0, minScore: 1, maxScore: 0};
            var d = tInstance.qData[qid];
            d.nAttempt++;
            d.avgScore = d.avgScore * (d.nAttempt - 1) / d.nAttempt + submission.score / d.nAttempt;
            d.minScore = Math.min(d.minScore, submission.score);
            d.maxScore = Math.max(d.maxScore, submission.score);

            // overall test score is average of per-question scores
            tInstance.score = _(test.qids).reduce(function(memo, qid) {
                return memo + ((tInstance.qData[qid] === undefined) ? 0 : tInstance.qData[qid].avgScore);
            }, 0) / test.qids.length;

            // compute the score as a percentage, applying credit bonus/limits
            newScorePerc = Math.floor(tInstance.score * 100);
            if (test.credit < 100) {
                newScorePerc = Math.min(newScorePerc, test.credit);
            }
            if (test.credit > 100 && tInstance.score == 1) {
                newScorePerc = test.credit;
            }
            tInstance.scorePerc = Math.max(tInstance.scorePerc, newScorePerc);
        }

        callback(null);
    });
};
