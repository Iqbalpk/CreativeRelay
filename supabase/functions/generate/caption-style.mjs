// Caption preference: relevant terms belong in prose, never a hashtag/keyword appendix.
export function cleanGeneratedText(value){
 return String(value||'').split('\n').filter(line=>{
  const text=line.trim();
  return !/^(?:keywords?(?: for reach)?|search keywords|hashtags|tags)\s*:/i.test(text)&&!/^(?:#[\p{L}\p{N}_]+[\s,;]*)+$/u.test(text);
 }).join('\n').replace(/(^|[^\p{L}\p{N}_/#])#([\p{L}\p{N}_]+)/gu,(_,prefix,word)=>prefix+word.replace(/_/g,' ').replace(/([a-z])([A-Z])/g,'$1 $2')).replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
}
