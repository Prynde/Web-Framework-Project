const express = require('express');
const exphbs = require('express-handlebars');
const dotenv = require('dotenv');
dotenv.config();
const app = express();
app.use(express.json());
app.use(express.urlencoded({extended: false}));
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const session = require('express-session');
const mongoose = require('mongoose');

app.use(express.static('public'));

app.use(session({
  secret: 'You will never guess it',
  resave: false,
  saveUninitialized: true,
}));

app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => {
    done(null, user.id);
});
  
passport.deserializeUser((user, done) => {
    done(null, user);
});

passport.use(
    new LocalStrategy((username, password, done) => {
        if (username === process.env.ADMINUSERNAME && password === process.env.ADMINPASSWORD) {
            console.log('Logged in');
            return done(null, { id: 1, username: username });
        } else {
            return done(null, false, { message: 'Invalid credentials' });
        }
    })
);

const checkAuth = (request, response, next) => {
    if (request.isAuthenticated()) { 
        return next()
    }
    response.redirect('/admin/login')
}

app.engine('handlebars', exphbs.engine({
    defaultLayout: 'main'
}));
app.set('view engine', 'handlebars');

/*
// Should the connection be always open or opened and closed as needed inside a function?

const dbURI = 'mongodb+srv://' + process.env.DBUSERNAME + ':' + process.env.DBPASSWORD + '@' + process.env.CLUSTER + '.c7byj1n.mongodb.net/' + process.env.DB + '?retryWrites=true&w=majority&appName=Hamk-projects';

mongoose.connect(dbURI)
.then((result) => {
    console.log('Connected to the DB');
})
.catch((err) => {
    console.log(err);
});
*/


// alternative option; run mongodb locally? 
// this should work as of now if you run a mongodb server locally & create a database called WebFrameworkProject
// -mirkka


/* BLOG DATABASE CONNECTION */

mongoose.connect('mongodb://localhost:27017/WebFrameworkProject')
.then(() => console.log('Connected to MongoDB'))
.catch((error) => console.error('MongoDB connection error:', error));


/* 
BLOG POST ROUTES
*/

const Post = require('./models/post'); // import the post schema

app.post('/admin/save-post', checkAuth, (req, res) => {
    const { title, content } = req.body; 
    const newPost = new Post({ title, content });

    newPost.save()
        .then(() => {
            res.redirect('/admin/new-post'); // redirect to the new post page after saving
            console.log("Saved post"); // print successful blog saves to console as there's no frontend view as of now
        })
        .catch(err => {
            console.log(err);
            res.status(500).send('Error saving the post');
        });
});

app.get('/admin/new-post', checkAuth, (request, response) => {
    response.render('new-post')
});



/* 
FEEDBACK FORM ROUTES
*/

app.get('/feedback', (request, response) => {
    response.render('feedback',
        {
            title: 'Our Park'
        }
    )
});

app.post('/send-feedback', (request, response) => {
    sendMail(request.body.email, request.body.subject, request.body.text);
    response.redirect(303, '/thank-you');
});

app.get('/thank-you', (request, response) => {
    response.render('thank-you',
        {
            title: 'Our Park'
        }
    )
});


/* 
ADMIN LOGIN ROUTES
*/

app.get('/admin/login', (request, response) => {
    response.render('login')
});

app.post('/login/password', passport.authenticate('local', {
    successRedirect: '/admin/new-post',
    failureRedirect: '/admin/login'
}));

app.post('/admin/logout', checkAuth, function(req, res, next){
    req.logout(function(err) {
      if (err) { return next(err); }
      res.redirect('/');
    });
});


/*
NODEMAILER
*/ 

const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
    host: "mail.prynde.fi",
    port: 465,
    secure: true, // true for port 465, false for other ports
    auth: {
        user: process.env.MAILUSERNAME,
        pass: process.env.MAILPASSWORD,
    },
    tls: {
        rejectUnauthorized: false
    }
});

async function sendMail(email, subject, text) {
    const info = await transporter.sendMail({
        from: email, // Sender address
        to: process.env.MAILUSERNAME, // Receiver address
        subject: subject, // Subject line
        text: text, // Plain text body
      });
}


/* VISITOR AND WEATHER DATA ROUTES & FUNCTIONS */

app.get('/', async (request, response) => {
    let weatherData = await weather();
    response.render('index',
        {
            title: 'Our Park',
            visitors: visitors(),
            currentTemperature: weatherData.current.temperature_2m,
            todayHigh: weatherData.daily.temperature_2m_max[0],
            todayLow: weatherData.daily.temperature_2m_min[0],
            windDir: weatherData.current.wind_direction_10m,
            clouds: weatherData.current.cloud_cover,
            windspeed: weatherData.current.wind_speed_10m,
            windgusts: weatherData.current.wind_gusts_10m,
            precipitation: weatherData.current.precipitation,
            weathercode: wmo[weatherData.current.weather_code]
        }
    )
});

function visitors() {   // Return count of visitors since 01.04.2025
    let start = new Date('2025-04-01');
    let end = new Date(new Date().toJSON().slice(0, 10));
    let timeDifference = end - start;
    let visitorCount = timeDifference / (1000 * 3600 * 24) * 30 * 12; // Counting average one visitor per 2 minutes during opening hours 10am-10pm
    const date = new Date();
    if (date.getUTCHours() >= (24 - (Math.abs((new Date().getTimezoneOffset())) / 60))) { // Hack to fix counting error for the first few hours of the day, "end" receives date as GMT+0 and "hours" receive date(hours) as GMT+2/3 depending on DST
        visitorCount = visitorCount + 360;
    }
    let hours = date.getHours();
    let minutes = date.getMinutes();
    if (hours >= 10 && hours <= 21) {
        hours = hours - 10;
        visitorCount = visitorCount + (hours * 30) + Math.round(minutes / 2);
    } else if (hours >= 22) {
        visitorCount = visitorCount + 360;
    }
    return visitorCount;
}

let wmo = {
    0: "Clear sky",
    1: "Mainly clear, partly cloudy, and overcast",
    2: "Mainly clear, partly cloudy, and overcast",
    3: "Mainly clear, partly cloudy, and overcast",
    45: "Fog and depositing rime fog",
    48: "Fog and depositing rime fog",
    51: "Drizzle: Light, moderate, and dense intensity",
    53: "Drizzle: Light, moderate, and dense intensity",
    55:	"Drizzle: Light, moderate, and dense intensity",
    56: "Freezing Drizzle: Light and dense intensity",
    57:	"Freezing Drizzle: Light and dense intensity",
    61: "Rain: Slight, moderate and heavy intensity",
    63: "Rain: Slight, moderate and heavy intensity",
    65:	"Rain: Slight, moderate and heavy intensity",
    66: "Freezing Rain: Light and heavy intensity",
    67:	"Freezing Rain: Light and heavy intensity",
    71: "Snow fall: Slight, moderate, and heavy intensity",
    73: "Snow fall: Slight, moderate, and heavy intensity",
    75:	"Snow fall: Slight, moderate, and heavy intensity",
    77:	"Snow grains",
    80: "Rain showers: Slight, moderate, and violent",
    81: "Rain showers: Slight, moderate, and violent",
    82:	"Rain showers: Slight, moderate, and violent",
    85: "Snow showers slight and heavy",
    86:	"Snow showers slight and heavy",
    95:	"Thunderstorm: Slight or moderate",
    96: "Thunderstorm with slight and heavy hail",
    99:	"Thunderstorm with slight and heavy hail"
};
async function weather() {
    let weatherData = await fetch('https://api.open-meteo.com/v1/forecast?latitude=60.9167&longitude=24.6333&daily=temperature_2m_max,temperature_2m_min&current=temperature_2m,wind_direction_10m,cloud_cover,wind_speed_10m,wind_gusts_10m,precipitation,weather_code&timezone=auto')
    .then(res => res.json())
    return weatherData;
}


const PORT = process.env.PORT || 3300;
app.listen(PORT, () => console.log(`App listening on port ${PORT}`));