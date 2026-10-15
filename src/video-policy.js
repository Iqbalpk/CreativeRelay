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
 if(bitrate<600000)throw Error('This video is too long to prepare clearly within the current publishing limit. Your original has not changed.');
 const scale=Math.min(1,1920/Math.max(width,height),1080/Math.min(width,height));
 return {bitrate,audioBitrate,width:Math.max(2,Math.round(width*scale/2)*2),height:Math.max(2,Math.round(height*scale/2)*2)};
}
export function preparedVideoNote(source,output,converted) {
 const mb=bytes=>(bytes/1024/1024).toFixed(1)+' MB';
 return `${converted?'Prepared':'Ready'} MP4 upload copy · ${mb(source.size)} original → ${mb(output.size)} upload. Preview this copy before publishing. Your original in Photos is unchanged.`;
}
