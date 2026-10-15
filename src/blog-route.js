export const validBlogId=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
export function blogRoute(params){
 const id=params.get('id'),author=params.get('author');
 if(id!==null){if(!validBlogId(id))throw Error('Article not found.');return {kind:'article',id,author:validBlogId(author)?author:null};}
 if(author!==null&&!validBlogId(author))throw Error('Invalid blog collection link.');
 return {kind:'collection',id:null,author};
}
export function articlePageURL(id){if(!validBlogId(id))throw Error('Invalid article link.');return 'https://iqbalpk.github.io/CreativeRelay/blog.html?id='+id;}
