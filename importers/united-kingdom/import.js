var _ = require('lodash'),
    async = require('async'),
    csv = require('fast-csv'),
    locationSlugger = require('location-slugger'),
    Location = require(__dirname + '/../../models/location'),
    mongoose = require('mongoose');

parseCsv(function(data) {

    mongoose.connect('mongodb://localhost/townie');

    async.series([

            function(next) {
                console.log('Clearing Locations...')
                Location.remove({}, next)
            },

            function(next) {
                console.log('Creating United Kingdom')

                var unitedKingdom = new Location({
                    name: 'United Kingdom',
                    slugs: [
                        locationSlugger.slug('United Kingdom')
                    ]
                });

                unitedKingdom.save(next);
            },

            function(next) {
                console.log('Creating Countries')

                var countries = generateCountryNames(data);

                Location.findOne({ name: 'United Kingdom' }, function(err, unitedKingdom) {

                    async.each(countries, function(country, callback) {
                        unitedKingdom.appendChild(country);
                        country.save(callback);
                    }, next)
                })

            },

            function(next) {
                console.log('Creating London')

                var london = new Location({
                    name: 'London',
                    slugs: [
                        locationSlugger.slug('London'),
                        locationSlugger.slug('London, England, United Kingdom')
                    ]
                });

                london.save(function(err) {

                    //get England from db so we can attach London as a child
                    var england = Location.findOne({
                        name: 'England'
                    }, function(err, england) {

                        england.appendChild(london);

                        var londonBoroughNames = generateLondonBoroughNames(data);

                        async.each(londonBoroughNames, function(londonBoroughName, londonBoroughCb) {

                            var londonBorough = new Location({
                                name: londonBoroughName,
                                slugs: [
                                    locationSlugger.slug(londonBoroughName),
                                    locationSlugger.slug(londonBoroughName + ', London, England, United Kingdom'),
                                ]
                            });

                            london.appendChild(londonBorough);

                            londonBorough.save(function(err) {

                                var townsInLondonBorough = _.uniq(_.map(_.filter(data, {
                                    county: 'Greater London (' + londonBoroughName + ')'
                                }), function(o) {
                                    return o.name;
                                }));

                                async.each(townsInLondonBorough, function(townInLondonBoroughName, townInLondonBoroughCb) {

                                    var townInLondonBorough = new Location({
                                        name: townInLondonBoroughName,
                                        slugs: [
                                            locationSlugger.slug(townInLondonBoroughName),
                                            locationSlugger.slug(townInLondonBoroughName + ', ' + londonBoroughName + ', London' + ', England, United Kingdom'),
                                        ]
                                    });

                                    londonBorough.appendChild(townInLondonBorough)

                                    townInLondonBorough.save(townInLondonBoroughCb)
                                }, londonBoroughCb);


                            });
                        }, next)

                    });
                });
            },

            function(next) {
                console.log('Creating Counties')

                Location.findOne({ name: 'United Kingdom' }, function(err, unitedKingdom) {

                    unitedKingdom.getChildren({ limit: 10 }, function(err, countries) { //todo: remove limit 10 when PR is accepted

                        async.each(countries, function(country, countryCb) {

                            console.log('Getting Counties in   ', country.name)

                            var countyNamesInCountry = _.uniq(_.map(_.filter(data, {
                                country: country.name
                            }), function(o) {
                                return o.county;
                            }));

                            //remove london - we created this 'county' separately
                            if (country.name == 'England') {
                                countyNamesInCountry = _.filter(countyNamesInCountry, function(c) {
                                    return c.indexOf('Greater London') < 0;
                                })
                            }

                            async.each(countyNamesInCountry, function(countyNameInCountry, countyInCountryCb) {

                                console.log('Creating County  ', countyNameInCountry)

                                var county = new Location({
                                    name: countyNameInCountry,
                                    slugs: [
                                        locationSlugger.slug(countyNameInCountry),
                                        locationSlugger.slug(countyNameInCountry + ', ' + country.name + ', United Kingdom')
                                    ]
                                });

                                country.appendChild(county);
                                county.save(function() {

                                    console.log('getting towns in ', countyNameInCountry)

                                    var townNamesInCounty = _.uniq(_.map(_.filter(data, {
                                        county: countyNameInCountry
                                    }), function(o) {
                                        return o.name;
                                    }));

                                    async.each(townNamesInCounty, function(townNameInCounty, townInCountyCb) {

                                        var town = new Location({
                                            name: townNameInCounty,
                                            slugs: [
                                                locationSlugger.slug(townNameInCounty),
                                                locationSlugger.slug(townNameInCounty + ', ' + countyNameInCountry + ', ' + country.name + ', United Kingdom')
                                            ]
                                        });

                                        console.log('saving towns  ', townNameInCounty)

                                        county.appendChild(town);
                                        town.save(townInCountyCb)

                                    }, countyInCountryCb);
                                });
                            }, countryCb);
                        }, next);
                    });
                });
            }
        ],

        function(err, results) {

            if (err)
                console.log('Error: ', err)

            console.log('Done')
            process.exit();
        });
});

function parseCsv(callback) {

    var locationRows = [];

    csv
        .fromPath('data.csv', {
            headers: true
        })
        .on('data', function(data) {
            var location = {
                name: data.name,
                county: data.county,
                country: data.country,
                latitude: data.latitude,
                longitude: data.longitude,

                type: data.type,
            };

            locationRows.push(location);
        })
        .on('end', function() {
            return callback(locationRows);
        });
}

function generateCountryNames(data) {
    var countryNames = _.uniq(_.map(data, function(d) {
        return d.country;
    }));

    var countries = _.map(countryNames, function(countryName) {
        return new Location({
            name: countryName,
            slugs: [
                locationSlugger.slug(countryName),
                locationSlugger.slug(countryName + ', United Kingdom')
            ]
        })
    })

    return countries;
}

function generateLondonBoroughNames(data) {

    var londonBoroughs = _.map(_.filter(data, function(o) {
        return o.county.indexOf('Greater London') >= 0
    }), function(o) {
        return o.county;
    });

    var uniqueLondonBoroughs = _.uniq(londonBoroughs);

    return _.map(uniqueLondonBoroughs, function(l) {
        return l.match(/\(([^)]+)\)/)[1];
    })
}
