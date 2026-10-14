export function uploadKind(draft, mediaType='') {
 if(draft.mode==='Carousel'||draft.postFormat==='Carousel')return 'Carousel';
 if(draft.mode==='Blog')return 'Blog';
 return draft.workType||(mediaType.startsWith('video/')?'Video':'Photo');
}
export function composerPlatforms(kind){
 return kind==='Carousel'?['LinkedIn','Instagram','Facebook']:kind==='Blog'?['LinkedIn','Facebook','Blog']:['LinkedIn','Instagram','Facebook','Threads'];
}
// Older blog drafts can have their only cover in the thumbnail field.
export function artworkSlot(draft,mediaType,hasMedia,hasThumb){
 const kind=uploadKind(draft,mediaType);
 if(kind==='Carousel')return null;
 if(kind==='Blog'){
  if(draft.blogCoverSource!=='media'&&hasThumb)return 'thumb';
  return hasMedia&&mediaType.startsWith('image/')?'media':null;
 }
 return hasMedia&&mediaType.startsWith(kind==='Video'?'video/':'image/')?'media':null;
}
export function acceptsUpload(kind,mimeType,cover=false){return cover||kind==='Blog'||kind==='Photo'?mimeType.startsWith('image/'):kind==='Video'?mimeType.startsWith('video/'):false;}
