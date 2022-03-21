//dependencies and constants
const fetch = require('node-fetch');
const os = require('os');
const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
ffmpeg.setFfmpegPath(ffmpegPath);
const textToSpeech = require('@google-cloud/text-to-speech');
const {uploadVideo} = require('./upload-youtube');
//we are going to be uploading the audio and frames to the bucket
const {Storage} = require('@google-cloud/storage');
//node-html-to-image
const htmlToImage = require('node-html-to-image');
const storage = new Storage();
//default bucket
const bucketName = 'gs://default-bucket/';
const bucket = storage.bucket(bucketName);
const keyfile = require('./the-rvg-736433cba82e.json');


//-----end of dependencies and constants
//-----begin of helper functions

//generates a string response predicting the next tokens after the prompt
async function fetchGpt3Api(prompt, repeatNum = 1) {
    const engine = "curie-instruct-beta-v2";
    const gpt3_endpoint = 'https://api.openai.com/v1/engines/'+engine+'/completions';
    const gpt3_token = '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';

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
            "max_tokens": 100,
            "stop": "\n/"
        })
    });
    let json = await res.json();
    let returnString = json.choices[0].text;
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

}

async function getRedditPost(prompt) {
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
}

async function getStockVideo(prompt) {1
    //pexels api using api key 563492ad6f917000010000011f9c74fdfd2840b18273ad42b78c5bd6
    const pexels_endpoint = 'https://api.pexels.com/videos/search?query='+prompt+'&per_page=1&page=1';
    const pexels_api_key = '563492ad6f917000010000011f9c74fdfd2840b18273ad42b78c5bd6';
    let res = await fetch(pexels_endpoint, {
        headers: {
            'Authorization': 'Bearer '+pexels_api_key
        }
    });
    let json = await res.json();
    //create a temp file to store the video
    let tempFile = path.join(os.tmpdir(), 'stock.mp4');
    //download the video
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
    
    async beginGeneration() {
        let clips = [];
        for (let i = 0; i < this.numOfClips; i++) {
            let title = await this.generateQuestion();
            let text = await this.generateText(title, this.writingStyle);
            let clip = await this.createDefaultClip(title, text, i);
            clips.push(clip);
        }
        //
        return await this.compileClips(clips);
    }

    async createNewClip(title="0", text="", clipNum=0) {
        console.log(title);
        await this.generateAudio(text).then(console.log("Audio generated"));
        await this.generateFrames(text).then(console.log("Frames generated"));
        let clip = await this.generateVClip(clipNum).then((clip)=>{console.log("Clip generated", clip); return clip;});
        //await uploadVideo(this.prompt, this.writingStyle).then(console.log("Video uploaded"));
        return clip;
    }

    async compileClips(clips) {
        'use strict';
        //use video stitch to combine the clips
        let videoStitch = require('video-stitch');
        //map each clip to {'fileName': clip}
        let clipsMap = clips.map((clip)=>{
            return {'fileName': clip};
        });
        console.log(clipsMap);
        let videoConcat = videoStitch.concat;
        const metadata = {
            contentType: 'video/mp4',
          };
          
        const outputFilePath = path.join(os.tmpdir(), path.basename(this.fileNameId+'output.mp4'));
        console.log(outputFilePath);
        return await videoConcat({
            silent: true, // optional. if set to false, gives detailed output on console
            overwrite: false, // optional. by default, if file already exists, ffmpeg will ask for overwriting in console and that pause the process. if set to true, it will force overwriting. if set to false it will prevent overwriting.
            ffmpeg_path: ffmpegPath
          })
          .clips(clipsMap)
            .output(outputFilePath)
            .concat().then(() => {
                return outputFilePath;
            }).catch((err) => {
                console.log(err);
            });

    }


    //this will generate a question based on the prompt and writing style using GPT-3
    async generateQuestion() {
        let questionifyString = `come up with a question regarding the following prompt:  
        \n prompt:   
        ${this.prompt}  
        \n The question should be structured based on the writing style(just structure, no content.): 
        \n  ${this.writingStyle}
        \n \n new question:`;

        
        return await fetchGpt3Api(questionifyString).then(response => {
            console.log(response);
            //do response.text
            return response + "?";
        });
    }

    generateText(question, writingStyle) {
        let promptString = `create a response in the following writing style in brackets:[${writingStyle}]
        \n to the following question:${question}`;
        return fetchGpt3Api(promptString).then(response => {
            console.log(response);
            //do response.text
            return response;
        });
    }

    async generateAudio(text) {
        //using google text to speech
        const client = new textToSpeech.TextToSpeechClient({
            projectId: keyfile.project_id,
            keyFilename: require.resolve('./the-rvg-736433cba82e.json')
        });
        const input = {text: text};
        const voice = {
            languageCode: 'en-US',
            name: 'en-US-Wavenet-F',
            ssmlGender: 'female'
        };
        const audioConfig = {audioEncoding: 'MP3'};
        const request = {input: input, voice: voice, audioConfig: audioConfig};
        //save to buffer and upload to bucket
        return await client.synthesizeSpeech(request).then(async (response) => {
            const audioContent = response[0].audioContent;
            const audioFile = path.join(os.tmpdir(), path.basename(this.fileNameId + '.mp3'));
            return await fs.writeFile(audioFile, audioContent, 'binary', async (err) => {
                if (err) {
                    console.log(err);
                    return;
                }
                await bucket.upload(audioFile, {
                    destination: this.fileNameId + '.mp3',
                    public: true
                });
                console.log("Audio uploaded");
                return audioFile;
            });
        });

    }

    async generateFrames(text, html=null) {
        html==null?html=`<!DOCTYPE html>
        <html>
        <head>
        <meta charset="utf-8">
        <title>${this.prompt}</title>
        </head>
        <body style="height:250px; width: 250px">
        <h1>${this.prompt}</h1>
        <p>${text}</p>
        </body>
        </html>`:html=html;
        //save to buffer and upload to bucket
        await htmlToImage({html: html}).then(async (buffer) => {
            let file = bucket.file(this.fileNameId + '.png');
            await file.save(buffer);
            bucket.file(this.fileNameId + '.png');
            return file;
        }).catch(err => {
            console.log(err);
        });
        return 'generated frames';
    }

    async generateVClip(clipNum=0) {
        //get audio and frames from bucket
        //concatenate audio and frames
        //upload to bucket
        //use ffmpeg to concatenate audio and frames
        //save to temp path
        console.log(this.fileNameId);
        const audioFile = path.join(os.tmpdir(), path.basename(this.fileNameId+'.mp3'));
        const framesFile = path.join(os.tmpdir(), path.basename(this.fileNameId+'.png'));
        const outputFile = path.join(os.tmpdir(), path.basename(this.fileNameId+clipNum+'.mp4'));
        console.log(outputFile);
        let audio = bucket.file(this.fileNameId+'.mp3');
        let frames = bucket.file(this.fileNameId + '.png');
        //let output = bucket.file(this.fileNameId+'.mp4');
        return await audio.download({destination: audioFile, validation:false}).then(async () => {
            return await frames.download({destination: framesFile, validation:false}).then(async () => {

                //concatenate audio and frames
                return await new Promise((resolve,reject)=>{
                    ffmpeg()
                        //stream loop input option that loops the frame file for as long as the audio file is playing
                        
                        .input(framesFile)
                        .inputOption('-stream_loop 10')
                        .input(audioFile)
                        //display the frame file for the full duration of the video
                        .output(outputFile)
                        //-fflags +shortest -max_interleave_delta 100M 
                        .outputOption('-fflags +shortest')
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
                }).then(() => {
                    //upload to bucket
                    console.log(outputFile);
                    return outputFile;
                });
            }).catch(err => {
                console.log(err);
            });
        }).catch(err => {
            console.log(err);
        });

    }

    static methodSwitch(method, params) {
        let {prompt, writingStyle, numOfClips} = params;
        //will switch between the different sub classes of GenerationMethod
        switch (method) {
            default:
                return new GenerationMethod(prompt, writingStyle, numOfClips);
            case null:
                return new GenerationMethod(prompt, writingStyle, numOfClips);
            case "fakereddit":
                return new FakeReddit(prompt, writingStyle, numOfClips);
            case "technews":
                return new TechNews(prompt, writingStyle, numOfClips);
            // case "r-prompt":
            //     return new RPrompt(prompt, writingStyle);
            // case "tech-news":
            //     return new TechNews(prompt, writingStyle);
            // case "fake-r-prompt":
            //     return new FakeRPrompt(prompt, writingStyle);
        }
    }
}

//export


class FakeReddit extends GenerationMethod {
    constructor(prompt, writingStyle) {
        super(prompt, writingStyle);
    }
    async beginGeneration() {
        return await getRedditPost(this.prompt).then(async(response) => {
            //generate frames and audio
            let {title, selftext} = response.data;
            console.log(title, selftext);
            console.log(response.data);
            await this.generateFrames(title, selftext);
            await this.generateAudio(title + selftext);
            await this.generateVClip(0);
            return response;
        }).catch(err => {
            console.log(err);
        });
    }
    async generateFrames(title, text) {
        let html = `<!DOCTYPE html>
        <html>
        <head>
        <meta charset="utf-8">
        <title>${title}</title>
        </head>
        <body>
        <h1>${title}</h1>
        <p>${text}</p>
        </body>
        </html>`;
        return await super.generateFrames(text, html);    
    }

}

class TechNews extends GenerationMethod {
    constructor(prompt, writingStyle, numOfClips) {
        super(prompt, writingStyle, numOfClips);
    }
    async beginGeneration() {
        return await this.fetchNews().then(async (response) => {
            return await this.createNewClip(response.articles[3], 0).then(async (response) => {
                console.log(response);
                return response;
            });
        }).catch(err => {
            console.log(err);
        });
    }

    async createNewClip(article, clipNum=0) {
        let {title, description, url,content} = article;
        //log the keywords 
        console.log(this.getKeywords(content));
        //get getStockVideos
        let stockLocalPath = await getStockVideo(title).then(async (response) => {
            //log response
            console.log('stcplk',response);
            return response;
        }).catch(err => {
            console.log(err);
        });
        let contentClipLocalPath = await super.createNewClip(title, content, 0).then( (response) => {
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
        let newPath = await this.overlayVideo(stockLocalPath, contentClipLocalPath).then( (response) => {
            console.log(response);
            return response;
        }).catch(err => {
            console.log(err);
        });
        return newPath;
    }

    async fetchNews(prompt) {
        let apiKey = 'd11ce1b3360549228a2df9e43bd2442e';
        let url = `https://newsapi.org/v2/top-headlines?country=us&category=technology&apiKey=${apiKey}`
        console.log(url);
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
        let prePrompt = 'List a handful of keywords that best describe the article.';
        return fetchGpt3Api(prePrompt+text).then(async (response) => {
            console.log(response);
            return response;
        }).catch(err => {
            console.log(err);
        });
    }

    async overlayVideo(backgroundPath, forgroundPath) {
        //overlay the forground video on the background video
        //return the output file

        return new Promise((resolve,reject)=>{
            //center the forground video
            const outputFile = path.join(os.tmpdir(), path.basename(this.fileNameId+'merged.mp4'));
            console.log(backgroundPath, forgroundPath, outputFile);
            //the audio from the forground video instead
            //create a new video that will output to the outputFile. The video is the forground video overlayed on the background video.
            //the forground video is centered on the background video
            ffmpeg()
                .addOption('-i', backgroundPath)
                .addOption('-i', forgroundPath)
                //complex filter that makes sure the audio comes from the forground video and that the forground video is centered on the background video
                .addOption('-filter_complex', `[1:a]acopy;[0:v][1:v]overlay=main_w/2-overlay_w/2:main_h/2-overlay_h/2`)
                .output(outputFile)
                .on('end', () => {
                    resolve(outputFile);
                })
                .on('error', (err) => {
                    reject(err);
                })
                .run();

        }).then((outputFile) => {
            //upload to bucket
            console.log(outputFile);
            return outputFile;
        }).catch(err => {
            console.log(err);
        });
    }
}
exports.GenerationMethod = GenerationMethod;