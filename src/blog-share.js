export function blogShareText(title,article,link=''){
 const heading=String(title||'').trim(),body=String(article||'').trim();if(!heading||!body)throw Error('Add the blog title and full article.');
 const first=body.split('\n')[0].trim(),content=first.toLocaleLowerCase()===heading.toLocaleLowerCase()?body:heading+'\n\n'+body;
 return content+(link?'\n\n'+link:'');
}
export function assertBlogPostFits(text,platform){const limit=platform==='LinkedIn'?3000:10000;if(text.length>limit)throw Error('The full '+platform+' post is '+text.length.toLocaleString()+' characters. Keep title, article and any link within '+limit.toLocaleString()+'. Nothing was shortened or published.');}
