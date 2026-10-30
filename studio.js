$('heroCreatePost').onclick=toggleCreateMenu;
$('studioAccount').onclick=()=>navigate('profile');
function paintStudioIdentity(){const root=$('studioAccount');if(!root)return;if(me)root.replaceChildren(avatar(me));else{root.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 22v-3c0-7 16-7 16 0v3"/></svg>'}root.setAttribute('aria-label',me?'Open your profile':'Sign in to your profile')}
paintStudioIdentity();
