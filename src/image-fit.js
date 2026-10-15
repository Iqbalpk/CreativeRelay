// Input artwork has no aspect-ratio restriction. This conservative output
// window is used only for Instagram API copies, never as an upload gate.
export const INSTAGRAM_IMAGE_POLICY={minRatio:4/5,maxRatio:1.91,width:1080};
export function fitGeometry(sourceWidth,sourceHeight,targetRatio,policy=INSTAGRAM_IMAGE_POLICY){
 if(!Number.isFinite(sourceWidth)||!Number.isFinite(sourceHeight)||sourceWidth<=0||sourceHeight<=0)throw Error('Could not read image dimensions.');
 const ratio=Math.max(policy.minRatio,Math.min(policy.maxRatio,targetRatio||sourceWidth/sourceHeight));
 const width=policy.width,height=Math.min(Math.floor(width/policy.minRatio),Math.max(Math.ceil(width/policy.maxRatio),Math.round(width/ratio))),scale=Math.min(width/sourceWidth,height/sourceHeight);
 const drawWidth=sourceWidth*scale,drawHeight=sourceHeight*scale;
 return {width,height,x:(width-drawWidth)/2,y:(height-drawHeight)/2,drawWidth,drawHeight,padded:Math.abs(drawWidth-width)>1||Math.abs(drawHeight-height)>1};
}
