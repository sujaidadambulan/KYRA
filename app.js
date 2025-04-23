const express = require('express');
const app = express();
const env = require('dotenv').config();
const db = require('./config/db');
const path = require('path');
const passport = require('./config/passport')
const userRoute = require('./routes/userRouter');
const adminRoute = require('./routes/adminRouter');
const errorHandler = require('./middlewares/error');
const session = require('express-session');
const port = process.env.PORT || 5667
db()

app.use(session({
    secret:process.env.SESSION_SECRET,
    resave:false,
    saveUninitialized:true,
    cookie:{
        secure:false,
        httpOnly:true,
        maxAge:72*60*60*1000
    }
}))

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.set('view engine','ejs');
app.set('views',[path.join(__dirname,'views/admin'),path.join(__dirname,'views/user')])

app.use(passport.initialize());
app.use(passport.session())

app.use('/',userRoute);
app.use('/admin',adminRoute);

// app.use((req, res, next) => {
//     const err = new Error();
//     err.statusCode = 404;
//     next(err);
//   });

// app.use(errorHandler);

app.use('*', (req, res) => {
    res.redirect('/error');
  });
  

app.listen(port, ()=>{
    console.log(`server is running`)
})
