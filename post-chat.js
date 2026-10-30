// A listing is attached to the actual message, rather than inferred from a person/thread.
let chatPostContext=null;
function renderChatPostCard(post){
 const card=node(post.unavailable?'div':'button',undefined,'chat-post-card'+(post.unavailable?' unavailable':''));if(!post.unavailable){card.type='button';card.onclick=()=>void openListing(post.id).catch(e=>toast(e.message));card.setAttribute('aria-label','Open '+post.listing_code+' · '+post.title)}
 if(post.thumbnail){const image=node('img');image.src=post.thumbnail;image.alt='Listing photo';image.loading='lazy';image.decoding='async';card.append(image)}else card.append(node('span','▧','chat-post-placeholder'));
 const copy=node('span',undefined,'chat-post-copy');copy.append(node('small',post.listing_code||'Post reference'),node('strong',post.unavailable?'Post is no longer available':post.title));if(!post.unavailable)copy.append(node('small',[(post.post_intent==='need'?'Need Post':'Sell Post'),post.price!==null&&post.price!==undefined?formatPrice(post.price,post.price_format):'',post.availability==='sold'?'Sold out':''].filter(Boolean).join(' · ')));card.append(copy);return card;
}
function clearChatPostContext(){chatPostContext=null;const root=$('chatPostReference');if(root){root.replaceChildren();root.hidden=true}}
function setChatPostContext(post){
 if(chat?.kind!=='private')return;const image=post.media?.find(a=>a.type.startsWith('image/'));chatPostContext={...post,listing_code:post.listing_code||'Post reference',thumbnail:image?.url};const root=$('chatPostReference'),heading=node('div',undefined,'chat-post-reference-heading');heading.append(node('span','Messaging about this post'),button('×',clearChatPostContext,'clear-chat-post'));root.replaceChildren(heading,renderChatPostCard(chatPostContext));root.hidden=false;
}
async function sendChatWithPost(path,text,context){const post=chat?.kind==='private'?chatPostContext:null;await api(path,{text,...(post?{postId:post.id}:{})});if(post&&sameComposer(context)&&chatPostContext?.id===post.id)clearChatPostContext()}
