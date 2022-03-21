//dependencies and constants
const fetch = require('node-fetch');
const rp = require('request-promise');
const cheerio = require('cheerio');
const os = require('os');
const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
ffmpeg.setFfmpegPath(ffmpegPath);
//set ffprobe path
ffmpeg.setFfprobePath(require('@ffprobe-installer/ffprobe').path);
const textToSpeech = require('@google-cloud/text-to-speech');
//node-html-to-image
const htmlToImage = require('node-html-to-image');
const keyfile = require('../the-rvg-736433cba82e.json');
const { get } = require('http');
// import { createClient } from 'pexels';

// const client = createClient('563492ad6f917000010000011f9c74fdfd2840b18273ad42b78c5bd6');
// const query = 'Nature';


const GenerationHelpers = {
    splitText: function (text, maxLength) {
        var result = [];
        var current = '';
        for (var i = 0; i < text.length; i++) {
            if (text[i] === ' ') {
                if (current.length > maxLength) {
                    result.push(current);
                    current = '';
                }
                current += text[i];
            } else {
                current += text[i];
            }
        }
        if (current.length > 0) {
            result.push(current);
        }
        return result;
    },
    fetchGpt3Api: async function(prompt, repeatNum = 1) {
        const engine = "text-curie-001";
        const gpt3_endpoint = 'https://api.openai.com/v1/engines/'+engine+'/completions';
        const gpt3_token = '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';
        //shorten prompt to 2000 characters
        prompt = prompt.substring(0, 1400);
        //remove any special characters
        prompt = prompt.replace(/[^\w\s]/gi, '');
        //first run
        let res = await fetch(gpt3_endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer '+gpt3_token
            },
            body: JSON.stringify({
                "prompt": prompt,
                "temperature": 0.75,
                "max_tokens": 1400,
                "top_p": 0.95,
                "stop": "\n/"
            })
        });
        let json = await res.json();
        let returnString = json.choices[0]==null?'test':json.choices[0].text;
        for (let i = 0; i < repeatNum; i++) {
            let res = await fetch(gpt3_endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer '+gpt3_token
                },
                body: JSON.stringify({
                    "prompt": returnString,
                    "temperature": 0.9,
                    "max_tokens": 100,
                    "stop": "\n/"
                })
            });
            let json = await res.json();
            returnString += json.choices[0].text;
        }
        return returnString;

    },

    getRedditPost: async function (prompt) {
        const reddit_endpoint = 'https://www.reddit.com/search.json?q='+prompt+'&restrict_sr=on&sort=relevance&t=all';
        let res = await fetch(reddit_endpoint);
        let json = await res.json();
        //for each of the children on json.data, check if it has a selftext, if it does, return it
        for (let i = 0; i < json.data.children.length; i++) {
            if (json.data.children[i].data.selftext != "") {
                return json.data.children[i];
            } else {
                return json.data.children[0];
            }
        }
    },

    getRedditPosts: async function (prompt) {
        //get 10 posts
        const reddit_endpoint = 'https://www.reddit.com/search.json?q='+prompt+'&restrict_sr=on&sort=relevance&t=all&limit=10';
        let res = await fetch(reddit_endpoint);
        let json = await res.json();
        //for each of the children on json.data, check if it has a selftext, if it does, return it
        return json.data.children;
    },

    getStockVideo: async function (prompt) {
        //pexels api using api key 563492ad6f917000010000011f9c74fdfd2840b18273ad42b78c5bd6
        const pexels_endpoint = 'https://api.pexels.com/videos/search?query='+prompt+'&per_page=1&page=1&orientation=landscape&size=medium';
        const pexels_api_key = '563492ad6f917000010000011f9c74fdfd2840b18273ad42b78c5bd6';
        let res = await fetch(pexels_endpoint, {
            headers: {
                'Authorization': 'Bearer '+pexels_api_key
            }
        });
        let json = await res.json();
        //create a temp file to store the video
        let randomId = Math.floor(Math.random() * 1000000);
        let tempFile = path.join(os.tmpdir(), randomId+'stock.mp4');
        let vidRes = await fetch(json.videos[0].video_files[0].link);
        let buffer = await vidRes.buffer();
        //write the video to the temp file, and when it's done, return the temp file
        //use a promise
        return new Promise((resolve, reject) => {
            fs.writeFile(tempFile, buffer, (err) => {
                if (err) {
                    reject(err);
                }
                resolve(tempFile);
            });
        });
    },

    scrapeParagraphs: async function(url) {
        //scrape the paragraphs from the url
        let $ = cheerio.load(await rp(url));
        let paragraphs = '';
        //for each paragraph, add it to the paragraphs string
        $('p').each((i, elem) => {
            paragraphs += $(elem).text() + '\n';
        });
        return paragraphs;
    },

    summarizeText: async function(text) {
        //run text through gpt3
        let gpt3_response = await GenerationHelpers.fetchGpt3Api(text+"\n Here is a summary of the text(in less than 1000 characters): ").catch(err => {
            //if gpt3 fails, just return the first 10 words of the text
            return text.split(' ').slice(0, 10).join(' ');
        });

        return gpt3_response;
    },

    getKeyword:async function(text) {
        //run text through gpt3
        let gpt3_response = await GenerationHelpers.fetchGpt3Api(text+"\n The single keyword that best describes this text is: ").catch(err => {
            //return first word of text if gpt3 fails
            return text.split(' ')[0];
        });

        return gpt3_response;
    },

    generateQuestion: async function() {
        let questionifyString = `come up with a question regarding the following prompt:  
        \n prompt:   
        ${this.prompt}  
        \n The question should be structured based on the writing style(just structure, no content.): 
        \n  ${this.writingStyle}
        \n \n new question:`;


        return await GenerationHelpers.fetchGpt3Api(questionifyString).then(response => {
            //do response.text
            return response + "?";
        });
    },

    scrapeArticle: async function(url) {
        //scrape the paragraphs from the url
        let $ = cheerio.load(await rp(url));
        let paragraphs = '';
        //for each paragraph, add it to the paragraphs string
        $('p').each((i, elem) => {
            paragraphs += $(elem).text() + '\n';
        }
        );
        return paragraphs.substring(0, 3000);

    },

    getTextToSpeech: async function(text, fileName) {
        console.log('getting text to speech', text, fileName);
            //using google text to speech
        const client = new textToSpeech.TextToSpeechClient({
            projectId: keyfile.project_id,
            keyFilename: require.resolve('../the-rvg-736433cba82e.json')
        });

        const input = {text: text};
        const voice = {
            languageCode: 'en-US',
            name: 'en-US-Wavenet-F',
            ssmlGender: 'female'
        };
        const audioConfig = {audioEncoding: 'MP3'};
        const request = {input: input, voice: voice, audioConfig: audioConfig};
        
        const audioFile = path.join(os.tmpdir(), path.basename(fileName+'.mp3'));
        //save to buffer and upload to bucket
        await client.synthesizeSpeech(request).then(async (response) => {
                //log the response
                fs.writeFileSync(audioFile, response[0].audioContent, 'binary');
                console.log('audio file saved to', audioFile);
                return audioFile;
        });
        return audioFile;
    },
    generateHTMLClip: async function(text, fileNameId, html) {
        //if the html is null, use the default html
        if (html == null) {
            html = `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body>
            <p>test</p>
            </body>
            </html>`;
        }
    },

    divideText: function(text, numParts){
    //divide the text into numParts parts
        let parts = [];
        let partSize = Math.floor(text.length / numParts);
        for (let i = 0; i < numParts; i++) {
            parts.push(text.slice(i*partSize, (i+1)*partSize));
        }
        return parts;
    },
    combineClips: async function(clips, id="undefined"){
    //use video stitch to combine the clips
        let videoStitch = require('video-stitch');
        //map each clip to {'fileName': clip}
        let clipsMap = clips.map((clip)=>{
            return {'fileName': clip};
        });
        let videoConcat = videoStitch.concat;
        const metadata = {
            contentType: 'video/mp4',
            };

        const outputFilePath = path.join(os.tmpdir(), path.basename(id+'mainoutput.mp4'));

        //using ffmpeg
        return await videoConcat({
            silent: true, // optional. if set to false, gives detailed output on console
            overwrite: false, // optional. by default, if file already exists, ffmpeg will ask for overwriting in console and that pause the process. if set to true, it will force overwriting. if set to false it will prevent overwriting.
            ffmpeg_path: ffmpegPath
            })
            .clips(clipsMap)
            .output(outputFilePath)
            .concat().then((file) => {
                console.log(outputFilePath,file);
                return outputFilePath;
            }).catch((err) => {
                console.log(err);
            });
        },
    combineClipsFfmpeg: async function(clips, id){
    //use ffmpeg to combine the clips
        let ffmpeg = require('fluent-ffmpeg');
        let outputFilePath = path.join(os.tmpdir(), path.basename(id+'mainoutput.mp4'));
        await new Promise((resolve, reject) => {
            //combine the clips
            let command = ffmpeg({priority: 20}).fps(29.7).videoCodec('libx264')
            .on('error', function(err) {
                console.log('An error occurred: ' + err.message);
                reject();
            })
            .on('end', function() {
                console.log(outputFilePath + ': Processing finished !');
                resolve()
            });
            
            clips.forEach((clip)=>{
                command.input(clip);
                
            });
         
            command.mergeToFile(outputFilePath);
        }).catch((err) => {
            console.log("hg"+err);
        });
        return outputFilePath;
    },
    blackClip: async function(){
        //use ffmpeg to black out the video
        //create random id
        let id = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        let outputFilePath = path.join(os.tmpdir(), path.basename(id+'blackout.mp4'));
        await new Promise(async (resolve, reject) => {
            //create a black clip that is 2 seconds long
            let html = `
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>

                <body style="background-color: black; width: 300; height: 300">
                null
                </body>
            </html>`;
            //create a frame with the html using our node-html-to-image library
            //frame path
            let framePath = path.join(os.tmpdir(), path.basename(id+'frame.png'));
            let frame = await htmlToImage({
                output: framePath,
                html: html,
                width: 300,
                height: 300
            }).then(async (res) => {
                return framePath;
            })
            //create a black clip that is 2 seconds long
            //use ffmpeg
            //and our frame
            let command = ffmpeg().input(frame)
            .videoCodec('libx264')
            //dummy audio
            .audioCodec('libmp3lame')
            //audio from static3.mp4
            .input(path.join(__dirname, 'static3.mp4'))

            .outputOptions([
                //encode
                '-preset ultrafast',
                //set video bitrate
                '-b:v 2000k',
                //set video resolution
                '-s 1920x1080',
                //set video framerate
                '-r 30']
            )
            .size('1920x1080')
            //clip to 1 second
            .setStartTime('00:00:00')
            .setDuration('00:00:01')
            
            //set size to square
            .save(outputFilePath)
            .output(outputFilePath)
            .on('error', function(err) {
                console.log('An error occurred: ' + err.message);
                reject();
            })
            .on('end', function() {
                console.log(outputFilePath + ': Processing finished !');
                resolve()
            });
        }).catch((err) => {
            console.log("hg"+err);
        });
        return outputFilePath;
    },
            
    maxText:function(text, maxLength) {
        //this is similar to dividing text, but each segment will be maxLength characters long
        let parts = [];
        let partSize = maxLength;
        for (let i = 0; i < text.length; i += partSize) {
            parts.push(text.slice(i, i+partSize));
        }
        return parts;
    },
    getPostFromSubreddit: async function(subreddit, search) {
        //get the top post from the subreddit
        let url = `https://www.reddit.com/r/${subreddit}/search.json?q=${search}&sort=top&restrict_sr=on&t=all`;
        //get the top post from the subreddit
        let response = await rp(url).catch(err => {
            console.log(err);
        });
        let parsedResponse = JSON.parse(response);
        let post = parsedResponse.data.children[0].data;
        return post;
    },
    getCommentsFromPost: async function(post) {
        //get the first 10 comments from the post
        let url = `https://www.reddit.com${post.permalink}comments.json?sort=top&limit=10`;
        let response = await rp(url).catch(err => {
            console.log(err);
        });
        let parsedResponse = JSON.parse(response);
        let comments = parsedResponse[1].data.children;
        return comments;

    },
    overlayVideo: async function(backgroundPath, forgroundPath, outputPath) {
        //overlay the forground video on the background video
        //return the output file

        return new Promise((resolve,reject)=>{
            //shorten background to match forground
                 ffmpeg()
                     //loop background
                     .input(backgroundPath)
                     .input(forgroundPath)
                     .complexFilter([
                         '[0:v]scale=1920:1080[0scaled]',
                         '[1:v]scale=300:300[1scaled]',
                         '[0scaled]pad=1920:1080[0padded]',
                         '[1:a]amix=inputs=1',
                         '[0padded][1scaled]overlay=shortest=0:x=0[output]',
                       ])
                       .outputOptions([
                         '-map [output]'
                       ])
                       .output(outputPath)
                       .on("error",function(er){
                         reject(er);
                         console.log("error occured: "+er.message);
                       })
                       .on("end",function(){
                         resolve(outputPath);
                       })
                       .run();
         }).then((outputPath) => {
             //upload to bucket
             console.log(outputPath);
             return outputPath;
         });
    },
    mapClips: async function(clips) {
        //map each clip to {'fileName': clip}
        let clipsMap = clips.map((clip)=>{
            return {'fileName': clip};
        });
        return clipsMap;
    },
    getStockImage: async function(prompt) {
        const pexels_api_key = '563492ad6f917000010000011f9c74fdfd2840b18273ad42b78c5bd6';

        //get stock image from pexels
        //make sure to include the api key
        return await fetch(`https://api.pexels.com/v1/search?query=${prompt}&per_page=1&page=1`, {
            headers: {
                'Authorization': `${pexels_api_key}`
            }
        }).then(response => {
            return response.json();
        }).then(data => {
            //return the first image url
            return data.photos[0].src.original;
        });
    },
    generateThumbnail: async function(title) {
        //the thumbnail is a square image with the title on the left, and a stock image on the right
        let image = await this.getStockImage(title);
        let html = `<!DOCTYPE html>
        <html lang="en" style={width: 300px; height:300px}>
        <head>
            </head>
            <body style={width: 300px; height:300px}>
            <div style="display:flex;">
                <div style="width:150px;height:300px; background-color: black;background-size:cover;background-position:center; color: white">${title}</div>
                <div style="width:150px;height:300px;background-image:url(${image});background-size:cover;background-position:center;"></div>
            </div>
            </body>
        </html>`;
        //html to image
        //node html-to-image
        //return the image
        let imagePath = path.join(os.tmpdir(), path.basename('thumbnail.png'));
        return await htmlToImage({
            output: imagePath,
            html: html,
            //set the width and height of the image
            width: 300,
            height: 300
        }).then(async () => {
            return imagePath;
        });
    },
    getTitleSummary: async function(title) {
        //get the summary of the title
        //use gpt-3 to generate a 20 character summary
        //return the summary
        const engine = "text-curie-001";
        const gpt3_endpoint = 'https://api.openai.com/v1/engines/'+engine+'/completions';
        const gpt3_token = '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';
        let res = await fetch(gpt3_endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer '+gpt3_token
            },
            body: JSON.stringify({
                "prompt": "create a short 5 word title for the following text:\n "+ title+"\n title:",
                "temperature": 0.75,
                "max_tokens": 20,
                "top_p": 0.95,
                "stop": "\n/"
            })
        });
        let json = await res.json();
        return await json.choices[0].text;
        
    },
}
//-----end of helper functions

//this class is pretty much finished, so be careful when editing it.
//You can usually just create a sub class of this class and override the methods you want to change.
class GenerationMethod {
    
    constructor(prompt, writingStyle, numOfClips=1) {
        this.fileNameId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        this.prompt = prompt;
        this.writingStyle = writingStyle;
        this.numOfClips = numOfClips;
    }
    
    //-----Static functions------
    static methodSwitch(method, params) {
        let {prompt, writingStyle, numOfClips} = params;
        //will switch between the different sub classes of GenerationMethod
        let method2;
        var str = `method2 = new ${method}(prompt, writingStyle, numOfClips, params);`;
        eval(str);
        return method2;
    }
    //-----end of static functions------

    async beginGeneration() {
        let clips = [];
        for (let i = 0; i < this.numOfClips; i++) {
            let title = await this.GenerationHelpers.generateQuestion();
            let text = await this.generateText(title, this.writingStyle);
          
            let framePath = await this.generateFrames(text, i);
            let audioPath = await this.generateAudio(text, i);
            let clip = await this.generateClip(i, framePath, audioPath);
            clips.push(clip);
        }
        //
        return {video: await GenerationHelpers.combineClips(clips, this.fileNameId)};
    }

    //this will generate a question based on the prompt and writing style using GPT-3


    async generateText(question, writingStyle) {
        let promptString = `create a response in the following writing style in brackets:[${writingStyle}]
        \n to the following question:${question}`;
        return GenerationHelpers.fetchGpt3Api(promptString).then(response => {
            //do response.text
            return response;
        });
    }

    async generateAudio(text, clipNum) {
      
        return await GenerationHelpers.getTextToSpeech(text, this.fileNameId+clipNum).then(async (audioFile) => {
            console.log('bigaudio:', audioFile);
            return audioFile;
        });
    }

    async generateFrames(text, html=null, clipNum) {
        html==null?html=`<!DOCTYPE html>
        <html>
        <head>
        <meta charset="utf-8">
        <title>${this.prompt}</title>
        </head>
        <body style="height:250px; width: 500px; background: black;">
        <h1 style="color:white">${this.prompt}</h1>
        <img src="https://i.imgur.com/FH8M8Zf.png" style="height:50px; width:50px;float: left;"">
        <p style="float: left; color: white">${text}</p>
        </body>
        </html>`:html=html;
        const imagePath = path.join(os.tmpdir(), path.basename(this.fileNameId + clipNum +'.png'));
        //html to image save to path
        return await htmlToImage({
            output: imagePath,
            html: html
        }).then(async () => {
            return imagePath;
        });
    }

    async generateClip(clipNum=0, framePath, audioPath) {
        //get audio and frames from bucket
        //concatenate audio and frames
        //upload to bucket
        //use ffmpeg to concatenate audio and frames
        // //save to temp path
        // const audioFile = path.join(os.tmpdir(), path.basename(this.fileNameId+clipNum+'.mp3'));
        // const framesFile = path.join(os.tmpdir(), path.basename(this.fileNameId+clipNum+'.png'));
        const outputFile = path.join(os.tmpdir(), path.basename(this.fileNameId+clipNum+'.mp4'));
        //if these paths contain a file, do nothing, otherwise generate audio and frames
        //let output = bucket.file(this.fileNameId+'.mp4');
                //concatenate audio and frames
        return await new Promise((resolve,reject)=>{
            if(audioPath!=null) {
                ffmpeg()
                //stream loop input option that loops the frame file for as long as the audio file is playing
                
                .input(framePath)
                .input(audioPath)
                //make the frame loop for as long as the audio file is playing
                .output(outputFile)
                .outputOption('-shortest')
                //-fflags +shortest -max_interleave_delta 100M 
                .outputOption('-fflags +shortest')
                .outputOption('-max_interleave_delta 100M')
                //set audio and video codecs
                .videoCodec('libx264')
                .audioCodec('libmp3lame')
                .outputOptions([
                    //encode
                    '-preset ultrafast',
                    //set video bitrate
                    '-b:v 2000k',
                    //set audio bitrate
                    '-b:a 128k',
                    //set video resolution
                    '-s 1920x1080',
                    //set video framerate
                    '-r 30']
                )
                //set size to square
                .save(outputFile)
                .on('end', () => {
                    resolve(outputFile);
                })
                .on('error', (err) => {
                    reject(err);
                })
                .run();
            } else {
                ffmpeg()
                //stream loop input option that loops the frame file for as long as the audio file is playing
                
                .input(framePath)
                //make the frame loop for as long as the audio file is playing
                .output(outputFile)
                .outputOption('-shortest')
                //-fflags +shortest -max_interleave_delta 100M 
                .outputOption('-fflags +shortest')
                .outputOption('-max_interleave_delta 100M')
                //set audio and video codecs
                .videoCodec('libx264')
                .audioCodec('libmp3lame')
                //set size to square
                .save(outputFile)
                .on('end', () => {
                    resolve(outputFile);
                })
                .on('error', (err) => {
                    reject(err);
                })
                .run();
            }
        }).then(() => {
            //upload to bucket
            return outputFile;
        });

    }
}
class ContentOverStockClip extends GenerationMethod {
    constructor(prompt, writingStyle, numOfClips) {
        super(prompt, writingStyle, numOfClips);
    }
    async beginGeneration() {
        return await this.fetchNews().then(async (response) => {
            let clips = [];
            for(let i=0; i<this.numOfClips; i++) {
                let article = response.articles[i];
                let {title, description, url,content} = article;
                content = await GenerationHelpers.scrapeParagraphs(url).then(async (response) => {
                    return response.substring(0,600)
                }).catch(err => {
                    console.log(err);
                });
                //get GenerationHelpers.getStockVideos
                let stockLocalPath = await GenerationHelpers.getStockVideo(title).then(async (response) => {
                    //log response
                    console.log('stcplk',response);
                    return response;
                }).catch(err => {
                    console.log(err);
                });
                
                let framePath = await this.generateFrames(text, null, i);
                let audioPath = await this.generateAudio(text, i);
                let contentClipLocalPath = await super.generateClip(i, framePath, audioPath).then( (response) => {
                    console.log(response);
                    return response;
                }).catch(err => {
                    console.log(err);
                });
                //use ffmpeg to overlay the content clip over the stock video
                
                //have it so the content clip is in front, and about 1/4th the size of the stock video background
                //overlay the content clip over the stock video
                //you will need to change the options so that it overlays
                //overlay the content clip over the stock video
                
                const outputFile = path.join(os.tmpdir(), path.basename(this.fileNameId+'merged'+i+'.mp4'));
                let newPath = await this.overlayVideo(stockLocalPath, contentClipLocalPath, outputFile).then( (response) => {
                    console.log('overlay:'+response);
                    return response;
                }).catch(err => {
                    console.log(err);
                });
                clips.push(newPath);
            }
            //merge clips
            let mergedPath = await GenerationHelpers.combineClips(clips, this.fileNameId).then( (response) => {
                console.log(response);
                return response;
            }).catch(err => {
                console.log(err);
            });
            return {video: mergedPath};
        }).catch(err => {
            console.log(err);
        });

    }

    async fetchNews(prompt) {
        let apiKey = 'd11ce1b3360549228a2df9e43bd2442e';
        let url = `https://newsapi.org/v2/top-headlines?country=us&category=technology&apiKey=${apiKey}`
        return await fetch(url).then(async (response) => {
            return await response.json();
        }).catch(err => {
            console.log(err);
        });
    }

    async getKeywords(text) {
        //reduces a long string of text to a handful of keywords
        //returns an array of keywords
        //use GPT-3 to generate keywords that would best fit the text
        let prePrompt = 'Generate a keyword that best describes the following text: ';
        return GenerationHelpers.fetchGpt3Api(prePrompt+text+"Display word here: ").then(async (response) => {
            //remove excess whitespace
            //split by whitespace
            let keywords = response.split(' ');
            
            //delete any characters that come before or after a whitespace
            let keyword = keywords[0].replace(/[^a-zA-Z ]/g, '');
            //remove whitespace
            keyword = keyword.replace(/\s/g, '');
            return keyword;
        }).catch(err => {
            console.log(err);
        });
    }

    async overlayVideo(backgroundPath, forgroundPath, outputPath) {
        GenerationHelpers.overlayVideo(backgroundPath, forgroundPath, outputPath);
    }
}
class TechNews extends ContentOverStockClip {
    constructor(prompt, writingStyle, numOfClips) {
        super(prompt, writingStyle, numOfClips);
    }
    //only generate the stock clips, not the content clips
    //be sure to use the audio still
    async beginGeneration() {
        return await this.fetchNews().then(async (response) => {
            let clips = [];
            for(let i=0; i<this.numOfClips; i++) {
                let article = response.articles[i];
                let {title, description, url,content} = article;
                content = await GenerationHelpers.scrapeParagraphs(url).then(async (response) => {
                    return response.substring(0,600)
                }).catch(err => {
                    return err;
                });
                //get GenerationHelpers.getStockVideos
                let stockLocalPath = await GenerationHelpers.getStockVideo(title).then(async (response) => {
                    return response;
                }).catch(err => {
                    return err;
                });
                clips.push(stockLocalPath);
                //add audio to stock video
                clips.push(this.generateAudio(content, i));
            }
            //merge clips
            console.log(clips);
            let mergedPath = await GenerationHelpers.combineClips(clips, this.fileNameId).then( (response) => {
                console.log(response);
                return {video: response};
            }).catch(err => {
                return err;
            });
            return mergedPath;
        }).catch(err => {
            console.log('error getting news');
            return 'error getting news';
        });

    }
}
class RPrompt extends ContentOverStockClip {
    constructor(prompt, writingStyle, numOfClips) {
        super(prompt, writingStyle, numOfClips);
    }

    async beginGeneration() {
        //get the reddit post
        //generate clips
        //merge clips
        //return the merged clip
        let clips = [];
        for(let i = 0; i < this.numOfClips; i++) {
            let text = "";
            let contentClip = await GenerationHelpers.getRedditPosts(this.prompt).then(async(response) => {
                //generate frames and audio
                let {title, selftext} = response[i].data;
                let url = response[i].data.url_overridden_by_dest || 'https://www.cnbc.com/2022/01/12/investors-are-paying-millions-for-virtual-land-in-the-metaverse.html';
                console.log('url_overridden_by_dest',url);
                //if the url isn't empty, scrape all the paragraphs from the url. Then, summarize the paragraphs.
                if(url !== '') {
                    let paragraphs = await GenerationHelpers.scrapeParagraphs(url);
                    if(paragraphs!==null) {
                        let summary = await GenerationHelpers.summarizeText(paragraphs);
                        selftext = summary;
                    }
                }
                text = selftext;

                return await this.generateClip(title||"Untitled", selftext||title||"No content.", i, [response[i].data.thumbnail]).then(async (response) => {
                    return response;
                }).catch(err => {
                    console.log(err);
                });
            }).catch(err => {
                console.log(err);
            });
            let keyword = GenerationHelpers.getKeyword(text);
            let stockClip = await GenerationHelpers.getStockVideo(keyword).then(async (response) => {
                return response;
            }).catch(err => {
                console.log(err);
            });

            let output = path.join(os.tmpdir(), path.basename(this.fileNameId+'mergedout'+i+'.mp4'));
            await this.overlayVideo(stockClip, contentClip, output).then( (response) => {
                clips.push(output);
                //clips.push('./videos/static.mp4');
            }).catch(err => {
                console.log(err);
            });
        }
        //combine clips
        return await GenerationHelpers.combineClips(clips, this.fileNameId).then(async (response) => {
            return {video: response};
        }).catch(err => {
            console.log(err);
        });
    }

    async generateClip(title, text, index, images) {
        //generate frames and audio
        //return the output file
        let bodyStyles = `
            background-color: white;
            width: 500px;
            height: 500px;
        `
        console.log(images[0]);
        let html = `<!DOCTYPE html>
        <html>
        <head>
        <meta charset="utf-8">
        <title>${title}</title>
        </head>
        <body style="${bodyStyles}">
        <img src="${images[0]}" />
        <h1>${title}</h1>
        <p>${text}</p>
        </body>
        </html>`;
        let framePath = await super.generateFrames(text, html, index).then(async (response) => {
            return response;
        }).catch(err => {
            console.log(err);
        });
        let audioPath = await super.generateAudio(text, index).then(async (response) => {
            console.log('audio', response);
            return response;
        }).catch(err => {
            return err;
        });
        return await super.generateClip(index, framePath, audioPath).then(async (response) => {
            return response;
        }).catch(err => {
            return err
        });
    }

    
}
class Test extends ContentOverStockClip {
    constructor(prompt, writingStyle, numOfClips) {
        super(prompt, writingStyle, numOfClips);
    }

    async beginGeneration() {
        //create html frames and audio
        //then combine them into a video
        let frames = [];
        let audio = [];
        const output = path.join(os.tmpdir(), path.basename(this.fileNameId+'mergedout.mp4'));
        for(let i = 0; i < this.numOfClips; i++) {
            let text = "this is a test";
            let singleFrame = await super.generateFrames(text, null, i).then(async (response) => {
                return response;
            });
            frames.push(singleFrame);
            let audioInstance = await super.generateAudio(text, i);
            audio.push(audioInstance);
        }
        //promise
        console.log(frames);
        await new Promise((resolve, reject) => {
            let ffm = new ffmpeg()
                .input(frames[0])
            for(let i = 0; i < frames.length; i++) {
                
                ffm
                    //-i
                    //loop
                    .input(frames[i])
                    .inputOptions('-loop 1')
                    .input(audio[i])
            }
            ffm
            //include output in the command
            .outputOptions('-c:v libx264 -c:a aac -b:a 192k -shortest -r 30')
            .output(output)
            .save(output);
            ffm.on('end', () => {
                resolve();
            });
            ffm.on('error', (err) => {
                reject(err);
            });
        }).then(() => {
            console.log('done');
        }).catch(err => {
            console.log(err);
        });
        return {video: output};  
    }
}
class StockClipAndAudio extends GenerationMethod {
    constructor(prompt, writingStyle, numOfClips) {
        super(prompt, writingStyle, numOfClips);
    }
}
class ArticleToVideo extends StockClipAndAudio {
    constructor(prompt, writingStyle, numOfClips) {
        super(prompt, writingStyle, numOfClips);
    }

    async beginGeneration() {
        //the prompt is the article url
        //scrape the article
        let article = await GenerationHelpers.scrapeArticle(this.prompt);
        let text = await GenerationHelpers.summarizeText(article);
        let clips = [];
        //divide text into three parts in an array
        let textArray = GenerationHelpers.maxText(text,150);
        console.log(textArray);
        //for each segment, generate a clip
        for(let i = 0; i < this.numOfClips; i++) {
            for(let j = 0; j < textArray.length; j++) {
                
                let frame = await super.generateFrames(textArray[j], null, 0);
                let audio = await super.generateAudio(textArray[j], 0);
                let singleClip = await this.generateClip((j+i), frame,audio).then(async (response) => {
                    return response;
                }).catch(err => {
                    console.log(err);
                });
                clips.push(singleClip);
            }
        }
        return await GenerationHelpers.combineClips(clips, this.fileNameId).then(async (response) => {
            return {video: response};
        }).catch(err => {
            console.log(err);
        });
    }
}
class AskReddit extends GenerationMethod {
    constructor(prompt, writingStyle, numOfClips, params) {
        super(prompt, writingStyle, numOfClips);
        this.numComments = params.numComments;
    }
    async beginGeneration() {
        //we will get a post from the ask reddit subreddit. We will also look at it's comments and get a random comment.
        //first we will create a frame for the main post.
        //Then we will create frames for the first 10 comments.
        //use the generation helpers to create the frames
        let post = await this.getRedditPostWithMostComments();
        //get the posts text
        let postText = post.title + ' ' + post.selftext;
        let postFrame = await this.generateFrames(postText, null, 0);
        let postAudio = await this.generateAudio(postText, 0);
        //generate clip for the post frame
        let postClip = await this.generateClip(0,postFrame,postAudio);
        let comments = await GenerationHelpers.getCommentsFromPost(post);
        let commentClips = [];
        //numcomments or comments.length, whichever is smaller
        let numComments = this.numComments > comments.length ? comments.length - 1 : this.numComments;
        for (let i = 0; i < numComments; i++) {
            let comment = comments[i];
            let commentText = comment.data.body;
            let commentFrame = await this.generateFrames(commentText, null, 0);
            let commentAudio = await this.generateAudio(commentText, 0);
            let commentClip = await this.generateClip(i+1,commentFrame,commentAudio);
            commentClips.push(commentClip);
            //push the static clip to the array
            //statictrim.mp4
        }

        let clips = [postClip];
        clips = clips.concat(commentClips);
        console.log(clips);
        let combinedClips = await GenerationHelpers.combineClips(clips, this.fileNameId);
        //overlay the new clip over a stock video
        //get stock video
        let stockVideo = await GenerationHelpers.getStockVideo(postText);
        let outputPath = path.join(os.tmpdir(), path.basename(this.fileNameId+'mergedout.mp4'));
        let final = await this.overlayVideo(stockVideo,combinedClips, outputPath);
        //add music to the final video
        //music is located at ../music/Monkeys-spinning-monkeys.mp3
        //get the music location as the full path
        let musicPath = path.join(__dirname, '../music/Monkeys-spinning-monkeys.mp3');
        //add music to the final video
        let finalWithMusic = await this.addMusic(final, musicPath);
        //create promise
        return finalWithMusic;
    }
    async overlayVideo(backgroundPath, forgroundPath, outputPath) {
        return new Promise((resolve,reject)=>{
            //shorten background to match forground
                 ffmpeg()
                     //loop background
                     .input(forgroundPath)
                     .inputOptions('-stream_loop -1')
                     .inputOptions('-i '+backgroundPath)
                        .complexFilter([
                            '[0:v]setpts=PTS-STARTPTS[bg]',
                            '[bg]scale=1920:1080[bg2]',
                            '[1:v]scale=800:400[fg]',
                            '[bg2]pad=1920:1080[0padded]',
                            //center the foreground
                            //center the foreground
                            '[fg]pad=800:400:x=(ow-iw)/2:y=(oh-ih)/2[fg2]',
                            '[1:a]amix=inputs=1',
                            '[0padded][fg2]overlay=(W-w)/2:(H-h)/2:shortest=1[output]'
                        ])
                       .outputOptions([
                         '-map [output]',
                         '-shortest',
                       ])
                       .output(outputPath)
                       .on("error",function(er){
                         reject(er);
                         console.log("error occured: "+er.message);
                       })
                       .on("end",function(){
                         resolve(outputPath);
                       })
                       .run();
         }).then((outputPath) => {
             //upload to bucket
             console.log(outputPath);
             return outputPath;
         });
    }

    async addMusic(videoPath, musicPath) {
        //new path is similar to video path, with suffix
        let newPath = videoPath.replace('.mp4', '_music.mp4');
        return new Promise((resolve,reject)=>{
            ffmpeg()
            .input(videoPath)
            .input(musicPath)
            .complexFilter([
                '[1:a]volume=0.2[music]',
                '[0:a][music]amix=inputs=2[out]',

            ])
            .outputOptions([
                '-map [out]',
                '-shortest',
                '-map 0:v'
            ])
            .output(newPath)
            .on("error",function(er){
                reject(er);
                console.log("error occured: "+er.message);
            })
            .on("end",function(){
                resolve(newPath);
            })
            .run();
        }).then((newPath) => {
            return newPath;
        });
    }

    async getRedditPostWithMostComments() {
        //get reddit posts from ask reddit with our prompt. Find the post with the most comments.
        //return the post
        return new Promise((resolve,reject)=>{
           //fetch from ask reddit with search term of prompt
              let url = 'https://www.reddit.com/r/AskReddit/search.json?q='+this.prompt+'&restrict_sr=on&sort=relevance&t=all';
              //find the post with the most comments
                //loop through each post to find the one with the most comments
                //return the post
                //use fetch
                fetch(url)
                .then(response => response.json())
                .then(json => {
                    let posts = json.data.children;
                    let postWithMostComments = posts[0];
                    for (let i = 0; i < posts.length; i++) {
                        let post = posts[i];
                        if (post.data.num_comments > postWithMostComments.data.num_comments) {
                            postWithMostComments = post;
                        }
                    }
                    resolve(postWithMostComments.data);
                })
                .catch(err => {
                    reject(err);
                }
            );
        });
        
    }
}

class FakeAskReddit extends AskReddit {
    async beginGeneration() {
        //for numofclips
        let posts = await GenerationHelpers.getRedditPosts(this.prompt);
        //console.log(posts[4]);
        let length = posts.length<this.numOfClips?posts.length:this.numOfClips;
        console.log(length);
        let allClips = await this.generateClips(posts, length);
        //combine all clips
        let finalVideo = await GenerationHelpers.combineClipsFfmpeg(allClips, this.fileNameId+"final");
        //return the final video
        return {video: finalVideo, title: title};
    }
    
    async generateClips(posts, length) {
        let allClips = [];
        let title = '';
        
        let statictrim = path.join(__dirname, path.basename('static3.mp4'));
                
        let blackClip = await GenerationHelpers.blackClip();
        let finalStaticClip = await this.overlayVideo(statictrim, blackClip, this.fileNameId+'clip.mp4');
        for(let i = 0; i < length ; i++) {
            //get a post
            //parse the post
            let post = posts[i].data;
            //create the first clip. The first clip is just the question/post title+selftext
            let firstFrame = await this.generateFrames(post.title+post.selftext, null, i);
            let firstAudio = await this.generateAudio(post.title, i);
            let firstClip = await this.generateClip(i,firstFrame,firstAudio);
            let clips = []
            for(let k = 0; k < this.numComments; k++) {
                
                let comment = await this.generateComment(post);
            
                //split text into 30 character chunks
                let chunks = GenerationHelpers.splitText(comment, 100);
                console.log(chunks);
                //for each chunk, create a clip
                let commentClips = [];
                for (let j = 0; j < chunks.length; j++) {  
                    
                    let chunk = chunks[j];
                    let html = `<!DOCTYPE html>
                    <html>
                    <head>
                    <meta charset="utf-8">
                    <title>${this.prompt}</title>
                    </head>
                    <body style="height:250px; width: 500px; background: black;">
                    <h1 style="color:white">${await GenerationHelpers.getTitleSummary(post.title+post.selftext)}</h1>
                    <img src="https://i.imgur.com/FH8M8Zf.png" style="height:50px; width:50px;float: left;"">
                    <p style="float: left; color: white">${chunk}</p>
                    </body>
                    </html>`
                    let commentFrame = await this.generateFrames(chunk, html, i+","+j+","+k);
                    let commentAudio = await this.generateAudio(chunk, i+","+j+k);
                    let commentClip = await this.generateClip("commentClip"+i+","+j+","+k,commentFrame,commentAudio);
                    //overlay
                    
                    commentClips.push(commentClip);
                }
                //combine comment clips
                //add to final video
                let combined = await GenerationHelpers.combineClips(commentClips, this.fileNameId+"comentsMerged"+i+","+k);
                let outputPath = path.join(os.tmpdir(), path.basename(this.fileNameId+i+","+k+'commentsOverlayed.mp4'));
                    
                let stockVideo = await GenerationHelpers.getStockVideo(post.title);
                let finalClip = await this.overlayVideo(stockVideo, combined, outputPath);
                clips.push(finalClip);
                //push statictri
                clips.push(finalStaticClip);
            }
        
            // clips.push(statictrim);
            //concat the clips
            let combinedClips = await GenerationHelpers.combineClipsFfmpeg(clips, this.fileNameId+"combined"+i);
            //overlay the new clip over a stock video
            //get stock video
            //add music to the final video
            
            //get the music location as the full path
            let musicPath = path.join(__dirname, '../music/Monkeys-spinning-monkeys.mp3');
            //add music to the final video
            let finalWithMusic = await this.addMusic(combinedClips, musicPath);
            title = await GenerationHelpers.getTitleSummary(post.title+post.selftext);
            allClips.push(finalWithMusic);
        }
        return allClips;
    }
    async generateComment(post) {
        //get the title and self text. This will be the question.
        //get the comment text for the first 5 comments. If there are less than 5 comments, get the comment text for all comments.
        //the comments will be example answers.
        //use GPT-3 to create a new answer
        //return the answer
        //post is a reddit post object
        let question = "question: " + post.title + '\n' + post.selftext;
        let comments = await GenerationHelpers.getCommentsFromPost(post);
        let finalText = question + "\n" + "new answer: ";
        //run through gpt-3
        let answer = await GenerationHelpers.fetchGpt3Api(finalText).then(json => {
           console.log(json);
            return json;
        });
        
        return answer;
    }
}

exports.GenerationMethod = GenerationMethod;
exports.GenerationHelpers = GenerationHelpers;