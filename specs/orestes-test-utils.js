var Promise = require('bluebird');
var retry = require('bluebird-retry');
var request = Promise.promisifyAll(require('request'));
var _ = require('underscore');
var expect = require('chai').expect;

var BASE_URL = 'http://localhost:9668/';
var ES_MATCH_ALL = {
    match_all: {}
};

function randInt(max) {
    return Math.floor(Math.random() * max);
}

// generates sample data for tests
// info is an object describing the data you want
// Possible keys for info:
// count: tells how many points you want to create, defaults to 10
// start: the timestamp of the earliest point you want to import
// interval: the interval between timestamps, in milliseconds
// tags: an object of the form {tagName1: [tag1Value1, tag1Value2...], tagName2: [tag2Value1,tag2value2,...]}
//     will create an equal number of points having each value for each tag (+/- 1 for divisibility)
function generate_sample_data(info) {
    info = info || {};
    var sampleData = [];

    var count = info.count || 10;
    var tags = info.tags || {name: 'test'};
    var interval = info.interval || 1;
    var date = (info.start) ? new Date(info.start) : new Date();

    for (var k = 0; k < count; k++) {
        var pointTags = {};

        _.each(tags, function(values, key) {
            pointTags[key] = values[k % values.length];
        });

        var sampleMetric = {
            time: date.toISOString(),
            value: randInt(100)
        };

        sampleData.push(_.extend(sampleMetric, pointTags));

        date.setTime(date.getTime() + interval);
    }

    return sampleData;
}

function build_attr_string(d) {
    var keys = _.keys(d).sort();
    var strs = _.map(keys, function(key) {
        return key + '=' + d[key];
    });
    return strs.join(',');
}

function sort_series(serieses) {
    return _.sortBy(serieses, function(series) {
        return build_attr_string(series.tags);
    });
}

function series_from_points(points) {
    var grouped = _.groupBy(points, function(point) {
        var tags = _.omit(point, 'time', 'value');
        return build_attr_string(tags);
    });
    var result = [];
    _.each(grouped, function(points, rowKey) {
        result.push({
            tags: _.omit(points[0], 'time', 'value'),
            points: points.map(function(pt) {
                return [new Date(pt.time).getTime(), pt.value];
            })
        });
    });

    return result;
}

function write(points) {
    if (!Array.isArray(points)) { points = [points]; }
    var write_url = BASE_URL + 'write';
    return request.postAsync({
        url: write_url,
        json: points
    })
    .spread(function(res, body) {
        expect(res.statusCode).equal(200);
        return body;
    });
}

function read(query, start, end) {
    var read_url = BASE_URL + 'read';
    return request.postAsync({
        url: read_url,
        json : {
            query: query || ES_MATCH_ALL,
            start: start || 0,
            end: end || Date.now()
        }
    })
    .spread(function(res, body) {
        expect(res.statusCode).equal(200);
        return body;
    });
}

function verify_import(points, query, expected) {
    expected = sort_series(series_from_points(expected || points));
    return retry(function() {
        return read(query)
            .then(function(result) {
                expect(sort_series(result)).deep.equal(expected);
            });
    });
}

function remove(space) {
    var delete_url = BASE_URL + 'delete';
    return request.postAsync({
        url: delete_url,
        json: {
            space: space,
            keep_days: 0
        }
    })
    .spread(function(res, body) {
        expect(res.statusCode).equal(200);
    });
}

function read_series(query) {
    var series_url = BASE_URL + 'series';

    return request.postAsync({
        url: series_url,
        json: {
            query: query || ES_MATCH_ALL,
            start: 0,
            end: Date.now()
        }
    })
    .spread(function(res, body) {
        expect(res.statusCode).equal(200);
        return body;
    });
}

function select_distinct(keys, query) {
    var select_distinct_url = BASE_URL + 'select_distinct';

    return request.postAsync({
        url: select_distinct_url,
        json: {
            keys: keys,
            query: query || ES_MATCH_ALL
        }
    })
    .spread(function(res, body) {
        expect(res.statusCode).equal(200);
        return body;
    });
}

function count(query, start, end) {
    var count_url = BASE_URL + 'read';
    return request.postAsync({
        url: count_url,
        json : {
            query: query || ES_MATCH_ALL,
            start: start || 0,
            end: end || Date.now(),
            aggregations: [{
                type: 'count'
            }]
        }
    })
    .spread(function(res, body) {
        expect(res.statusCode).equal(200);
        return body;
    });
}

module.exports = {
    write: write,
    verify_import: verify_import,
    series_from_points: series_from_points,
    sort_series: sort_series,
    read_series: read_series,
    select_distinct: select_distinct,
    count: count,
    remove: remove,
    generate_sample_data: generate_sample_data,
    build_attr_string: build_attr_string
};
