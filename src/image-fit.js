// Resize the original frame without imposing a platform aspect ratio.
// Never add margins or crop artwork to make an API accept it.
export function originalGeometry(sourceWidth,sourceHeight,maxSide=1440){
 if(!Number.isFinite(sourceWidth)||!Number.isFinite(sourceHeight)||sourceWidth<=0||sourceHeight<=0)throw Error('Could not read image dimensions.');
 const scale=Math.min(1,maxSide/Math.max(sourceWidth,sourceHeight));
 const width=Math.max(1,Math.round(sourceWidth*scale)),height=Math.max(1,Math.round(sourceHeight*scale));
 return {width,height,x:0,y:0,drawWidth:width,drawHeight:height,padded:false};
}
