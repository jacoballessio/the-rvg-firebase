//this script is used to generate the thumbnail of the video
//The thumbnail is generated using html-to-image library\
//path
const path = require('path');
const fs = require('fs');
const os = require('os');
const functions = require("firebase-functions");
const fetch = require("node-fetch");
const htmlToImage = require("node-html-to-image");
async function generateThumbnail(title, keyword) {
    //title on left, and search pexels for stock image on right
    //reddit logo in top left
    let stockImage = await getStockImage(keyword);
    //REDDIT.png
    let html = `
    <!DOCTYPE html>
        <html lang="en">
        <body style="background-color: black; width: 500px;height 500px; over">
            <img src="https://cdn.discordapp.com/attachments/474829034908286976/948316693195804752/121-1217716_reddit-logo-png-transparent-png.png" style="width: 100px;height: 50px;">
            <div style="display: flex; flex-direction: row; justify-content: space-between; color: white">
                <div style="width: 25%; z-index:10">
                    <h1 style="color:white">${title}</h1>
                </div>

                <div style="width: 75%;">
                    <img src=${stockImage} alt="pexels stock image" style="width: 100%;">
                </div>
            </div>
        </body>
    </html>
    `;
    let thumbnailPath = path.join(os.tmpdir(), "./thumbnail.png");
    let image =  await htmlToImage({
        html,
        width: 500,
        height: 500,
        output: thumbnailPath,
    });
    return thumbnailPath;
}

async function getStockImage(search) {
    //search pexels for stock image
    //save the image to tmp directory
    const pexels_api_key = '563492ad6f917000010000011f9c74fdfd2840b18273ad42b78c5bd6';
    return await fetch(`https://api.pexels.com/v1/search?query=${search}&per_page=1&page=1`, {
        headers: {
            'content-type': 'application/json',
            'Authorization': `${pexels_api_key}`,
        },
        method: 'GET',
    })
    .then(response => response.json())
    .then(json => {
        return json.photos[0].src.medium;
    })
        
}



exports.generateThumbnail = functions.https.onRequest(generateThumbnail);