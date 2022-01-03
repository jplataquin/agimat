if(typeof window.isBot == 'undefined'){
    window.isBot = ()=>{
        return false;
    }
}

if(typeof window.sceneReady == 'undefined'){
    window.sceneReady = ()=>{};
}

if(typeof window.setSceneCount == 'undefined'){
    window.setSceneCount = ()=>{};
}

if(typeof window.useTemplate == 'undefined'){
    window.useTemplate = ()=>{};
}