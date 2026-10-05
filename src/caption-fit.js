export const captionLimits={LinkedIn:3000,Instagram:2200,Facebook:10000,X:280};
// Select an excerpt from the supplied text without adding facts or changing the saved article.
export function fitCaption(value,platform){
 const original=String(value||'').trim(),limit=captionLimits[platform];
 if(!limit||original.length<=limit)return {text:original,shortened:false};
 const suffix='',budget=limit;
 const units=original.split(/\n\s*\n|(?<=[.!?])\s+(?=[A-Z0-9])/u).map(s=>s.trim()).filter(Boolean);
 let chosen=[],used=0;
 // Keep the opening, then complete sentences/paragraphs that fit, reserving a short closing paragraph.
 const tail=units.length>2&&units.at(-1).length<=Math.min(400,budget/4)?units.at(-1):'';
 const available=budget-(tail?tail.length+2:0);
 for(const unit of tail?units.slice(0,-1):units){
  const cost=unit.length+(chosen.length?2:0);
  if(used+cost<=available){chosen.push(unit);used+=cost;}
  else if(!chosen.length){let cut=unit.slice(0,Math.max(0,available-1));if(/[\uD800-\uDBFF]$/.test(cut))cut=cut.slice(0,-1);const boundary=cut.lastIndexOf(' ');if(boundary>cut.length*0.6)cut=cut.slice(0,boundary);chosen.push(cut.trimEnd()+'…');used=chosen[0].length;}
 }
 if(tail)chosen.push(tail);
 return {text:chosen.join('\n\n')+suffix,shortened:true};
}
