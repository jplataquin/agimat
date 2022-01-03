const cron      = require('node-cron');
const fg        = require('fast-glob');
const moment    = require('moment');
const path      = require('path');
const bunyan    = require('bunyan');
const fs 	    = require('fs');

let config      = require('./config.js');

config['cacheAgeLimit'] = (typeof config['cacheAgeLimit'] == 'undefined') ? 3600 : config['cacheAgeLimit'];

config.cacheAgeLimit = parseInt(config.cacheAgeLimit);

const cronLog = bunyan.createLogger({
    name: 'app',
    streams: [
        {
            stream: process.stdout
        },
        {
            path: path.join(__dirname,'/logs/cron.log')
        }
    ]
});

//html cache clean up
let task = cron.schedule('* * * * * *', async () => {

    cronLog.info('Cron Start: Clean up cache @'+moment.unix(currentTime).format("YYYY-MM-DD HH:mm:ss"));
    
    let files; 
    
    try{
        files = await fg(path.join(__dirname,config.cacheDirectory+'/pages/*_*'+'.html'));
    }catch(err){
        cronLog.error({err:err},'Cron Error: Unable to read cache directory '+path.join(__dirname,config.cacheDirectory+'/pages/'));
        return false;
    }

    if(!files.length){
        return false;
    }

    let currentTime = moment().unix();

    for(let i = 0; i <= files.length - 1;i++){

        let file = files[i];

        let time = file.split('_')[1].split('.')[0];
        
        let diff = currentTime - time;
        
        console.log(diff,config.cacheAgeLimit);

        if(diff > config.cacheAgeLimit){
           
            fs.unlink(files[i], (err) => {
                if (err){
                    cronLog.error({err:err},'Cron Error: Unable to delete cache '+files[i]);
                    return false;
                }//if
            });//()=>{}

        }//if

    }//for

    cronLog.info('Cron End: Clean up cache @'+moment.unix(currentTime).format("YYYY-MM-DD HH:mm:ss"));
});

task.start();

cronLog.info('Cron Jobs Initated @'+moment().format("YYYY-MM-DD HH:mm:ss"));