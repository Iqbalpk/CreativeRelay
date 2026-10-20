// Suggestions remain separate from the draft until the user applies them.
export function mountCaptionRefinement({root,request,context,apply,notice}){
 let history=[],suggestion=null,busy=false,conversationIdentity=null;
 root.innerHTML='<details><summary>Refine with Gemini</summary><p class="muted">Ask for changes to this channel’s title and caption. Review the suggestion before applying. Uses Gemini quota.</p><div data-chat role="log" aria-live="polite"></div><label>What would you like to change?<textarea data-instruction maxlength="2000" placeholder="Make the title stronger and the caption more concise"></textarea></label><button type="button" data-send>Ask Gemini</button><div data-suggestion hidden><label>Suggested title<input data-title maxlength="300"></label><label>Suggested caption<textarea data-caption></textarea></label><button type="button" data-apply>Apply suggestion</button><button type="button" class="secondary" data-discard>Discard suggestion</button></div></details>';
 const q=s=>root.querySelector(s),log=q('[data-chat]'),send=q('[data-send]');
 const add=(who,text)=>{const p=document.createElement('p');p.textContent=who+': '+text;log.append(p);};
 q('[data-discard]').onclick=()=>{suggestion=null;q('[data-suggestion]').hidden=true;};
 send.onclick=async()=>{
  if(busy)return;const instruction=q('[data-instruction]').value.trim();if(!instruction)return;
  const snapshot=context();if(conversationIdentity!==snapshot.identity){history=[];suggestion=null;log.replaceChildren();q('[data-suggestion]').hidden=true;conversationIdentity=snapshot.identity;}busy=true;send.disabled=true;send.textContent='Thinking…';
  try{const result=await request({...snapshot,refinement:{instruction,history:history.slice(-6),title:suggestion?.title??snapshot.draftTitle,caption:suggestion?.caption??snapshot.draftCaption}});
   if(!root.isConnected||context().identity!==snapshot.identity)throw Error('The draft changed. Ask again for the current text.');
   if(typeof result.title!=='string'||typeof result.caption!=='string'||!result.caption.trim())throw Error('Gemini returned an incomplete suggestion.');
   add('You',instruction);add('Gemini','Suggested a revised title and caption below.');history.push({role:'user',text:instruction},{role:'assistant',text:JSON.stringify(result)});history=history.slice(-6);
   suggestion={...result,identity:snapshot.identity};q('[data-title]').value=result.title;q('[data-caption]').value=result.caption;q('[data-suggestion]').hidden=false;q('[data-instruction]').value='';
  }catch(e){notice('Gemini: '+e.message);}finally{busy=false;send.disabled=false;send.textContent='Ask Gemini';}
 };
 q('[data-apply]').onclick=()=>{if(!suggestion)return;if(context().identity!==suggestion.identity)return notice('Your draft changed. Ask Gemini again before applying.');apply({title:q('[data-title]').value,caption:q('[data-caption]').value});};
}
