const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const bcrypt = require("bcrypt");
const Joi = require("joi");
const nodemailer = require("nodemailer");

const app = express();


app.use(express.json());
app.use(bodyParser.urlencoded({extended: true}));

//CODE TO CONNECT TO LOCAL MONGODB
const MONGO_URL = "mongodb://127.0.0.1:27017/salesDB";


const conectToDB = async () =>{
    try {
        await mongoose.connect(MONGO_URL, () => {
            console.log("success connection to database");
            //THIS BLOCK IS TO LISTEN TO THE SERVER

            const PORT = process.env.PORT || 3000

            app.listen(PORT, ()=> {
                console.log(`listening on ${PORT}`);
            })
        }); 
    } catch (error) {
        console.log(error);
    }
}
conectToDB();

//THIS BLOCK OF CODE WILL CREATE THE DIFFRENT MODEL AND SCHEMA'S FOR THE DATABASE
//MODEL FOR THE GOODS TO BE PURCHASE
const itemSchema = new mongoose.Schema({
    ID: Number,
    product: String,
    amount: Number,
    amountOrder: Number
});


const Order = new mongoose.model("Order", itemSchema);

//MODEL FOR THE CUSTOMER TO PURCHASE

const personSchema = new mongoose.Schema({
    username: String,
    password: String,
    productID: itemSchema,
    validated: Boolean,
});

const Person = new mongoose.model("Person", personSchema);

//MODEL TO GENRATE A ONE TIME OTP
const userOTPverificationSchema = new mongoose.Schema({
    userId: String,
    otp: String,
    createdAt: Date,
    expireAt: Date
});

const userOTPverification = new mongoose.model("userOTPverification", userOTPverificationSchema);

//MODEL TO VALIDATE AND SET THE SIGNUP CRITERIA
const schema = Joi.object({
    username: Joi.string()
        .alphanum()
        .min(6)
        .max(32)
        .required(),

    password: Joi.string()
        .pattern(new RegExp('^[a-zA-Z0-9]{3,30}$')),

    repeat_password: Joi.ref('password'),

    order: Joi.number,
})







//THIS BLOCK OF CODE WILL DISPLAY ALL THE ITEMS AVAILABLE FOR PURCHASE

app.get("/", (req, res) => {

   Order.find(function(err, docs){
        res.send({docs});
    })

});
//THIS BLOBK OF CODE WILL ALLOW FOR SELECTING THE CUSTOMER'S PRODUCTS
app.post("/", (req, res) => {
    res.redirect("/pay")
});

//THIS BLOCK IS TO VERIFY USER AND LOGIN

app.post("/login", (req, res) => {
    let { err, value } = schema.validate(req.body);
    if(err){
        res.send(res.json({err}))
    }else{
        try {
            Person.findOne({name: value.name}, (err, result) => {
                console.log(result);
                const hash = result.password;
                const hashedPassword = bcrypt.compare(value.password, hash);
                if (!hashedPassword){
                    res.json({
                        status: "USER NOT REGISTERED",
                        message: "kindly register to access"
                    });
                    res.redirect("/signup")
                }else{
                    res.redirect("/")
                }
            })
        } catch (error) {
            res.json({
                message: error
            });
        }
    }
})

//THIS BLOCK IS TO SIGN UP AND VERIFY ONE TIME OTP, THEN REDIRECT TO THE LOGIN PAGE

app.post("/signup", (req, res) => {
    let { err, value } = schema.validate(req.body);
    const saltRounds = 10;
    if(err){
        res.send(err);
    }
    if (value){
        const hashedPassword = bcrypt.hash(value.password, saltRounds);
        const person = new Person ({
            name: value.name,
            password: hashedPassword,
            productID: value.ID,
            validated: false 
        })
        try {
            person.save(()=>{
                console.log("saved");
            })
            sendOTPVerificationEmail( value , res);  
        } catch (error) {
            res.json({
                status: "NOT RESGITERED",
                message: error
            });
            res.redirect("/signup")
        }
    }
});

//CODE TO RESET PASSWORD
app.post("/resetpassword", (req, res) => {
    let { err, value } = schema.validate(req.body);
    if(err){
        res.json({error: err.message});
    }else{
        const User = value.name;
        const validUser = Person.findOne ({name: User})
        if(!validUser){
            res.json({
                status: "NOT YET REGISTERED",
                message: "KINDLY REGISTER TO ACCESS PAGE"
            });
            res.redirect("/signup")
        }else{
            const saltRounds = 10;
            try {
                const hashedPassword = bcrypt.hash(value.password, saltRounds);
                Person.updateOne({name: validUser}, {password: hashedPassword});
                sendOTPVerificationEmail(value, res);
            } catch (error) {
                res.send(error);  
            }
            
        }
    }
    
})

//THIS BLOCK OF CODE IS TO VERIFY THE OTP SENT TO THE MAIL AND REDIRECT TO LOGIN

app.post("/verifyOTP", async (req, res)=>{
    try {
        let { userId, otp } = req.body;
        if(!userId || !otp){
            throw Error("Empty otp are not allowed");
        }else{
            const UserOTPVerificationRecords = awaituserOTPverification.find({userId});
            if (UserOTPVerificationRecords.length <= 0){
                throw new Error( "Account record doesn't exist or has been verified")
            }else{
                const { expireAt } = UserOTPVerificationRecords[0];
                const hashedOTP = UserOTPVerificationRecords[0].otp;

                if(expireAt < Date.now()){
                    await UserOTPVerificationRecords.deleteMany( { userId });
                    throw new Error ("code has expired! try again");
                }else{
                    const validOTP = await bcrypt.compare(otp, hashedOTP);
                    if(!validOTP){
                        throw new Error("invalid code, check your mail")
                    }else{
                        User.updateOne({_id: userId}, {verified: true});
                        await UserOTPVerificationRecords.deleteMany( { userId });
                    }
                    res.json({
                        status: "VERIFIED",
                        message: "user email has been verified"
                    });
                    res.redirect("/login");
                }
            }
        }
    } catch (error) {
        res.json({
            status: "FAILED",
            message: error.message
        })
    }
})

//THIS BLOCK IS TO DIRECT TO THE PAY POINT
app.get("/pay", (req, res) => {
    Order.find({order_id: 1}, (err, foundItem)=>{
        res.send(foundItem);
    })
});

//THIS BLOCK ALLOWS FOR SUCCESFUL PAYMENT
app.post("/pay", (req, res) => {
    res.send("You have successfully made payments")
});


//THIS BLOBK IS THE CREATION OF THE ONE TIME OTP USING MATH.RANDOM TO GENERATE THE CODE
const sendOTPVerificationEmail = async ({ ID, name }, res) => {
    try {
        const otp = `${Math.floor(1000 + Math.random() * 9000)}`
        let testAccount = await nodemailer.createTestAccount();

        let transporter = nodemailer.createTransport({
            host: "smtp.ethereal.email",
            port: 587,
            secure: false,
            auth: {
            user: testAccount.user, 
            pass: testAccount.pass, 
            },
        });
        
        let info = await transporter.sendMail({
            from: "sender's mail", 
            to: "receiver's mail", 
            subject: "Verify Your Email", 
            text: "follow the html to verify your mail",
            html: `<p>Enter <b>${otp}</b> in the app to verify your mail</p><p>This code <b>expires in 1 hour</b></p>`,
            });
            
        const saltRounds = 10;
        const hashedOTP = await bcrypt.hash(otp, saltRounds);

        const newOTPVerification = await new userOTPverification({
            userId: ID,
            otp: hashedOTP,
            createdAt: Date.now(),
            expireAt: Date.now() + 3600000,
        })
        await newOTPVerification.save();
        await transporter.sendMail(info);
         res.json({
            status: "PENDING",
            message: "Verification otp email sent",
            data: {
                userId: ID,
                name,
            }
        })
    } catch (error) {
        res.json({
            status: "FAILED",
            message: error.message
        })
    }
}


