const functions = require("firebase-functions");
const videoCreationTools = {
    defaultHTML: `
    <html>
    <body>
    <p>Default</p>
    </body>
    </html>
    `,
    createHTMLFrame: function (fileName, html) {
        //using node-html-to-image
        const htmlToImage = require('node-html-to-image');
        const fs = require('fs');
        const path = require('path');
        const filePath = path.join(__dirname, '../public/images/' + fileName);
        const options = {
            width: 1280,
            height: 720,
            format: 'png',
            quality: 1,
            type: 'png'
        };
        htmlToImage.fromString(html, options)
            .then(function (image) {
                fs.writeFile(filePath, image, 'base64', function (err) {
                    if (err) {
                        console.log(err);
                    }
                    return filePath;
                });
            })
            .catch(function (error) {
                console.error(error);
            });
    },
    createHTMLVideo: function(fileName, html=this.defaultHTML) {
        
    }
}