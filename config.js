module.exports =  {
    pathSpecificConfig:{},

    //Entry point of your SPA
    appIndex:'/app/index.html',
    
    //URL path to client SDK
    routeClientSDK:'/clientSDK.js',
    
    //Path to key and cert for SSL
    ssl:{
        key:'',
        cert:''
    },

    port:3005,
    cacheDirectory: '/cache', //default cache
    cacheAgeLimit: 3600, //default 3600 seconds
    cache:true, //default true
     
    staticPagePath:'/static_pages',
    
    puppeteerArgs:{
        args: [ 
            '--no-sandbox',
            '--no-zygote',
            '--single-process'
        ]
    },   

    //Milisecond time limit to render page
    navigationTimeout:30, //Default 30 seconds
    
    //Control for user agents
    allowOnlyUserAgents:[],
    disallowUserAgents:[]
}