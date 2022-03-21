//stores a json file with data on how to generate the video, and the frequency of the video generation.
const path = require('path');
const os = require('os');
const fs = require('fs');
const admin = require('firebase-admin');
//initialize firebase
admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    databaseURL: "https://the-rvg.firebaseio.com"
});
exports.storeVideoSchedule = async function storeVideoSchedule(prompt, title, description, tags, generationMethod, numOfClips, writingStyle, frequency) {
    let data = {
        prompt,
        title,
        description,
        tags,
        generationMethod,
        numOfClips,
        writingStyle,
        frequency
    }
    
    let key = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    let json = JSON.stringify(data);
    //upload to firestore
    return await admin.firestore().collection('video-schedule').doc(key).set({data: json});
}