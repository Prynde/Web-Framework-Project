This is the project work by Team 3 for the "Web Framework Project"-course.
Team members: Miika Ståhl, Mirkka Kato, Tino Valve
This is a website for a park containing:
Blog for news (stored in MongoDB, can be retrieved by API also (API system in progress))
    -Ability to upload image and show it as part of the post
    -Like system for posts
Weather information (download by API from Open Meteo)
Visitor counter
Form for feedback/issue reporting (nodeMailer/MongoDB, express-validator) 
Admin pages (bcrypt & passport for session validation)
    -Post new blog posts
    -View received feedback and react to them
    -view received issues and react to them
Socket.io for server-client communication to update message-data @ DB (Currently: status (auth), subject (auth), feedback-likes. To be expanded)
more funtionalities to come.

Accessibility considerations:
    -Website has a decent color contrast for users
    -Keyboard navigation is logical and easy
    -Logical header structure and navigation
    -Pictures and buttons have descriptive alt text
    -Back to main page button
    -Evaluation tool usage
    Issues:
     -<div> usage should be replaced with better semantic elements such as <main>, <nav> and <section>.
        
    
