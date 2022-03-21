//use puppeteer on youtube.com to click the upload button
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');
const {google} = require('googleapis');
const OAuth2 = google.auth.OAuth2;
const functions = require("firebase-functions");
async function uploadVideo(path, email, password, title, thumbnailPath) {
    console.log("here: ", arguments);
    console.log('uploading video...', path);
    const browser = await puppeteer.launch({ headless: false});
    const page = await browser.newPage();
    const navigationPromise = page.waitForNavigation()
        
    await page.goto('https://www.youtube.com/upload');
    //click on the email input  await navigationPromise

    await page.waitForSelector('input[type="email"]');
    await page.click('input[type="email"]');

    await navigationPromise

    //TODO : change to your email 
    await page.type('input[type="email"]', email);

    await page.waitForSelector('#identifierNext');
    await page.click('#identifierNext');

    await page.waitFor(500);

    await page.waitForSelector('input[type="password"]');
    await page.click('input[type="email"]');
    await page.waitFor(500);
//click show password

    await navigationPromise
    await page.click('#password input[type="password"]');
    //TODO : change to your password
    await page.waitFor(500);
    await navigationPromise;
    await page.type('input[type="password"]', password);

    await page.waitForSelector('#passwordNext');
    await page.click('#passwordNext');

    await page.waitFor(500);
    await navigationPromise;
    
    await page.waitForSelector('#select-files-button');
    
    let [fileChooser] = await Promise.all([
        page.waitForFileChooser(),
        page.click('#select-files-button'),
    ]);
    await fileChooser.accept([path]);
    await enterInformation(title, thumbnailPath, page);
}

async function enterInformation(title, thumbnailPath, page) {
    //type the title
    //ytcp-social-suggestions-textbox with label = Title
    await page.waitForSelector('ytcp-social-suggestions-textbox[label="Title"]');
    //wait half a second
    await page.waitFor(500);
    
    await page.click('ytcp-social-suggestions-textbox[label="Title"]');
    await page.type('ytcp-social-suggestions-textbox[label="Title"]', title);
    //upload the thumbnail ytcp-thumbnails-compact-editor-uploader
    await page.waitForSelector('ytcp-thumbnails-compact-editor-uploader');
    await page.click('ytcp-thumbnails-compact-editor-uploader');
    let [fileChooser] = await Promise.all([
        page.waitForFileChooser(),
        page.click('ytcp-thumbnails-compact-editor-uploader'),
    ]);
    await fileChooser.accept([thumbnailPath]);
    //click on input element with name VIDEO_MADE_FOR_KIDS_NOT_MFK
    await page.waitForSelector('tp-yt-paper-radio-button[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"]');
    await page.click('tp-yt-paper-radio-button[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"]');
    //click next
    await page.waitFor(500);
    await page.waitForSelector('#next-button');
    await page.click('#next-button');
    //click next
    await page.waitFor(500);
    await page.waitForSelector('#next-button');
    await page.click('#next-button');
    //click next
    await page.waitFor(500);
    await page.waitForSelector('#next-button');
    await page.click('#next-button');
    //click "public"
    //tp-yt-paper-radio-button with name PUBLIC

    await page.waitFor(500);
    await page.waitForSelector('tp-yt-paper-radio-button[name="PUBLIC"]');
    await page.click('tp-yt-paper-radio-button[name="PUBLIC"]');
    //click done-button
    await page.waitFor(500);
    await page.waitForSelector('#done-button');
    await page.click('#done-button');
    await page.waitFor(500);
    await page.waitForSelector('#done-button');
    await page.click('#done-button');
    await page.waitFor(500);
    await page.waitForSelector('#done-button');
    await page.click('#done-button');
    await page.waitFor(500);
    await page.waitForSelector('#done-button');
    await page.click('#done-button').then(async () => {
        return await browser.close();
    });
}
exports.uploadVideo = uploadVideo;