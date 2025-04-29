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
const bcrypt = require('bcrypt');
const fs = require('fs');

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
        if (username === process.env.ADMINUSERNAME && bcrypt.compareSync(password, process.env.ADMINPASSWORD)) {
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
    defaultLayout: 'main',
    helpers: require('./modules/eq')
}));
app.set('view engine', 'handlebars');


// Should the connection be always open or opened and closed as needed inside a function?

const dbURI = 'mongodb+srv://' + process.env.DBUSERNAME + ':' + process.env.DBPASSWORD + '@' + process.env.CLUSTER + '.c7byj1n.mongodb.net/' + process.env.DB + '?retryWrites=true&w=majority&appName=Hamk-projects';

mongoose.connect(dbURI)
.then((result) => {
    console.log('Connected to the DB');
})
.catch((err) => {
    console.log(err);
});



// alternative option; run mongodb locally? 
// this should work as of now if you run a mongodb server locally & create a database called WebFrameworkProject
// -mirkka


/* BLOG DATABASE CONNECTION 

mongoose.connect('mongodb://localhost:27017/WebFrameworkProject')
.then(() => console.log('Connected to MongoDB'))
.catch((error) => console.error('MongoDB connection error:', error));
*/

/* 
BLOG POST ROUTES
*/

const Post = require('./models/post'); // import the post schema

/* VALIDATE AND SANITATE INPUTS */

const { body, validationResult } = require('express-validator');

app.post('/admin/save-post',
    body('title')
    .trim()
    .escape()
    .notEmpty()
    .withMessage('Title is required')
    .isLength({ max: 200 })
    .withMessage('Title must be under 200 characters'), 
    // Trim and escape the title input, escape prevents script injections

body('content')
    .trim()
    .escape()
    .notEmpty()
    .withMessage('Content is required')
    .isLength({ max: 5000 })
    .withMessage('Content must be under 5000 characters'), 
    // Trim and escape the content input, same stuff as above

    (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        // If no errors, proceed with saving the post
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
    }
);

app.get('/admin/new-post', checkAuth, (request, response) => {
    response.render('new-post')
}
);
/* LIKES FOR BLOGPOSTS */

/* 
FEEDBACK FORM ROUTES
*/

app.get('/feedback', (request, response) => {
    if (request.isAuthenticated()) {
        console.log('admin true');
        response.render('feedback',
            {
                admin: 'admin',
                title: 'Our Park'
            }
        )
    } else {
        response.render('feedback',
            {
                title: 'Our Park'
            }
        )
    }
});

const Feedback = require('./models/feedback'); // import the feedback schema

// VALIDATE AND SANITATE INPUTS FOR FEEDBACK FORM

const feedbackValidation = [
    body('email')
        .isEmail()
        .withMessage('Invalid email address')
        .normalizeEmail(),
    body('subject')
        .trim()
        .escape()
        .notEmpty()
        .withMessage('Subject is required')
        .isIn(['feedback', 'issue'])
        .withMessage('Subject must be feedback or issue'),
    body('content')
        .trim()
        .escape()
        .notEmpty()
        .withMessage('Content is required')
        .isLength({ max: 2000 })
        .withMessage('Content must be under 2000 characters')
];

app.post('/send-feedback', feedbackValidation, (request, response) => {
    // Nodemailer
    sendMail(request.body.email, request.body.subject, request.body.content);
    /*
    response.redirect(303, '/thank-you');
    */

    // Save to MongoDB
    const { email, subject, content } = request.body; 
    const newFeedback = new Feedback({ email, subject, content });

    newFeedback.save()
        .then(() => {
            response.redirect(303, '/thank-you'); // redirect to the thank you page after saving
            console.log("Saved feedback"); // print successful feedback saves to console
        })
        .catch(err => {
            console.log(err);
            response.status(500).send('Error saving the feedback');
        });
});

app.get('/thank-you', (request, response) => {
    if (request.isAuthenticated()) {
        response.render('thank-you',
            {
                admin: 'admin',
                title: 'Our Park'
            }
        )
    } else {
        response.render('thank-you',
            {
                title: 'Our Park'
            }
        )
    }
});

/* ADMIN LOGIN VALIDATION */

const loginValidation = [
    body('username')
        .trim()
        .escape()
        .notEmpty()
        .withMessage('Username is required'),
    body('password')
        .trim()
        .notEmpty()
        .withMessage('Password is required')
];
/* 
ADMIN LOGIN ROUTES
*/

app.get('/admin/login', (request, response) => {
    response.render('login')
});

app.post('/login/password', loginValidation, passport.authenticate('local', {
    successRedirect: '/admin/new-post',
    failureRedirect: '/admin/login'
}));

app.get('/admin/logout', checkAuth, function(req, res, next){
    req.logout(function(err) {
      if (err) { return next(err); }
      res.redirect('/');
    });
});

/*
ADMIN VIEW FEEDBACK & ISSUES ROUTES
*/

app.get('/admin/view-feedbacks', checkAuth, async function(request, response, next){

    const feedbacks = await Feedback.find({"subject": "feedback"});

    const cleanedFeedbacks = feedbacks.map(feedback => ({
        id: feedback.id,
        email: feedback.email,
        status: feedback.status,
        content: feedback.content,
        // replace line breaks with <p> tags to ensure line breaks are displayed properly in the blog posts
        contentReplace: feedback.content
            .split(/\r?\n\r?\n/) 
            .map(p => `<p>${p}</p>`)
            .join(''),
        date: feedback.createdAt.toLocaleDateString('en-GB', {
            weekday: 'long', 
            year: 'numeric',
            month: 'numeric',
            day: 'numeric'
        }).replace(/\//g, '.') // replace slashes for dots in date formatting
    }));

    response.render('view-feedbacks',
        {
            feedbacks: cleanedFeedbacks
        }
    )    
});

app.get('/admin/view-issues', checkAuth, async function(request, response, next){

    const issues = await Feedback.find({"subject": "issue"});

    const cleanedIssues = issues.map(issue => ({
        id: issue.id,
        email: issue.email,
        status: issue.status,
        content: issue.content,
        // replace line breaks with <p> tags to ensure line breaks are displayed properly in the blog posts
        contentReplace: issue.content
            .split(/\r?\n\r?\n/) 
            .map(p => `<p>${p}</p>`)
            .join(''),
        date: issue.createdAt.toLocaleDateString('en-GB', {
            weekday: 'long', 
            year: 'numeric',
            month: 'numeric',
            day: 'numeric'
        }).replace(/\//g, '.') // replace slashes for dots in date formatting
    }));

    response.render('view-issues',
        {
            issues: cleanedIssues
        }
    )    
});

app.post('/admin/save-status', checkAuth, (req, res) => {
    // Save to MongoDB
    const { id, status } = req.body;

    Feedback.updateOne({ _id: id }, { $set: { status: status }})
        .catch(err => {
            console.log(err);
            res.status(500).send('Error saving the feedback');
        });
        res.status(201);
        res.end();
})

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


/* VISITOR, BLOG POSTS AND WEATHER DATA */

app.get('/', async (req, res) => {
    try {
        let weatherData = await weather();
        const posts = await Post.find();

        const cleanedPosts = posts.map(post => ({
            title: post.title,
            content: post.content,
            // replace line breaks with <p> tags to ensure line breaks are displayed properly in the blog posts
            contentReplace: post.content
                .split(/\r?\n\r?\n/) 
                .map(p => `<p>${p}</p>`)
                .join(''),
            date: post.createdAt.toLocaleDateString('en-GB', {
                weekday: 'long', 
                year: 'numeric',
                month: 'numeric',
                day: 'numeric'
            }).replace(/\//g, '.') // replace slashes for dots in date formatting
        }));

        if (req.isAuthenticated()) {
            res.render('index', {
                admin: 'admin',
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
                weathercode: wmo[weatherData.current.weather_code][weatherData.current.is_day]["description"],
                posts: cleanedPosts
            });
        } else {
            res.render('index', {
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
                weathercode: wmo[weatherData.current.weather_code][weatherData.current.is_day]["description"],
                posts: cleanedPosts
            });
        }
    } catch (err) {
        console.error(err);
        res.status(500).send('Error retrieving data');
    }
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

let wmo = JSON.parse(fs.readFileSync('wmo.json', 'utf-8'));

async function weather() {
    let weatherData = await fetch('https://api.open-meteo.com/v1/forecast?latitude=60.9167&longitude=24.6333&daily=temperature_2m_max,temperature_2m_min&current=is_day,temperature_2m,wind_direction_10m,cloud_cover,wind_speed_10m,wind_gusts_10m,precipitation,weather_code&timezone=auto')
    .then(res => res.json())
    return weatherData;
}


const PORT = process.env.PORT || 3300;
app.listen(PORT, () => console.log(`App listening on port ${PORT}`));