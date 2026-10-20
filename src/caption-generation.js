export function captionTargets(selected,active,available){
 return [...new Set([...selected,active].filter(platform=>available.includes(platform)))];
}
export function generatedChanges(data,targets,fitCaption){
 const captions={},titles={};
 for(const platform of targets){const key=platform==='Threads'?'X':platform,value=data?.captions?.[key];
  if(typeof value!=='string'||!value.trim())throw Error('Gemini did not return a new '+platform+' caption. Try generating again.');
  captions[platform]=platform==='Threads'?fitCaption(value,'Threads').text:value;
  const title=data?.titles?.[key];if(typeof title==='string'&&title.trim())titles[platform]=title;
 }
 return {captions,titles};
}
