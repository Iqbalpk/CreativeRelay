import {Input,ALL_FORMATS,BlobSource,Output,Mp4OutputFormat,BufferTarget,Conversion,Quality} from 'mediabunny';
import {VIDEO_PUBLISH_LIMIT,VIDEO_SOURCE_LIMIT,videoPlan} from './video-policy.js';

// Runs entirely on the user's device. Source bytes are read in small ranges;
// no original is sent to a conversion service and no source file is overwritten.
export async function prepareVideo(file,{onProgress=()=>{},signal}={}) {
 if(!file.size||file.size>VIDEO_SOURCE_LIMIT)throw Error('Choose a video up to 500 MB.');
 const input=new Input({formats:ALL_FORMATS,source:new BlobSource(file,{maxCacheSize:3*1024*1024})});
 let conversion;
 const abort=()=>{void conversion?.cancel().catch(()=>{});};
 try{
  signal?.throwIfAborted();
  const video=await input.getPrimaryVideoTrack(),audio=await input.getPrimaryAudioTrack();
  if(!video)throw Error('This file does not contain a readable video track.');
  const [duration,width,height,codec,audioCodec]=await Promise.all([input.computeDuration(),video.getDisplayWidth(),video.getDisplayHeight(),video.getCodec(),audio?.getCodec()]);
  const compatible=codec==='avc'&&(!audio||audioCodec==='aac')&&file.size<=VIDEO_PUBLISH_LIMIT&&Math.max(width,height)<=1920&&Math.min(width,height)<=1080;
  const plan=compatible?null:videoPlan(duration,width,height);
  signal?.addEventListener('abort',abort,{once:true});
  const target=new BufferTarget();
  const output=new Output({format:new Mp4OutputFormat({fastStart:'in-memory'}),target});
  conversion=await Conversion.init({input,output,tracks:'primary',tags:{},
   video:compatible?{codec:'avc'}:{codec:'avc',width:plan.width,height:plan.height,fit:'fill',frameRate:plan.frameRate,quality:new Quality({bitrate:plan.bitrate}),forceTranscode:true,allowTransformationMetadata:false},
   audio:audio?(compatible?{codec:'aac'}:{codec:'aac',numberOfChannels:2,sampleRate:48000,quality:new Quality({bitrate:plan.audioBitrate})}):undefined,
  });
  if(!conversion.isValid||conversion.discardedTracks.some(item=>item.track===video||item.track===audio)){
   await conversion.cancel();
   throw Error('Your browser cannot convert this video with its sound intact. Nothing was uploaded and your previous artwork is unchanged.');
  }
  signal?.throwIfAborted();
  conversion.onProgress=value=>onProgress(Math.min(99,Math.round(value*100)));
  await conversion.execute();
  signal?.throwIfAborted();
  if(!target.buffer?.byteLength||target.buffer.byteLength>VIDEO_PUBLISH_LIMIT)throw Error('The prepared copy still exceeds the publishing limit. Nothing was uploaded; your original is unchanged.');
  const result=new File([target.buffer],(file.name||'video').replace(/\.[^.]+$/,'')+'-upload.mp4',{type:'video/mp4'});
  onProgress(100);
  return {file:result,converted:!compatible,duration,width:plan?.width||width,height:plan?.height||height,frameRate:plan?.frameRate};
 }finally{signal?.removeEventListener('abort',abort);if(conversion&&conversion.state!=='done'&&conversion.state!=='canceled')await conversion.cancel().catch(()=>{});input.dispose();}
}
