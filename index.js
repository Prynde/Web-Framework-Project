const express = require('express');
const exphbs = require('express-handlebars');
const dotenv = require('dotenv');
dotenv.config();
const app = express();
app.use(express.json());
app.use(express.urlencoded({extended: true}));
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const session = require('express-session');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const fs = require('fs');
const httpServer = require("http").createServer(app);
var io = require('socket.io')(httpServer);
const multer = require('multer');
const path = require ('path');

app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

const sessionMiddleware = session({
  secret: 'You will never guess it',
  resave: false,
  saveUninitialized: true,
});

app.use(sessionMiddleware);

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
    response.redirect('/admin/login');
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

// use multer to add images to blog posts
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/'); // uploads/ folder in root
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});

const upload = multer({ storage: storage });
const Post = require('./models/post'); // import the post schema
const { body, validationResult } = require('express-validator');

// Save new post to front page
app.post('/admin/save-post', 
  upload.single('image'),
  body('title')
    .trim()
    .escape()
    .notEmpty()
    .withMessage('Title is required')
    .isLength({ max: 200 })
    .withMessage('Title must be under 200 characters'), 

  body('content')
    .trim()
    .escape()
    .notEmpty()
    .withMessage('Content is required')
    .isLength({ max: 5000 })
    .withMessage('Content must be under 5000 characters'), 

    body('imageDesc')
    .trim()
    .escape()
    .notEmpty()
    .withMessage('Image description is required')
    .isLength({ max: 100 })
    .withMessage('Image description must be under 100 characters'), 

  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { title, content, imageDesc } = req.body;
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

    const post = new Post({
      title,
      content,
      imageUrl,
      imageDesc,
      likes
    });

    try {
      await post.save();
      res.redirect('/admin/post-saved'); // Redirect after saving the post
    } catch (err) {
      console.error(err);
      res.status(500).send('Error saving post');
    }

    console.log('Uploaded file:', req.file);
  }
);

// Page to add new post to front page  
app.get('/admin/new-post', checkAuth, (request, response) => {
    response.render('admin-new-post',
        {
            admin: 'admin',
            title: 'Admin: New post'
        }
    )
});

// Confirm new post has been saved
app.get('/admin/post-saved', checkAuth, (request, response) => {
    response.render('admin-post-saved',
        {
            admin: 'admin',
            title: 'Admin: New post saved'
        }
    )
});


// single post view

app.get('/post/:id', async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);

        if (!post) {
            return res.status(404).send('Post not found');
        }

        // fetch the post's comments
        const comments = await Comment.find({ postId: post._id }).sort({ createdAt: -1 });

        // format comments
        const formattedComments = comments.map(c => ({
            content: c.content,
            createdAt: c.createdAt.toLocaleString('en-GB', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            })
        }));

        // clean up post data
        const cleanedPost = {
            _id: post._id,
            title: post.title,
            content: post.content,
            imageUrl: post.imageUrl,
            contentReplace: post.content
                .split(/\r?\n\r?\n/)
                .map(p => `<p>${p}</p>`)
                .join(''),
            likes: post.likes,
            date: post.createdAt.toLocaleDateString('en-GB', {
                weekday: 'long', 
                year: 'numeric',
                month: 'numeric',
                day: 'numeric'
            }).replace(/\//g, '.')
        };

        // pass the cleaned post and comments to the view
        if (req.isAuthenticated()) {
            res.render('single-post', {
                admin: 'admin',
                title: cleanedPost.title,
                post: cleanedPost,
                comments: formattedComments
            });
        } else {
            res.render('single-post', {
                title: cleanedPost.title,
                post: cleanedPost,
                comments: formattedComments
            });
        }
    } catch (err) {
        console.error(err);
        res.status(500).send('Error retrieving post');
    }
});

// comment routes
const Comment = require('./models/comments');

app.post('/post/:id/comments', async (req, res) => {
    console.log('POST /post/:id/comments hit for', req.params.id);
    console.log('req.body.content:', req.body.content);
    console.log('req.params.id:', req.params.id);
    
    try {
        await Comment.create({
            postId: req.params.id,
            content: req.body.content,
        });
        res.redirect(`/post/${req.params.id}`);
    } catch (err) {
        console.error(err);
        res.status(500).send('Error adding comment');
    }
});



/* LIKES FOR BLOGPOSTS */

// simple implementation of like button with no auth required

app.post('/like-post', async (req, res) => {
    const postId = req.body.id;

    try {
        // Increment the like count in the database
        await Post.updateOne({ _id: postId }, { $inc: { likes: 1 } });

        const updatedPost = await Post.findById(postId);

        // Send the new like count back to the client
        res.json({ likes: updatedPost.likes });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error liking the post');
    }
});


/* 
FEEDBACK FORM ROUTES
*/

// Write feedback
app.get('/feedback', (request, response) => {
    if (request.isAuthenticated()) {
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

// View public feedbacks
app.get('/view-feedbacks', async (request, response) => {

    const feedbacks = await Feedback.find({"published": "true"});

    const cleanedFeedbacks = feedbacks.toReversed().map(feedback => ({
        id: feedback.id,
        likes: feedback.likes,
        email: feedback.email,
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
        }).replace(/\//g, '.'), // replace slashes for dots in date formatting
        reply: feedback.reply,
        replyDate: feedback.replyDate.toLocaleDateString('en-GB', {
            weekday: 'long', 
            year: 'numeric',
            month: 'numeric',
            day: 'numeric'
        }).replace(/\//g, '.')
    }));

    if (request.isAuthenticated()) {
        response.render('view-feedbacks',
            {
                admin: 'admin',
                title: 'Our Park',
                feedbacks: cleanedFeedbacks
            }
        )
    } else {
        response.render('view-feedbacks',
            {
                title: 'Our Park',
                feedbacks: cleanedFeedbacks
            }
        )
    }
});

const Feedback = require('./models/feedback'); // import the feedback schema

// validate and sanitate feedback form inputs
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
        .notEmpty()
        .withMessage('Content is required')
        .isLength({ max: 5000 })
        .withMessage('Content must be under 5000 characters')
];

// saving the feedback

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
        })
        .catch(err => {
            console.log(err);
            response.status(500).send('Error saving the feedback');
        });
});

// Confirm feedback has been sent/saved
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


/* 
ADMIN LOGIN ROUTES
*/

// login validation

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

// Login page
app.get('/admin/login', (request, response) => {
    response.render('admin-login', { title: "Admin Login", errors: request.session.messages })
    request.session.messages = undefined
});

// Login handler
app.post('/login/password', loginValidation, passport.authenticate('local', {
    successRedirect: '/admin/new-post',
    failureRedirect: '/admin/login',
    failureMessage: true
}));

// Logout handler
app.get('/admin/logout', checkAuth, function(req, res, next){
    io.disconnectSockets();
    console.log('Logged out');
    req.logout(function(err) {
      if (err) { return next(err); }
      res.redirect('/');
    });
});

/*
ADMIN VIEW FEEDBACK & ISSUES ROUTES
*/

// View all feedbacks
app.get('/admin/view-feedbacks', checkAuth, async function(request, response, next){

    const feedbacks = await Feedback.find({"subject": "feedback"});

    const cleanedFeedbacks = feedbacks.toReversed().map(feedback => ({
        id: feedback.id,
        published: feedback.published,
        email: feedback.email,
        subject: feedback.subject,
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
        }).replace(/\//g, '.'), // replace slashes for dots in date formatting
        reply: feedback.reply,
        replyDate: feedback.replyDate.toLocaleDateString('en-GB', {
            weekday: 'long', 
            year: 'numeric',
            month: 'numeric',
            day: 'numeric'
        }).replace(/\//g, '.')
    }));

    response.render('admin-view-feedbacks',
        {
            title: 'Admin: View feedbacks',
            feedbacks: cleanedFeedbacks
        }
    )    
});

/*
Admin page for keeping track of images in uploads folder
*/

app.get('/admin/upload-folder', checkAuth, async function(request, response, next){
    const files = await fs.readdirSync('uploads');
    var pageContent = "";
    
    for (let file of files) {
        const post = await Post.findOne({ 'imageUrl': '/uploads/' + file})
        if (post) {
            pageContent += '<li><div><img src="/uploads/' + file + '" style="max-width: 100%; height: auto;"><br><p>' + file + ' Is attached to post: <a href="/post/' + post._id + '">' + post._id + '</a></p></div></li><br>';
        } else {
            pageContent += '<li><div><img src="/uploads/' + file + '" style="max-width: 100%; height: auto;"><br><p>' + file + ' Is not attached to any post!</p><p><a href="/admin/delete-image/' + file + '">Delete the file</a></div></li><br>';
        }
    }
    
    response.render('admin-upload-folder',
    {
        admin: 'admin',
        title: 'Browse the contents of upload folder',
        content: pageContent
    });
});

/*
Route for deleting unneeded files
*/

app.get('/admin/delete-image/:file', checkAuth, function(request, response) {
    fs.unlinkSync('uploads/' + request.params.file);
    response.redirect('/admin/upload-folder');
});

// View all issues
app.get('/admin/view-issues', checkAuth, async function(request, response, next){

    const issues = await Feedback.find({"subject": "issue"});

    const cleanedIssues = issues.toReversed().map(issue => ({
        id: issue.id,
        email: issue.email,
        subject: issue.subject,
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
        }).replace(/\//g, '.'), // replace slashes for dots in date formatting
        reply: issue.reply,
        replyDate: issue.replyDate.toLocaleDateString('en-GB', {
            weekday: 'long', 
            year: 'numeric',
            month: 'numeric',
            day: 'numeric'
        }).replace(/\//g, '.')
    }));

    response.render('admin-view-issues',
        {
            title: 'Admin: View issues',
            issues: cleanedIssues
        }
    )    
});

/*
Route for deleting posts from front page
*/

app.post('/admin/delete-post', checkAuth, (req, res) => {
    let id = req.body.id;
    console.log('Delete:' + id);

    Post.deleteOne({ _id: id })
        .catch(err => {
            console.log(err);
            res.status(500).send('Error deleting the post');
        });
    res.status(201);
    res.end();
});

// Socket connections
// Auth stuff
const wrap = middleware => (socket, next) => middleware(socket.request, {}, next);

io.use(wrap(sessionMiddleware));
io.use(wrap(passport.initialize()));
io.use(wrap(passport.session()));

io.on('connection', function(socket) {
    console.log("a user has connected!");
    socket.on('disconnect', function() {
        console.log('user disconnected');
    });
    
    socket.on('admin-change-event', function(id, value, item, callback) {
        if (socket.request.user) {
            let obj = {};
            if (item == 'subject') {
                Feedback.updateOne({ _id: id }, { $set: { status: 'New' }}) 
                    .catch(err => {
                        console.log(err);
                    });       
            }
            obj[item] = value;
            Feedback.updateOne({ _id: id }, { $set: obj})
                .catch(err => {
                    console.log(err);
                    callback({status: "error"});
                });
            callback({status: "ok"});
        }
    });

    socket.on('admin-publish', function(id, value, callback) {
        if (socket.request.user) {
            Feedback.updateOne({ _id: id }, { $set: { published: value }})
                .catch(err => {
                    console.log(err);
                    callback({status: "error"});
                });
            callback({status: "ok"});
        }
    })

    socket.on('like-feedback', async function (id, callback) {
        await Feedback.updateOne({ _id: id }, { $inc: { likes: 1 }})
            .catch(err => {
                console.log(err);
                callback({status: "error"});
            });
        
        let document = await Feedback.findOne({ _id: id });
        callback({status: "ok", likes: document.likes });
    });
    
    socket.on('admin-reply', async function (id, replyContent, callback) {
        if (socket.request.user) {
            if (!replyContent || replyContent.trim() === '') {
                return callback({ status: 'error', message: 'Reply content cannot be empty' });
            }
        
            try {
                const feedback = await Feedback.findById(id);
        
                if (!feedback) {
                    return callback({ status: 'error', message: 'Feedback not found' });
                }
        
                feedback.reply = replyContent;
                feedback.replyDate = new Date();
        
                await feedback.save();
        
                // Emit an event to update the reply on the client side
                io.emit('reply-updated', {
                    id: feedback.id,
                    reply: feedback.reply,
                    replyDate: feedback.replyDate.toLocaleDateString('en-GB', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'numeric',
                        day: 'numeric',
                    }).replace(/\//g, '.'),
                });
        
                callback({ status: 'ok', message: 'Reply saved successfully' });
            } catch (err) {
                console.error(err);
                callback({ status: 'error', message: 'Error replying to feedback' });
            }
        }
    });
});

/*
// Now using socket.io instead

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
*/

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

/* VISITOR, BLOG POSTS & WEATHER FOR FRONT PAGE */

app.get('/', async (req, res) => {
    try {
        let weatherData = await weather();
        const posts = await Post.find();
        const comments = await Comment.aggregate([{$group : {_id : '$postId', count : {$sum : 1}}}]); // Count comments per postId
        const cleanedPosts = (comments, posts.toReversed().map((post) => ({
            id: post._id,
            title: post.title,
            content: post.content,
            imageUrl: post.imageUrl,
            imageDesc: post.imageDesc,
            // replace line breaks with <p> tags to ensure line breaks are displayed properly in the blog posts
            contentReplace: post.content
                .split(/\r?\n\r?\n/) 
                .map(p => `<p>${p}</p>`)
                .join(''),
            likes: post.likes,
            comments: comments[comments.findIndex(x => x._id == post._id.toString())] ? comments[comments.findIndex(x => x._id == post._id.toString())].count : '0', // If comments exist, show count, otherwise show 0
            date: post.createdAt.toLocaleDateString('en-GB', {
                weekday: 'long', 
                year: 'numeric',
                month: 'numeric',
                day: 'numeric',
            }).replace(/\//g, '.') // replace slashes for dots in date formatting
        })));

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

/*
API ROUTES
*/

// API guide
app.get('/api', (request, response) => {
    if (request.isAuthenticated()) {
        response.render('api',
            {
                admin: 'admin',
                title: 'API Usage Guide'
            }
        )
    } else {
        response.render('api',
            {
                title: 'API Usage Guide'
            }
        )
    }
});

// All posts
app.get('/api/posts', async (request, response) => {
    const result = await Post.find()
    .then((result) => {
        response.status(200).json (
            {
                status: 'success',
                results: result.length,
                data: result
            }
        )
    });
});

// Latest post
app.get('/api/posts/latest', async (request, response) => {
    const result = await Post.find().sort({_id:-1}).limit(1)
    .then((result) => {
        response.status(200).json (
            {
                status: 'success',
                results: result.length,
                data: result
            }
        )
    });
});

// Search posts by date
app.get('/api/posts/search', async (request, response) => {
    const result = await Post.find({ createdAt:{$gte: new Date(request.query.from),$lt: new Date(request.query.to)} })
    .then((result) => {
        response.status(200).json (
            {
                status: 'success',
                results: result.length,
                data: result
            }
        )
    });
});

// Create a new post (Requires authentication)
app.post('/api/posts/create', loginValidation, passport.authenticate('local'),

    body('title')
    .trim()
    .escape()
    .notEmpty()
    .withMessage('Title is required')
    .isLength({ max: 200 })
    .withMessage('Title must be under 200 characters'), 

  body('content')
    .trim()
    .escape()
    .notEmpty()
    .withMessage('Content is required')
    .isLength({ max: 5000 })
    .withMessage('Content must be under 5000 characters'), 

  async (request, response) => {
    const errors = validationResult(request);
    if (!errors.isEmpty()) {
      return response.status(400).json({ errors: errors.array() });
    }

    const { title, content } = request.body;
    
    const post = new Post({
      title,
      content
    });

    try {
      await post.save();
      response.location('localhost:' + PORT + '/api/posts/view/' + post._id);
      response.status(201).json(
          {
              msg: 'Post added',
              post
          }
      );
  
    } catch (err) {
      console.error(err);
      response.status(500).send('Error saving post');
    }
    request.logout(function(err) {
        if (err) { return next(err); }
      });
});

// View single post and it's comments
app.get('/api/posts/view/:id', async (request, response) => {
    let post = await Post.find({'_id': request.params.id})
    let comments = await Comment.find({'postId': request.params.id})
    
    response.status(200).json (
        {
            status: 'success',
            results: post.length + ' post, ' + comments.length + ' comments',
            data: {post, comments}
        }
    )
});

// Like a post
app.patch('/api/posts/like/:id', async (request, response) => {
    try {
        const result = await Post.updateOne({ _id: request.params.id }, { $inc: { likes: 1 }})
        let document = await Feedback.findOne({ _id: request.params.id });
            response.status(200).json (
                {
                    msg: 'Succesfully liked.',
                    likes: document.likes
                }
            )
    } catch(e) {
        console.log(e);
        response.status(500).json (
            {
                status: e
            }
        );
    }
});

// Delete post (Requires authentication)
app.delete('api/posts/delete', loginValidation, passport.authenticate('local'), async (request, response) => {
    Post.deleteOne({ _id: request.params.id })
        .then((result) => {
        response.json(result);
    })
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

// Retrieve weather data
async function weather() {
    let weatherData = await fetch('https://api.open-meteo.com/v1/forecast?latitude=60.9167&longitude=24.6333&daily=temperature_2m_max,temperature_2m_min&current=is_day,temperature_2m,wind_direction_10m,cloud_cover,wind_speed_10m,wind_gusts_10m,precipitation,weather_code&timezone=auto')
    .then(res => res.json())
    return weatherData;
}

// Create listener for connections
const PORT = process.env.PORT || 3300;
httpServer.listen(PORT, () => console.log(`App listening on port ${PORT}`));