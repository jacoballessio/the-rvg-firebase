const functions = require("firebase-functions");
const admin = require("firebase-admin");
const express = require("express");
const cors = require("cors");
const app = express();
const {GenerationMethod, GenerationHelpers} = require("./generation_methods/generation-method.js");
const {storeVideoSchedule} = require("./store-video-schedule");
//this set's up our custom env file
require('dotenv').config();
app.get("/", (req, res) => {
    res.send("Hello World");
});

app.post("/create_video", async (req, res) => {
    let email = process.env.EMAIL;
    let password = process.env.PASSWORD;
    let params = { prompt, title, description, generationMethod, numOfClips, writingStyle, upload } = req.query;
    //create a new generation method object for each clip
    let genMethObj = GenerationMethod.methodSwitch(generationMethod, params);
    let genMethGen = await genMethObj.beginGeneration().then(async (response) => {
    
        console.log('response', response);
        title = response.title;
        return response.video;
    });
    const {uploadVideo} = require("./upload-via-puppeteer");
    let genMethGenNoBackslash = genMethGen.replace(/\\/g, "/");
    console.log('genMethGen', genMethGenNoBackslash);
    let {generateThumbnail} = require("./thumbnail-generator");
    let thumbnail = await generateThumbnail(title,GenerationHelpers.getKeyword(title));
    if(upload){
        await uploadVideo(genMethGenNoBackslash,email,password, title,thumbnail).catch((err) => {
            console.log('err', err);
        })
    } else {
        console.log('no upload');
    }
    console.log("Beginning video generation with prompt:" + prompt +", and generation method:" + generationMethod + ". Wait for response.");
    console.log(genMethGen);
    return res.download(genMethGen);
});

app.post("/set_schedule", async (req, res) => {
    storeVideoSchedule(req.query.prompt, req.query.title, req.query.description, req.query.tags, req.query.generationMethod, req.query.numOfClips, req.query.writingStyle, req.query.frequency);
});
app.post("/test", async (req, res) => {
    //import uploadVideoPup
    const {uploadVideo} = require("./upload-via-puppeteer");
    console.log(req.query);
    res.send(req.query);
});
app.get("/getThumbnail", async (req, res) => {
    let title = req.query.title;
    let keyword = req.query.keyword;
    const {generateThumbnail} = require("./thumbnail-generator");
    let thumbnail = await generateThumbnail(title,keyword);
    res.download(thumbnail);
});
// exports.api = functions.runWith({
//     // Ensure the function has enough memory and time
//     // to process large files
//     timeoutSeconds: 540,
//     memory: "1GB",
//   }).https.onRequest(app);
app.listen(3000, () => {
    console.log("Listening on port 3000");
});