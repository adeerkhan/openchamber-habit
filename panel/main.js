(()=>{var b="openchamber.sdk",k=1;var $_=`
:root {
  --oc-scrollbar-thumb: color-mix(in srgb, var(--oc-muted, currentColor) 40%, transparent);
  --oc-scrollbar-thumb-hover: color-mix(in srgb, var(--oc-muted, currentColor) 65%, transparent);
  scrollbar-gutter: stable;
}
* {
  scrollbar-width: thin;
  scrollbar-color: var(--oc-scrollbar-thumb) transparent;
}
/* Chromium's standard scrollbar properties otherwise override its pseudo-elements. */
@supports selector(::-webkit-scrollbar) {
  * { scrollbar-width: auto; scrollbar-color: auto; }
  ::-webkit-scrollbar { width: 6px; height: 6px; background: transparent; }
  :root::-webkit-scrollbar, body::-webkit-scrollbar { background: var(--oc-bg, inherit); }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb {
    background: var(--oc-scrollbar-thumb);
    border-radius: 999px;
    min-width: 24px;
    min-height: 24px;
  }
  ::-webkit-scrollbar-thumb:hover { background: var(--oc-scrollbar-thumb-hover); }
  ::-webkit-scrollbar-corner { background: transparent; }
  ::-webkit-scrollbar-button { display: none; width: 0; height: 0; }
}
@media (forced-colors: active) {
  * { scrollbar-color: auto; }
  ::-webkit-scrollbar-thumb, ::-webkit-scrollbar-thumb:hover { background: CanvasText; }
}
`;var B_=128,z_=65536;var t_=["file","directory","other","missing"],K_=(_)=>Boolean(_&&"sessionId"in _),Z_=(_)=>Boolean(_&&"sent"in _&&!("sessionId"in _));var s_=16000,e_=128,_S=200,SS=2000,TS=16000,fS=80,AS=200,ES=16000;var bS=2000;var P_=20000,f_=1024,A_=2000000;var E_=64000,b_=8000,J_=4000;var F_=90000;var kS=999,W_=500,GS=["HOST_UNAVAILABLE","HOST_TIMEOUT","HOST_REJECTED","DISCONNECTED","DISABLED","BAD_PATH","NO_INTEGRATION","NO_SERVICE","SERVICE_FAILED","NO_SESSION","SESSION_BUSY","NOT_GRANTED","NO_DIRECTORY","NOT_FOUND","FILE_TOO_LARGE","DENIED","NO_MODEL","MODEL_FAILED"],US=["stopped","starting","ready","failed"],KS=new Set(GS),MS=(_)=>KS.has(_),CS=(_)=>_&&MS(_)?_:"HOST_REJECTED",o=(_)=>{if(_===void 0)return!1;if(_===null||_===!0||_===!1)return!0;if(String(_)===_)return!0;if(Number(_)===_)return Number.isFinite(_);if(Array.isArray(_))return _.every(o);if(Object(_)===_)return Object.values(_).every(o);return!1},XS=(_)=>o(_)&&JSON.stringify(_).length<=ES,r_=(_)=>_?.trim().slice(0,AS)??"",v=(_)=>{let f=_.id.trim().slice(0,e_),F=_.title.trim().slice(0,_S),u=_.url.trim().slice(0,SS),H=_.text?.trim().slice(0,TS),V=_.author?.trim().slice(0,fS),I=_.kind==="pull"?"pull":"issue",Z={providerId:_.providerId.trim(),id:f,title:F||f,url:u,kind:I};if(H)Z.text=H;if(V)Z.author=V;if(I==="pull"){let j=r_(_.branches?.head),w=r_(_.branches?.base);if(j&&w)Z.branches={head:j,base:w}}if(XS(_.data))Z.data=_.data;return Z},c_=(_)=>{let f=v(_);if(_.projectId)f.projectId=_.projectId;if(_.navigation)f.navigation=_.navigation;if(_.worktree)f.worktree=_.worktree;return f},V_=(_)=>{let f={text:_.text.trim().slice(0,s_)};if(_.send)f.send=!0;return f},I_=(_)=>{if(_===null||!Number.isFinite(_))return null;return Math.min(kS,Math.max(0,Math.round(_)))};var l=(_)=>_.length>0&&_.length<=f_&&!_.includes("\x00")&&!_.includes("\\");var k_=(_)=>{if(!_.startsWith("/")||_.includes("\x00")||_.includes("\\")||_.includes("://"))return!1;if(_.length>bS)return!1;return!_.split("/").some((F)=>F==="."||F==="..")},ZS=new Set(US),j_=(_)=>Boolean(_&&"status"in _&&ZS.has(String(_.status))&&!("body"in _)),G_=(_)=>Boolean(_&&"status"in _&&"body"in _&&Number.isInteger(_.status)),w_=(_)=>Boolean(_&&"content"in _&&String(_.content)===_.content),x_=(_)=>Boolean(_&&"written"in _&&_.written===!0),H_=(_)=>Boolean(_&&"entries"in _&&Array.isArray(_.entries)),PS=new Set(t_),m_=(_)=>Boolean(_&&"kind"in _&&"size"in _&&PS.has(String(_.kind))&&Number.isFinite(_.size)),R_=(_)=>Boolean(_&&"text"in _&&String(_.text)===_.text&&!("status"in _)),JS=new Set(["workspace","ready","directory","session","connection","settings","session-lifecycle","item","resolve"]),FS=(_)=>Object(_)===_?_:null,Q_=(_)=>String(_)===_&&_.length>0,WS=(_)=>{if(!Q_(_.id))return null;if(_.ok===!0){let f={channel:b,v:k,type:"result",id:_.id,ok:!0};if(Object(_.payload)===_.payload)f.payload=_.payload;return f}if(_.ok===!1&&Q_(_.error))return{channel:b,v:k,type:"result",id:_.id,ok:!1,error:_.error,code:CS(Q_(_.code)?_.code:void 0)};return null},d_=(_)=>{let f=FS(_);if(!f||f.channel!==b||f.v!==k)return null;if(f.type==="result")return WS(f);if(!JS.has(String(f.type))||Object(f.payload)!==f.payload)return null;return f};class E extends Error{code;constructor(_,f){super(f);this.name="HostRequestError",this.code=_}}var OS=()=>Promise.reject(new E("BAD_PATH",'Request path must start with "/" and stay on the declared origin.')),U_=()=>Promise.reject(new E("BAD_PATH",`File path must be 1 to ${f_} characters without NUL or backslash.`)),U=(_)=>{return _.value+=1,`oc-${_.value}`},h_=(_={})=>{let f=_.target??("window"in globalThis?window:null);if(!f)throw new E("HOST_UNAVAILABLE","No window. connectHost runs in a browser frame.");let F=_.acceptSource??((S)=>S===f.parent),u=_.requestTimeoutMs??P_,H=new Set,V=new Set,I=new Set,Z=new Set,j=new Set,w=new Set,a=new Set,i=null,y=new Map,q=new Map,S_=!1,G={value:0},M=null,W=null,a_=(S)=>{if(!S)return null;return{sessionId:S.id,phase:S.busy?"started":"completed"}},g=(S)=>{f.parent.postMessage(S,"*")},Y=(S,T)=>{for(let A of S)try{A(T)}catch(D){console.error(D)}},i_=(S)=>{if(!(S instanceof MessageEvent))return;if(!F(S.source))return;let T=d_(S.data);if(!T)return;if(T.type==="workspace"){let D=q.get(T.payload.subscriptionId);if(D)Y([D],T.payload.snapshot);return}if(T.type==="ready"){if(M=T.payload,W=a_(T.payload.session),Y(H,T.payload),Y(V,T.payload.directory),Y(I,T.payload.session),W)Y(Z,W);Y(j,T.payload.connection),Y(w,T.payload.settings),Y(a,T.payload.item);return}if(T.type==="directory"){if(M)M={...M,directory:T.payload.directory};Y(V,T.payload.directory);return}if(T.type==="session"){if(M)M={...M,session:T.payload.session};if(!T.payload.session)W=null;else if(W?.sessionId!==T.payload.session.id)W=a_(T.payload.session);Y(I,T.payload.session);return}if(T.type==="session-lifecycle"){W=T.payload,Y(Z,T.payload);return}if(T.type==="connection"){if(M)M={...M,connection:T.payload.connection};Y(j,T.payload.connection);return}if(T.type==="settings"){if(M)M={...M,settings:T.payload.settings};Y(w,T.payload.settings);return}if(T.type==="item"){if(M)M={...M,item:T.payload.item};Y(a,T.payload.item);return}if(T.type==="resolve"){let D=(P)=>{g({channel:b,v:k,type:"resolve-result",id:T.id,payload:P})},x=i;if(!x){D({error:"This extension does not resolve commands."});return}Promise.resolve().then(()=>x(T.payload)).then((P)=>D({item:P?v(P):null}),(P)=>{let QS=(P instanceof Error?P.message:String(P)).trim();D({error:(QS||"Command failed.").slice(0,W_)})});return}let A=y.get(T.id);if(!A)return;if(clearTimeout(A.timer),y.delete(T.id),T.ok){A.resolve(T.payload);return}A.reject(new E(T.code,T.error))};f.addEventListener("message",i_),g({channel:b,v:k,type:"hello"});let B=(S,T=u)=>{if(S_||f.parent===f)return Promise.reject(new E("HOST_UNAVAILABLE","No host frame. This page is not in an iframe."));return new Promise((A,D)=>{let x=setTimeout(()=>{y.delete(S.id),D(new E("HOST_TIMEOUT","Host did not answer in time."))},T);y.set(S.id,{resolve:A,reject:D,timer:x}),g(S)})},z=(S)=>B(S).then(()=>{return}),m={channel:b,v:k},R=(S,T=1024)=>{if(!S.trim()||S.length>T)throw new E("HOST_REJECTED",`Identity must contain 1 to ${T} characters.`)},Y_=async(S)=>{if(S.kind!=="projects")R(S.projectId);let T=await B({...m,type:"workspace-read",id:U(G),payload:S});if(!T||!("kind"in T)||!("state"in T)||T.kind!==S.kind)throw new E("HOST_REJECTED","Host did not return workspace data.");return T},L_=async(S,T)=>{if(S.kind!=="projects")R(S.projectId);let A=U(G);q.set(A,T);try{await z({...m,type:"workspace-subscribe",id:U(G),payload:{subscriptionId:A,query:S}})}catch(D){if(q.delete(A),!S_)g({...m,type:"workspace-unsubscribe",id:U(G),payload:{subscriptionId:A}});throw D}return()=>{if(!q.delete(A)||S_)return;g({...m,type:"workspace-unsubscribe",id:U(G),payload:{subscriptionId:A}})}},T_=async(S)=>{if("key"in S&&(S.key.length===0||S.key.length>B_))throw new E("HOST_REJECTED","Storage key must contain 1 to 128 characters.");if(S.op==="set"&&!o(S.value))throw new E("HOST_REJECTED","Storage values must be JSON.");if(S.op==="set"&&new TextEncoder().encode(JSON.stringify(S.value)).length>z_)throw new E("HOST_REJECTED","Storage value exceeds 64 KiB.");let T=await B({...m,type:"storage",id:U(G),payload:S});if(!T||!("storage"in T)||T.op!==S.op)throw new E("HOST_REJECTED","Host did not return storage data.");return T};return{listProjects:async()=>{let S=await Y_({kind:"projects"});if(S.kind!=="projects")throw new E("HOST_REJECTED","Expected projects.");return S},listWorktrees:async(S)=>{let T=await Y_({kind:"worktrees",projectId:S});if(T.kind!=="worktrees")throw new E("HOST_REJECTED","Expected worktrees.");return T},listSessions:async(S)=>{let T=await Y_({kind:"sessions",projectId:S});if(T.kind!=="sessions")throw new E("HOST_REJECTED","Expected sessions.");return T},onProjects:(S)=>L_({kind:"projects"},(T)=>{if(T.kind==="projects")S(T)}),onWorktrees:(S,T)=>L_({kind:"worktrees",projectId:S},(A)=>{if(A.kind==="worktrees")T(A)}),onSessions:(S,T)=>L_({kind:"sessions",projectId:S},(A)=>{if(A.kind==="sessions")T(A)}),openSession:async(S)=>{R(S),await z({...m,type:"open-session",id:U(G),payload:{sessionId:S}})},storage:{get:async(S)=>{let T=await T_({op:"get",key:S});return T.op==="get"&&T.found?T.value:void 0},set:async(S,T)=>{await T_({op:"set",key:S,value:T})},delete:async(S)=>{await T_({op:"delete",key:S})},keys:async()=>{let S=await T_({op:"keys"});if(S.op!=="keys")throw new E("HOST_REJECTED","Expected storage keys.");return S.keys}},onReady:(S)=>{if(H.add(S),M)S(M);return()=>{H.delete(S)}},onDirectory:(S)=>{if(V.add(S),M)S(M.directory);return()=>{V.delete(S)}},onSession:(S)=>{if(I.add(S),M)S(M.session);return()=>{I.delete(S)}},onSessionLifecycle:(S)=>{if(Z.add(S),W)S(W);return()=>{Z.delete(S)}},onConnection:(S)=>{if(j.add(S),M)S(M.connection);return()=>{j.delete(S)}},onSettings:(S)=>{if(w.add(S),M)S(M.settings);return()=>{w.delete(S)}},onItem:(S)=>{if(a.add(S),M)S(M.item);return()=>{a.delete(S)}},onResolve:(S)=>{return i=S,()=>{if(i===S)i=null}},toast:(S)=>z({channel:b,v:k,type:"toast",id:U(G),payload:S}),openUrl:(S)=>z({channel:b,v:k,type:"open-url",id:U(G),payload:{url:S}}),openSurface:(S)=>z({channel:b,v:k,type:"open-surface",id:U(G),payload:{surfaceId:S}}),writeClipboard:(S)=>z({channel:b,v:k,type:"clipboard-write",id:U(G),payload:{text:S}}),compose:(S)=>z({channel:b,v:k,type:"compose",id:U(G),payload:S}),attach:(S)=>z({channel:b,v:k,type:"attach",id:U(G),payload:v(S)}),startSession:async(S)=>{if(S.projectId!==void 0)R(S.projectId);let T=S.worktree;if(T&&T!==!0)if(T.kind==="existing")R(T.directory);else{if(T.name!==void 0)R(T.name,200);if(T.baseBranch!==void 0)R(T.baseBranch,200)}let A=await B({channel:b,v:k,type:"start-session",id:U(G),payload:c_(S)},_.requestTimeoutMs??180000);if(!K_(A))throw new E("HOST_REJECTED","Host did not return a session.");return A},prompt:(S)=>B({channel:b,v:k,type:"prompt",id:U(G),payload:V_(S)}).then((T)=>{if(!Z_(T))throw new E("HOST_REJECTED","Host did not return a prompt result.");return T}),sessionLink:(S)=>z({channel:b,v:k,type:"session-link",id:U(G),payload:v(S)}),close:()=>z({channel:b,v:k,type:"close",id:U(G)}),oauthStart:()=>z({channel:b,v:k,type:"oauth-start",id:U(G)}),oauthDisconnect:()=>z({channel:b,v:k,type:"oauth-disconnect",id:U(G)}),request:(S)=>(k_(S.path)?B({channel:b,v:k,type:"request",id:U(G),payload:S}):OS()).then((T)=>{if(!G_(T))throw new E("HOST_REJECTED","Host request result was empty.");return T}),serviceRequest:(S)=>(k_(S.path)?B({channel:b,v:k,type:"service-request",id:U(G),payload:S}):OS()).then((T)=>{if(!G_(T))throw new E("HOST_REJECTED","Host service request result was empty.");return T}),serviceStatus:()=>B({channel:b,v:k,type:"service-status",id:U(G)}).then((S)=>{if(!j_(S))throw new E("HOST_REJECTED","Host did not return service status.");return S}),readFile:(S)=>(l(S)?B({channel:b,v:k,type:"file-read",id:U(G),payload:{path:S}}):U_()).then((T)=>{if(!w_(T))throw new E("HOST_REJECTED","Host did not return file content.");return T}),writeFile:(S,T)=>{if(!l(S))return U_();if(T.length>A_)return Promise.reject(new E("FILE_TOO_LARGE",`Content is over ${A_} characters.`));return B({channel:b,v:k,type:"file-write",id:U(G),payload:{path:S,content:T}}).then((A)=>{if(!x_(A))throw new E("HOST_REJECTED","Host did not confirm the write.");return A})},listDir:(S)=>(l(S)?B({channel:b,v:k,type:"file-list",id:U(G),payload:{path:S}}):U_()).then((T)=>{if(!H_(T))throw new E("HOST_REJECTED","Host did not return directory entries.");return T}),stat:(S)=>(l(S)?B({channel:b,v:k,type:"file-stat",id:U(G),payload:{path:S}}):U_()).then((T)=>{if(!m_(T))throw new E("HOST_REJECTED","Host did not return file status.");return T}),generate:(S)=>{let T=S.prompt.trim(),A=S.system?.trim();if(T.length===0||T.length>E_)return Promise.reject(new E("HOST_REJECTED",`Prompt must be 1 to ${E_} characters.`));if(A!==void 0&&(A.length===0||A.length>b_))return Promise.reject(new E("HOST_REJECTED",`System prompt must be 1 to ${b_} characters.`));let D=S.maxOutputTokens===void 0?void 0:Math.min(J_,Math.max(1,Math.floor(S.maxOutputTokens)));if(D!==void 0&&!Number.isFinite(D))return Promise.reject(new E("HOST_REJECTED","maxOutputTokens must be a number."));let x={prompt:T};if(A!==void 0)x.system=A;if(D!==void 0)x.maxOutputTokens=D;return B({channel:b,v:k,type:"generate",id:U(G),payload:x},_.requestTimeoutMs??F_).then((P)=>{if(!R_(P))throw new E("HOST_REJECTED","Host did not return generated text.");return P})},setBadge:(S)=>z({channel:b,v:k,type:"badge",id:U(G),payload:{count:I_(S)}}),dispose:()=>{for(let S of q.keys())g({...m,type:"workspace-unsubscribe",id:U(G),payload:{subscriptionId:S}});q.clear(),S_=!0,i=null,f.removeEventListener("message",i_);for(let S of y.values())clearTimeout(S.timer),S.reject(new E("HOST_UNAVAILABLE","Host client was disposed."));y.clear(),H.clear(),V.clear(),I.clear(),Z.clear(),j.clear(),w.clear(),a.clear()}}};var cS=[["--oc-bg","background"],["--oc-elevated","elevated"],["--oc-fg","foreground"],["--oc-muted","muted"],["--oc-subtle","subtle"],["--oc-border","border"],["--oc-hover","hover"],["--oc-selection","selection"],["--oc-focus","focus"],["--oc-primary","primary"],["--oc-muted-surface","mutedSurface"],["--oc-elevated-fg","elevatedForeground"],["--oc-active","active"],["--oc-selection-fg","selectionForeground"],["--oc-primary-fg","primaryForeground"],["--oc-primary-text","primaryText"],["--oc-success-text","successText"],["--oc-warning-text","warningText"],["--oc-error-text","errorText"],["--oc-info-text","infoText"],["--oc-success","success"],["--oc-warning","warning"],["--oc-error","error"],["--oc-info","info"],["--oc-font","font"],["--oc-mono","mono"],["--oc-radius","radius"],["--surface-background","background"],["--surface-elevated","elevated"],["--surface-foreground","foreground"],["--surface-muted-foreground","muted"],["--surface-subtle","subtle"],["--interactive-border","border"],["--interactive-hover","hover"],["--interactive-selection","selection"],["--interactive-focus-ring","focus"],["--primary","primary"],["--surface-muted","mutedSurface"],["--surface-elevated-foreground","elevatedForeground"],["--interactive-active","active"],["--interactive-selection-foreground","selectionForeground"],["--primary-foreground","primaryForeground"],["--primary-text","primaryText"],["--success-text","successText"],["--warning-text","warningText"],["--error-text","errorText"],["--info-text","infoText"],["--status-success","success"],["--status-warning","warning"],["--status-error","error"],["--status-info","info"],["--font-sans","font"],["--font-mono","mono"],["--radius","radius"]],DS=(_,f)=>{f.style.colorScheme=_.mode;for(let[F,u]of cS)f.style.setProperty(F,_.tokens[u]);f.style.setProperty("font-family",_.tokens.font),f.style.setProperty("font-size","0.875rem"),f.style.setProperty("line-height","1.45"),f.style.setProperty("color",_.tokens.foreground)},p_=(_,f)=>{if(DS(_.theme,f),f.dataset)f.dataset.ocSurface=_.surface,f.dataset.ocTheme=_.theme.mode};var VS={"surface-background":"bg","surface-elevated":"elevated","surface-elevated-foreground":"elevated-fg","surface-foreground":"fg","surface-muted-foreground":"muted","surface-muted":"muted-surface","surface-subtle":"subtle","interactive-border":"border","interactive-hover":"hover","interactive-active":"active","interactive-selection":"selection","interactive-selection-foreground":"selection-fg","interactive-focus-ring":"focus",primary:"primary","primary-foreground":"primary-fg","primary-text":"primary-text","success-text":"success-text","warning-text":"warning-text","error-text":"error-text","info-text":"info-text","status-success":"success","status-warning":"warning","status-error":"error","status-info":"info","font-sans":"font","font-mono":"mono",radius:"radius"},C=(_,f)=>`var(--${_}, var(--oc-${VS[_]}, ${f}))`,d=C("surface-background","transparent"),M_=C("surface-elevated","transparent"),r=C("surface-elevated-foreground","inherit"),t=C("surface-foreground","inherit"),X=C("surface-muted-foreground","gray"),IS=C("surface-muted","transparent"),K=C("interactive-border","currentColor"),Q=C("interactive-hover","transparent"),h=C("interactive-active","transparent"),y_=C("interactive-selection","transparent"),q_=C("interactive-selection-foreground","inherit"),LS=C("interactive-focus-ring","currentColor"),J=C("primary","currentColor"),g_=C("primary-text","inherit"),o_=C("error-text","inherit"),jS=C("font-sans","inherit"),v_=C("font-mono","monospace"),NS=C("radius","9px"),O=(_,f,F="transparent")=>`color-mix(in srgb, ${_} ${f}%, ${F})`,YS=`box-shadow: 0 0 0 2px ${LS};`,C_=(_)=>{let f=C(`status-${_}`,"currentColor");return`
.oc-sdk[data-tone="${_}"], .oc-sdk [data-tone="${_}"] { --oc-sdk-tone: ${f}; --oc-sdk-tone-text: ${C(`${_}-text`,"inherit")}; }`},N=`
${$_}
.oc-sdk { box-sizing: border-box; color: ${t}; font-family: ${jS}; font-size: 0.875rem; line-height: 1.45; }
.oc-sdk *, .oc-sdk *::before, .oc-sdk *::after { box-sizing: border-box; }
/* :where() keeps the reset at zero specificity so every primitive class below overrides it. */
:where(.oc-sdk) :where(button, input, textarea), :where(button.oc-sdk, input.oc-sdk, textarea.oc-sdk) { font: inherit; color: inherit; margin: 0; }
:where(.oc-sdk) :where(button), :where(button.oc-sdk) { cursor: pointer; background: none; border: 0; padding: 0; }
.oc-sdk button:disabled, button.oc-sdk:disabled, .oc-sdk[aria-disabled="true"], .oc-sdk [aria-disabled="true"] { opacity: .5; pointer-events: none; }
.oc-sdk :focus-visible { outline: none; ${YS} }
.oc-sdk-mono { font-family: ${v_}; }
.oc-sdk-muted { color: ${X}; }
${C_("success")}${C_("warning")}${C_("error")}${C_("info")}
.oc-sdk[data-tone="primary"], .oc-sdk [data-tone="primary"] { --oc-sdk-tone: ${J}; --oc-sdk-tone-text: ${g_}; }

.oc-sdk-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 36px; padding: 0 14px; border: 1px solid transparent; border-radius: ${NS}; font-size: 0.875rem; font-weight: 500; line-height: 1; white-space: nowrap; transition: background 150ms ease-out, color 150ms ease-out; }
.oc-sdk-btn[data-size="sm"] { height: 32px; padding: 0 10px; font-size: 0.8125rem; }
.oc-sdk-btn[data-size="xs"] { height: 24px; padding: 0 8px; font-size: 0.75rem; border-radius: 6px; }
.oc-sdk-btn[data-variant="default"] { color: ${g_}; background: ${O(J,10,d)}; border-color: ${O(J,12)}; }
.oc-sdk-btn[data-variant="default"]:hover { background: ${O(J,16,d)}; }
.oc-sdk-btn[data-variant="default"]:active { background: ${O(J,22,d)}; }
.oc-sdk-btn[data-variant="secondary"] { background: ${IS}; color: var(--oc-fg); }
.oc-sdk-btn[data-variant="secondary"]:hover { background-image: linear-gradient(${Q}, ${Q}); }
.oc-sdk-btn[data-variant="secondary"]:active { background-image: linear-gradient(${h}, ${h}); }
.oc-sdk-btn[data-variant="outline"] { background: ${M_}; color: ${r}; border-color: ${K}; }
.oc-sdk-btn[data-variant="outline"]:hover { background-image: linear-gradient(${Q}, ${Q}); }
.oc-sdk-btn[data-variant="outline"]:active { background-image: linear-gradient(${h}, ${h}); }
.oc-sdk-btn[data-variant="ghost"] { background: transparent; }
.oc-sdk-btn[data-variant="ghost"]:hover { background: ${Q}; }
.oc-sdk-btn[data-variant="ghost"]:active { background: ${h}; }
.oc-sdk-btn[data-variant="destructive"] { --oc-sdk-tone: ${C("status-error","red")}; color: ${o_}; background: ${O("var(--oc-sdk-tone)",7,d)}; border-color: ${O("var(--oc-sdk-tone)",12)}; }
.oc-sdk-btn[data-variant="destructive"]:hover { background: ${O("var(--oc-sdk-tone)",9,d)}; }
.oc-sdk-btn[data-variant="destructive"]:active { background: ${O("var(--oc-sdk-tone)",11,d)}; }
.oc-sdk-btn[data-loading="true"] { opacity: .5; pointer-events: none; }
.oc-sdk-btn > .oc-sdk-spinner-ring { width: 14px; height: 14px; }

.oc-sdk-field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.oc-sdk-field-label { font-size: 0.8125rem; font-weight: 500; }
.oc-sdk-field-note { font-size: 0.75rem; color: ${X}; }
.oc-sdk-field[data-invalid="true"] .oc-sdk-field-note { color: ${o_}; }
.oc-sdk-input { display: block; width: 100%; min-width: 0; height: 36px; padding: 0 12px; border: 0; border-radius: ${NS}; background: ${M_}; color: ${r}; font-size: 0.875rem; line-height: 1.45; appearance: none; box-shadow: inset 0 0 0 1px ${O(K,60)}; transition: background 150ms ease-out, box-shadow 150ms ease-out; }
textarea.oc-sdk-input { height: auto; padding: 8px 12px; resize: vertical; }
.oc-sdk-input::placeholder { color: ${X}; }
.oc-sdk-input:hover:not(:focus) { background-image: linear-gradient(${Q}, ${Q}); }
.oc-sdk-input:focus, .oc-sdk-input:focus-visible { box-shadow: inset 0 0 0 2px ${LS}; }
.oc-sdk-field[data-invalid="true"] .oc-sdk-input { box-shadow: inset 0 0 0 1px ${C("status-error","red")}; }
.oc-sdk-field[data-invalid="true"] .oc-sdk-input:focus { box-shadow: inset 0 0 0 2px ${C("status-error","red")}; }
.oc-sdk-input[data-mono="true"] { font-family: ${v_}; }

.oc-sdk-search { position: relative; min-width: 0; }
.oc-sdk-search .oc-sdk-input { padding-left: 34px; padding-right: 34px; }
.oc-sdk-search-icon { position: absolute; left: 11px; top: 50%; transform: translateY(-50%); color: ${X}; pointer-events: none; }
.oc-sdk-search[data-active="true"] .oc-sdk-search-icon { color: ${J}; }
.oc-sdk-search-clear { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); display: none; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 6px; color: ${X}; }
.oc-sdk-search[data-active="true"] .oc-sdk-search-clear { display: inline-flex; }
.oc-sdk-search-clear:hover { background: ${Q}; color: ${t}; }

.oc-sdk-select { position: relative; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.oc-sdk-trigger { display: inline-flex; align-items: center; gap: 6px; width: 100%; min-width: 0; height: 32px; padding: 0 8px 0 10px; border: 1px solid ${K}; border-radius: 6px; background: ${M_}; color: ${r}; font-size: 0.8125rem; text-align: left; transition: background 150ms ease-out; }
.oc-sdk-trigger:hover { background-image: linear-gradient(${Q}, ${Q}); }
.oc-sdk-trigger[aria-expanded="true"] { background-image: linear-gradient(${h}, ${h}); }
.oc-sdk-trigger-value { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.oc-sdk-trigger-value[data-empty="true"] { color: ${X}; }
.oc-sdk-trigger-chevron { flex: 0 0 auto; color: ${X}; }
.oc-sdk-popup { --surface-foreground: ${r}; position: fixed; z-index: 50; display: flex; flex-direction: column; gap: 2px; min-width: 160px; max-width: calc(100vw - 16px); max-height: min(320px, calc(100vh - 16px)); overflow: auto; padding: 4px; border: 1px solid ${O(K,60)}; border-radius: 12px; background: ${M_}; color: ${r}; box-shadow: 0 8px 24px ${O(t,12)}; }
.oc-sdk-popup-search { flex: 0 0 auto; padding: 2px 2px 4px; }
.oc-sdk-popup-search .oc-sdk-input { height: 32px; font-size: 0.8125rem; }
.oc-sdk-option { display: flex; align-items: center; gap: 8px; width: 100%; padding: 6px 8px; border-radius: 8px; font-size: 0.8125rem; text-align: left; }
.oc-sdk-option[data-active="true"] { background: ${Q}; }
.oc-sdk-option[aria-selected="true"] { background: ${y_}; color: ${q_}; }
.oc-sdk-option[data-destructive="true"] { color: ${o_}; }
.oc-sdk-option[data-destructive="true"][data-active="true"] { background: ${O(C("status-error","red"),10)}; }
.oc-sdk-option-label { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.oc-sdk-option-hint { flex: 0 0 auto; font-size: 0.75rem; color: ${X}; }
.oc-sdk-option-check { flex: 0 0 auto; width: 12px; }
.oc-sdk-popup-empty { padding: 8px; font-size: 0.8125rem; color: ${X}; }

.oc-sdk-check { display: inline-flex; align-items: flex-start; gap: 8px; width: 100%; text-align: left; }
.oc-sdk-check-box { flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; width: 14px; height: 14px; margin-top: 3px; border: 1px solid ${K}; border-radius: 4px; color: ${J}; transition: border-color 150ms ease-out; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-box { border-color: ${O(J,65,K)}; }
.oc-sdk-check-box > svg { display: none; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-box > svg { display: block; }
.oc-sdk-check-thumb { flex: 0 0 auto; position: relative; width: 36px; height: 20px; border-radius: 9999px; background: ${K}; transition: background 150ms ease-out; }
.oc-sdk-check-thumb::after { content: ""; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 9999px; background: ${d}; transition: transform 150ms ease-out; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-thumb { background: ${J}; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-thumb::after { transform: translateX(16px); }
.oc-sdk-check:focus-visible { box-shadow: none; }
.oc-sdk-check:focus-visible .oc-sdk-check-box, .oc-sdk-check:focus-visible .oc-sdk-check-thumb { ${YS} }
.oc-sdk-check-text { display: flex; flex-direction: column; min-width: 0; }
.oc-sdk-check-label { font-size: 0.875rem; }
.oc-sdk-check-desc { font-size: 0.75rem; color: ${X}; }

.oc-sdk-tabs { display: inline-flex; gap: 2px; padding: 2px; border-radius: 10px; max-width: 100%; overflow: auto; }
.oc-sdk-tabs[data-track="true"] { background: ${O(t,4)}; }
.oc-sdk-tab { display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 10px; border: 1px solid transparent; border-radius: 8px; font-size: 0.8125rem; font-weight: 500; color: ${X}; white-space: nowrap; transition: color 150ms ease-out, background 150ms ease-out; }
.oc-sdk-tab:hover { color: ${t}; }
.oc-sdk-tab[aria-selected="true"] { color: ${q_}; background: ${y_}; border-color: ${K}; }
.oc-sdk-tab-count { font-size: 0.75rem; font-variant-numeric: tabular-nums; color: ${X}; }

.oc-sdk-badge { display: inline-flex; align-items: center; padding: 1px 6px; border-radius: 9999px; font-size: 11px; font-weight: 500; line-height: 16px; white-space: nowrap; background: ${Q}; color: ${X}; }
.oc-sdk-badge[data-tone] { color: var(--oc-sdk-tone-text, var(--oc-sdk-tone)); background: ${O("var(--oc-sdk-tone)",15)}; }

.oc-sdk-list { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.oc-sdk-row { display: flex; align-items: center; gap: 8px; width: 100%; padding: 6px 8px; border-radius: 6px; text-align: left; transition: background 120ms ease-out; }
.oc-sdk-row:hover, .oc-sdk-row[data-active="true"] { background: ${Q}; }
.oc-sdk-row[aria-selected="true"] { background: ${y_}; color: ${q_}; }
.oc-sdk-row-lead { flex: 0 0 auto; width: 64px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: ${v_}; font-size: 0.75rem; color: ${X}; }
.oc-sdk-row-main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; }
.oc-sdk-row-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.oc-sdk-row-sub { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.75rem; color: ${X}; }
.oc-sdk-row-meta { flex: 0 0 auto; font-size: 0.75rem; font-variant-numeric: tabular-nums; color: ${X}; }
.oc-sdk-row[aria-selected="true"] .oc-sdk-row-lead, .oc-sdk-row[aria-selected="true"] .oc-sdk-row-sub, .oc-sdk-row[aria-selected="true"] .oc-sdk-row-meta { color: inherit; opacity: .75; }
.oc-sdk-list-empty { padding: 16px 8px; text-align: center; font-size: 0.8125rem; color: ${X}; }

.oc-sdk-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; padding: 40px 16px; text-align: center; }
.oc-sdk-empty-title { margin: 0; font-size: 0.8125rem; font-weight: 600; }
.oc-sdk-empty-body { margin: 0; max-width: 32rem; font-size: 0.8125rem; color: ${X}; }
.oc-sdk-empty-action { margin-top: 12px; }

@keyframes oc-sdk-spin { to { transform: rotate(360deg); } }
.oc-sdk-spinner { display: inline-flex; align-items: center; gap: 8px; font-size: 0.8125rem; color: ${X}; }
.oc-sdk-spinner-ring { width: 16px; height: 16px; border: 2px solid ${K}; border-top-color: ${J}; border-radius: 9999px; animation: oc-sdk-spin .8s linear infinite; }
.oc-sdk-spinner[data-size="sm"] .oc-sdk-spinner-ring { width: 12px; height: 12px; }

.oc-sdk-banner { display: flex; align-items: flex-start; gap: 12px; padding: 8px 12px; border: 1px solid ${O("var(--oc-sdk-tone)",40)}; border-radius: 8px; background: ${O("var(--oc-sdk-tone)",10)}; }
.oc-sdk-banner-text { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.oc-sdk-banner-title { font-size: 0.8125rem; font-weight: 500; color: var(--oc-sdk-tone-text, var(--oc-sdk-tone)); }
.oc-sdk-banner-body { font-size: 0.8125rem; color: ${X}; }
.oc-sdk-banner-action { flex: 0 0 auto; }

.oc-sdk-separator { display: flex; align-items: center; gap: 8px; width: 100%; margin: 8px 0; font-size: 0.75rem; color: ${X}; }
.oc-sdk-separator::before, .oc-sdk-separator::after { content: ""; flex: 1 1 auto; height: 1px; background: ${O(K,40)}; }
.oc-sdk-separator[data-labeled="false"]::after { display: none; }
.oc-sdk-popup > .oc-sdk-separator { margin: 4px 0; }

.oc-sdk-progress { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.oc-sdk-progress-label { display: flex; justify-content: space-between; font-size: 0.75rem; color: ${X}; font-variant-numeric: tabular-nums; }
.oc-sdk-progress-track { height: 6px; border-radius: 9999px; background: ${K}; overflow: hidden; }
.oc-sdk-progress-fill { height: 100%; border-radius: 9999px; background: var(--oc-sdk-tone, ${J}); transform-origin: left; transition: transform 200ms ease-out; }

.oc-sdk-menu { position: relative; display: inline-flex; }

.oc-sdk-text { white-space: pre-wrap; overflow-wrap: anywhere; }
.oc-sdk-text a { color: ${g_}; text-decoration: underline; text-underline-offset: 2px; }
.oc-sdk-text img { display: block; max-width: 100%; margin: 8px 0; border-radius: 8px; border: 1px solid ${O(K,60)}; }
`;var n_=h_(),__=document.querySelector("#root");if(!__)throw Error("Missing root");__.innerHTML='<main style="padding:12px;display:grid;gap:12px;max-width:100%;box-sizing:border-box;"><section data-view="session"></section><section data-view="turns"></section><section data-view="tokens"></section></main>';var e=(_)=>_.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"),BS=__.querySelector('[data-view="session"]'),RS=__.querySelector('[data-view="turns"]'),dS=__.querySelector('[data-view="tokens"]'),p=null,s=[],u_=()=>{if(!p){BS.innerHTML='<h2 style="font-size:13px;margin:0 0 4px;">Current session</h2><p>No session open.</p>';return}let _=p.model?e(p.model):"unknown model";BS.innerHTML=`<h2 style="font-size:13px;margin:0 0 4px;">Current session</h2><p style="margin:0;"><strong>${e(p.title||"Untitled")}</strong></p><p style="margin:4px 0 0;opacity:0.75;">${e(_)} · ${p.busy?"working":"idle"}</p>`},zS=()=>{let _=s.slice(-8).reverse().map((f)=>`<li>${e(new Date(f.at).toLocaleTimeString())} — ${e(f.text)}</li>`).join("");RS.innerHTML='<h2 style="font-size:13px;margin:0 0 4px;">Turns</h2>'+(_===""?"<p>No turns observed yet.</p>":`<ul style="margin:0;padding-left:18px;">${_}</ul>`)},hS=()=>{dS.innerHTML='<h2 style="font-size:13px;margin:0 0 4px;">Tokens</h2><p style="margin:0;opacity:0.75;">Live token throughput is not exposed to extensions yet. See the OpenChamber status bar for the native indicator.</p>'};u_();zS();hS();n_.onReady((_)=>{p_(_,document.documentElement),p=_.session,u_()});n_.onSession((_)=>{p=_,u_()});n_.onSessionLifecycle((_)=>{let f=_.phase==="started"?"turn started":_.phase==="completed"?"turn completed":"turn failed";if(s.push({at:Date.now(),text:`${f} (${_.sessionId.slice(0,8)})`}),s.length>50)s.splice(0,s.length-50);zS()});})();
