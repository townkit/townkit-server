var express = require('express'),
    multer  = require('multer'),
    upload = multer(),
	app = express();

var router = express.Router();

app.get('/favicon.ico', function(req, res) {
    res.status(200);
});

app.set('view engine', 'pug')

//routes
app.use('/import', require('./routes/import'));
app.use('/', require('./routes/locations'));

var port = process.env.PORT || 8080;
app.listen(port);

console.log('Running on port ' + port);