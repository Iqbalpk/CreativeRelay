// Publishing requests currently carry at most 12 MiB of media.
export const VIDEO_PUBLISH_LIMIT = 12 * 1024 * 1024;
export const VIDEO_SOURCE_LIMIT = 500 * 1024 * 1024;
export function isVideoFile(file) {
 return !!file && (file.type?.startsWith('video/') || /\.(mov|mp4|m4v)$/i.test(file.name || ''));
}
export function videoPlan(duration, width, height) {
 if (![duration,width,height].every(value=>Number.isFinite(value)&&value>0))throw Error('Could not read this video’s duration or dimensions.');
 const audioBitrate=128000;
 // Leave room for audio, container overhead and encoder bitrate variation.
 const bitrate=Math.min(5000000,Math.floor(10*1024*1024*8*.88/duration)-audioBitrate);
 if(bitrate<320000)throw Error('This video is too long to prepare clearly within the current publishing limit. Your original has not changed.');
 // Longer clips need fewer pixels per frame, rather than rejection at the HD bitrate floor.
 const shortEdge=bitrate>=1800000?1080:bitrate>=850000?720:540;
 const longEdge=Math.round(shortEdge*16/9),frameRate=bitrate>=850000?30:24;
 const scale=Math.min(1,longEdge/Math.max(width,height),shortEdge/Math.min(width,height));
 return {bitrate,audioBitrate,frameRate,width:Math.max(2,Math.round(width*scale/2)*2),height:Math.max(2,Math.round(height*scale/2)*2)};
}
export function preparedVideoNote(source,output,converted,details={}) {
 const mb=bytes=>(bytes/1024/1024).toFixed(1)+' MB';
 return `${converted?'Prepared':'Ready'} MP4 upload copy · ${mb(source.size)} original → ${mb(output.size)} upload${details.width&&details.height?' · '+details.width+' × '+details.height+(details.frameRate?' / '+details.frameRate+' fps':''):''}. Preview this copy before publishing. Your original in Photos is unchanged.`;
}
