const express   = require('express');
const path      = require('path');
const puppeteer = require('puppeteer');
const crawlers  = require('./user-agents.json');
const Mustache  = require('mustache');

const fg        = require('fast-glob');
const moment    = require('moment');

const bunyan    = require('bunyan');
const fs 	    = require('fs');
const http      = require('http');
const https     = require('https');
const crypto    = require('crypto');

let config      = require('./config.js');

const app       = express();
const port      = config.port;


/**********************************************************************************************/

const logInfo = bunyan.createLogger({
    name: 'app',
    streams: [
        {
            level: 'info',
            stream: process.stdout
        },
        {
            level:'info',
            path: path.join(__dirname,'/logs/info.log')
        }
    ]
});

const logError = bunyan.createLogger({
    name: 'app',
    streams: [
        {
            level: 'error',
            stream: process.stdout
        },
        {
            level:'error',
            path: path.join(__dirname,'/logs/error.log')
        }
    ]
});

const logTimeout = bunyan.createLogger({
    name: 'app',
    streams: [
        {
            level: 'error',
            stream: process.stdout
        },
        {
            level:'error',
            path: path.join(__dirname,'/logs/timeout.log')
        }
    ]
});

/**********************************************************************************************/
let userAgentTokens = [];

for(let key in crawlers){
    let crawler = crawlers[key];
    userAgentTokens.push(crawler.pattern);
}

let userAgentTokenLength = userAgentTokens.length-1;

/**********************************************************************************************/

function readOrFail(path,fail){
    
    let content;

    try{
       content = fs.readFileSync(path, {encoding:'utf8', flag:'r'});
    }catch(err){
        fail(err);
        return false;
    }
    
    if(!content){
        fail('No content');
        return false;
    }

    return content;
}

/**********************************************************************************************/
function resolveConfig(path){

    //Inititalize default
    let specificConfig = {};

    //Loop through path specific config options
    for(let item in config.pathSpecificConfig){

        specificConfig = config.pathSpecificConfig[item];

        item        = item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        //Replace "*" token
        item        = item.replaceAll('*','(.*)');
    
        //Replace ":num" token
        item        = item.replace(/\:num/g,'([0-9]*)');
        
        //Replace ":alpha" token
        item        = item.replace(/\:alpha/g,'([a-zA-Z]*)');

        //Replace ":alphanum" token
        item        = item.replace(/\:alphanum/g,'([a-zA-Z0-9]*)');
        
        let pattern = new RegExp('^'+item+'$','i');

        //If pattern matches a url path then end loop
        if(pattern.test(path)){
            break;
        }
    }

    //Override global config
    for(let key in specificConfig){
        config[key] = specificConfig[key];
    }
    
    //Set default
    config['cache'] = (typeof config['cache'] == 'undefined') ? true : config['cache'];
    config['cacheAgeLimit'] = (typeof config['cacheAgeLimit'] == 'undefined') ? 3600 : config['cacheAgeLimit'];
    config['cacheDirectory'] = (typeof config['cacheDirectory'] == 'undefined') ? '/cache' : config['cacheDirectory'];
    config['navigationTimeout'] = (typeof config['navigationTimeout'] == 'undefined') ? 30 : config['navigationTimeout'];
    config['allowOnlyUserAgents'] = (typeof config['allowOnlyUserAgents'] == 'undefined') ? [] : config['allowOnlyUserAgents'];
    config['disallowUserAgents'] = (typeof config['disallowUserAgents'] == 'undefined') ? [] : config['disallowUserAgents'];
    config['routeClientSDK'] = (typeof config['routeClientSDK'] == 'undefined') ? '/clientSDK.js' : config['routeClientSDK'];
    
    return config;
}

/**********************************************************************************************/
async function preRender(req,res){
   
    //Get full URL of request
    let fullUrl = req.protocol+'://'+req.get('host')+req.originalUrl;
   
    try{

        //Instantiate browser
        const browser = await puppeteer.launch(config.puppeteerArgs);
        
        //Open tab
        const page = await browser.newPage();

        //Render timeout
        let timeout  = setTimeout(() => {
            
            if(sendFlag){
                
                sendFlag = false;
                
                logTimeout.error('Page timeout: '+fullUrl);

                //Close browser
                browser.close();
                
                res.sendStatus(408); //send timeout status code
                
            }
            
        }, (config.navigationTimeout * 1000) + 5000); //add 5 seconds to account for puppetter load time

        let sceneCount = 0;
        let maxScene   = 1;
        let sendFlag   = true;

        //TODO change this to something meaningful
        await page.setUserAgent('kwak');

        //Expose helper function "isBot" to page
        await page.exposeFunction('isBot', async (callback) => {
            callback();
            return true;
        });

        //Expose helper function "setSceneCount" to page
        await page.exposeFunction('setSceneCount', async (count) => {
            maxScene = count;
        });

        //Expose helper function "sceneReady" to page
        await page.exposeFunction('sceneReady', async () => {
            sceneCount++;

            //If scene is ready and has not yet timed out
            if(sceneCount == maxScene && sendFlag){
              
                //Get content of page
                let content = await page.content();
                
                //Close timeout
                clearTimeout(timeout);

                //Close browser
                browser.close();

                sendFlag = false;

                //Serve pre rendered content
                res.set('Content-Type', 'text/html');
                res.send(Buffer.from(content));

                //Save cache file

                if(config.cache){
                    let hash = crypto.createHash('sha256').update(req.url).digest('hex');
                    let time = moment().unix();

                    let p = path.join(__dirname,config.cacheDirectory+'/pages/'+hash+'_'+time+'.html');
                    
                    fs.writeFile(p, content, err => {
                        if (err) {
                            logError.error({err:err},'Cannot write cache file: '+path.join(__dirname,config.cacheDirectory+'/pages/'+hash+'_'+time+'.html'));
                            return;
                        }

                        logInfo.info('Cache saved: '+p);
                    
                    });
                }//if
            }//if

        });//()=>{}


        //Expose helper function "useTemplate" to page
        await page.exposeFunction('useTemplate', (template,param) => {
    
            if(!sendFlag) return false;
            
            //Close timeout
            clearTimeout(timeout);

            sendFlag = false;
            param    = param ?? {};

            //Close browser
            browser.close();
            
            let p = path.join(__dirname,config.staticPagePath+'/'+template+'.html');

            let content = readOrFail(p,(err)=>{

                logError.error({err:err},'Unable to read static page: '+p);
                res.sendStatus(500);
            });

            let output;

            if(content){

                output = Mustache.render(content, param);
             
                //Serve pre rendered content
                res.set('Content-Type', 'text/html');
                res.send(Buffer.from(output));
            }
            
            //cache template
            if(config.cache && output){
                //Save cache file
                let hash = crypto.createHash('sha256').update(req.url).digest('hex');
                let time = moment().unix();

                let p = path.join(__dirname,config.cacheDirectory+'/pages/'+hash+'_'+time+'.html');
                
                fs.writeFile(p, output, err => {
                    if (err) {
                        logError.error({err:err},'Unable to write cache file: '+p);
                        return;
                    }

                    logInfo.info('Cache saved: '+p)
                
                });
            }//if
        });//()=>{}
        
        //Got to URL
        await page.goto(fullUrl,{
            waitUntil: 'networkidle2'
        });

  
    }catch(err){
     
        logError.error({err:err},'Something went wrong while doing pre rendering');

        res.sendStatus(500); //send error 500
        
    }
};

/**********************************************************************************************/
function checkUser(req){

    if(req.xhr || req.headers.accept.indexOf('json') > -1) return false;

    let userAgent = req.get('user-agent');

    //If allowOnlyUserAgents config is set
    if(config.allowOnlyUserAgents.length){
      
        for(let i = 0; i <= config.allowOnlyUserAgents.length - 1;i++){
            
            if(userAgent.match(config.allowOnlyUserAgents[i])){
                logInfo.info('Bot detected: '+userAgent);
                return false;
            }
        }

    }else{
  
        for(let i = 0; i <= userAgentTokenLength;i++){
            
            //If user agent matches and is not part of the disallowUserAgent config
            if(userAgent.match(userAgentTokens[i]) && !config.disallowUserAgents.includes(userAgentTokens[i])){
                logInfo.info('Bot detected: '+userAgent);
                return false;
            }
        }
    }
    
  
    return true;
}

/**********************************************************************************************/
async function getPageCache(req,res){

    let hash        = crypto.createHash('sha256').update(req.url).digest('hex');
    let currentTime = moment().unix();
    let files       = await fg(path.join(__dirname,config.cacheDirectory+'/pages/'+hash+'_*'+'.html'));

    if(!files.length) return false;

    for(let i = 0; i <= files.length - 1;i++){

        let file = files[i];

        let time = file.split('_')[1].split('.')[0];
        
        let diff = currentTime - time;
     
        if(diff <= config.cacheAgeLimit){
            return files[i];
        }
    }

    return false;
}
/**********************************************************************************************/

function serveClientSDK(req,res){
    let p = path.join(__dirname,'clientSDK.js');

    let content = readOrFail(p,(err)=>{
        logError.error({err:err},'Unable to read client SDK: '+p);
        res.sendStatus(500);
    });

    if(content){
        //Serve cache
        res.set('Content-Type', 'text/javascript');
        res.send(Buffer.from(content));
    }
    
}
/**********************************************************************************************/

function imageResize(){

}
/**********************************************************************************************/

app.use('/node_modules',express.static(path.join(__dirname, 'node_modules')));


app.get('*', async (req, res) => {
   
    //Resolve config
    config = resolveConfig(req.originalUrl);
    
    let urlPath = req.url.split('?')[0];
    
    if(urlPath == config.routeClientSDK){
        return serveClientSDK(req,res);
    }

    //If bot
    if(!checkUser(req)){

        //Check if a cache file exists   
        let cache = await getPageCache(req,res);
        
        if(cache && config.cache){
        
            //Read content of cache file
            let content = readOrFail(cache,(err)=>{
                logError.error({err:err},'Failed to read cache: '+cache);
                res.sendStatus(500);
            });  
            
            //Serve cache
            if(content){

                res.set('Content-Type', 'text/html');
                res.send(Buffer.from(content));
                logInfo.info('Cache served: '+cache);
                
            }
                   
            return true;
        }
        
        //Do pre render
        return preRender(req,res);
    }

    
    res.sendFile(path.join(__dirname,config.appIndex));
    
});


/******************************************
 * Run server 
 *****************************************/
if(!config.ssl.key == '' && !config.ssl.cert == ''){

    //With SSL 
    https.createServer({
        key: fs.readFileSync(config.ssl.key),
        cert: fs.readFileSync(config.ssl.cert),
    },app).listen(port, function(){
        console.log('Server running, listening at port: '+port);
        logInfo.info('Server running, listening at port: '+port);
    });

 }else{

    //Without SSL
    http.createServer({}, app).listen(port, function(){
        //ready
        console.log('Server running, listening at port: '+port);
        logInfo.info('Server running, listening at port: '+port);
    });  
 }
/***********************************************/
